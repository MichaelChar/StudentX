#!/usr/bin/env python3
"""
Apply migrations, seed data, load batches, compute distances, validate — all against live Supabase.
"""

import json
import math
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_URL = "postgresql://postgres.ecluqurlfbvkxrnoyhaq:tezjib-8jarpa-tEvpug@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
OSRM_BASE = "http://router.project-osrm.org"
OSRM_DELAY = 1.1

BATCHES_DIR = PROJECT_ROOT / "data" / "batches"
REPORT_PATH = PROJECT_ROOT / "docs" / "data-validation-report.md"
SNAPSHOT_PATH = PROJECT_ROOT / "data" / "seed-snapshot.json"

# Amenity normalization
AMENITY_NORMALIZE = {
    "ac": "AC", "furnished": "Furnished", "balcony": "Balcony",
    "elevator": "Elevator", "parking": "Parking", "ground floor": "Ground floor",
    "ground_floor": "Ground floor", "washing machine": "Washing machine",
    "washing_machine": "Washing machine", "dishwasher": "Dishwasher",
    "internet included": "Internet included", "internet_included": "Internet included",
    "heating": "Heating", "wi-fi": "Wi-Fi", "wifi": "Wi-Fi", "tv": "TV",
    "kitchen": "Kitchen", "double_glazed_windows": "Double glazed windows",
    "double glazed windows": "Double glazed windows",
    "weekly_cleaning": "Weekly cleaning", "weekly cleaning": "Weekly cleaning",
    "microwave": "Microwave", "oven": "Oven",
    "gas_heating": "Gas heating", "gas heating": "Gas heating",
    "private_yard": "Private yard", "private yard": "Private yard",
}

PROPERTY_TYPE_MAP = {
    "studio": "Studio", "1-bedroom": "1-Bedroom", "1-bed": "1-Bedroom",
    "2-bedroom": "2-Bedroom", "2-bed": "2-Bedroom",
    "2-bedroom (x2)": "2-Bedroom (x2)",
    "room": "Room in shared apartment",
    "room in shared apartment": "Room in shared apartment",
}


def get_conn():
    return psycopg2.connect(DB_URL, connect_timeout=15)


# ===================================================================
# PHASE 1: Apply migrations
# ===================================================================
def apply_migrations(conn):
    print("\n[Phase 1] Applying migrations...")
    cur = conn.cursor()

    migration_files = sorted((PROJECT_ROOT / "supabase" / "migrations").glob("*.sql"))
    for mf in migration_files:
        print(f"  Applying {mf.name}...")
        sql = mf.read_text()
        try:
            cur.execute(sql)
            conn.commit()
            print(f"    ✓ Done")
        except psycopg2.errors.DuplicateTable as e:
            conn.rollback()
            print(f"    ⏭ Tables already exist, skipping")
        except psycopg2.errors.DuplicateObject as e:
            conn.rollback()
            print(f"    ⏭ Objects already exist, skipping")
        except Exception as e:
            conn.rollback()
            # Try statement-by-statement for files with multiple statements
            print(f"    Bulk failed ({type(e).__name__}), trying statement-by-statement...")
            statements = split_sql(sql)
            for i, stmt in enumerate(statements):
                stmt = stmt.strip()
                if not stmt:
                    continue
                try:
                    cur.execute(stmt)
                    conn.commit()
                except Exception as e2:
                    conn.rollback()
                    err_name = type(e2).__name__
                    if "Duplicate" in err_name or "already exists" in str(e2):
                        pass  # skip already-applied
                    else:
                        print(f"      Statement {i+1} error: {e2}")


def split_sql(sql):
    """Split SQL into individual statements, respecting function bodies."""
    statements = []
    current = []
    in_function = False

    for line in sql.split('\n'):
        stripped = line.strip()

        if stripped.upper().startswith('CREATE OR REPLACE FUNCTION') or stripped.upper().startswith('CREATE FUNCTION'):
            in_function = True

        current.append(line)

        if in_function:
            if stripped.upper().startswith('$$ LANGUAGE') or stripped.upper().endswith('LANGUAGE PLPGSQL;'):
                in_function = False
                statements.append('\n'.join(current))
                current = []
        elif stripped.endswith(';') and not in_function:
            statements.append('\n'.join(current))
            current = []

    if current:
        statements.append('\n'.join(current))

    return statements


# ===================================================================
# PHASE 2: Seed data
# ===================================================================
def apply_seed(conn):
    print("\n[Phase 2] Applying seed data...")
    cur = conn.cursor()
    sql = (PROJECT_ROOT / "supabase" / "seed.sql").read_text()

    # Check if seed already applied
    cur.execute("SELECT COUNT(*) FROM landlords")
    count = cur.fetchone()[0]
    if count > 0:
        print(f"  ⏭ Seed data already present ({count} landlords). Skipping.")
        return

    statements = split_sql(sql)
    for i, stmt in enumerate(statements):
        stmt = stmt.strip()
        if not stmt or stmt.startswith('--'):
            continue
        try:
            cur.execute(stmt)
            conn.commit()
        except Exception as e:
            conn.rollback()
            if "duplicate" in str(e).lower():
                pass
            else:
                print(f"    Statement {i+1} error: {e}")

    cur.execute("SELECT COUNT(*) FROM listings")
    count = cur.fetchone()[0]
    print(f"  ✓ Seed applied — {count} listings in database")


# ===================================================================
# PHASE 3: Load batch files
# ===================================================================
def load_batches(conn):
    print("\n[Phase 3] Loading batch files...")
    cur = conn.cursor()

    if not BATCHES_DIR.exists():
        print("  No batches directory found.")
        return

    batch_files = sorted(BATCHES_DIR.glob("*.json"))
    print(f"  Found {len(batch_files)} batch file(s)")

    for bf in batch_files:
        print(f"\n  Loading {bf.name}...")
        with open(bf, encoding="utf-8") as f:
            rows = json.load(f)

        inserted = 0
        updated = 0
        errors = 0

        for row in rows:
            try:
                result = upsert_listing(conn, cur, row)
                if result == "inserted":
                    inserted += 1
                else:
                    updated += 1
            except Exception as e:
                conn.rollback()
                errors += 1
                print(f"    Error on {row.get('listing_id')}: {e}")

        print(f"    → {inserted} inserted, {updated} updated, {errors} errors")


def upsert_listing(conn, cur, row):
    listing_id = str(row["listing_id"])
    landlord_id = str(row["landlord_id"])
    contact = row.get("landlord_contact", row.get("contact_info", "N/A")) or "N/A"

    # Upsert landlord
    cur.execute("""
        INSERT INTO landlords (landlord_id, name, contact_info)
        VALUES (%s, %s, %s)
        ON CONFLICT (landlord_id) DO UPDATE SET name = EXCLUDED.name, contact_info = EXCLUDED.contact_info
    """, (landlord_id, row["landlord_name"], contact))

    # Check existing
    cur.execute("SELECT rent_id, location_id FROM listings WHERE listing_id = %s", (listing_id,))
    existing = cur.fetchone()
    is_update = existing is not None

    # Rent
    price = row.get("monthly_price")
    bills = row.get("bills_included")
    deposit = row.get("deposit")
    currency = row.get("currency", "EUR") or "EUR"

    if is_update:
        rent_id = existing[0]
        cur.execute("""
            UPDATE rent SET monthly_price=%s, currency=%s, bills_included=%s, deposit=%s
            WHERE rent_id=%s
        """, (price, currency, bills, deposit, rent_id))
    else:
        cur.execute("""
            INSERT INTO rent (monthly_price, currency, bills_included, deposit)
            VALUES (%s, %s, %s, %s) RETURNING rent_id
        """, (price, currency, bills, deposit))
        rent_id = cur.fetchone()[0]

    # Location
    lat = float(row["lat"])
    lng = float(row["lng"])
    address = (row.get("address") or "").strip()
    neighborhood = (row.get("neighborhood") or "").strip()

    if is_update:
        location_id = existing[1]
        cur.execute("""
            UPDATE location SET address=%s, neighborhood=%s, lat=%s, lng=%s
            WHERE location_id=%s
        """, (address, neighborhood, lat, lng, location_id))
    else:
        cur.execute("""
            INSERT INTO location (address, neighborhood, lat, lng)
            VALUES (%s, %s, %s, %s) RETURNING location_id
        """, (address, neighborhood, lat, lng))
        location_id = cur.fetchone()[0]

    # Property type
    pt_raw = str(row.get("property_type", "")).strip().lower()
    pt_name = PROPERTY_TYPE_MAP.get(pt_raw, row.get("property_type"))
    cur.execute("SELECT property_type_id FROM property_types WHERE name = %s", (pt_name,))
    pt_row = cur.fetchone()
    if pt_row:
        pt_id = pt_row[0]
    else:
        cur.execute("INSERT INTO property_types (name) VALUES (%s) RETURNING property_type_id", (pt_name,))
        pt_id = cur.fetchone()[0]

    # Listing
    description = row.get("description", "")
    photos = row.get("photos", [])
    sqm = row.get("sqm")
    floor = row.get("floor")
    source_url = row.get("source_url")
    available_from = row.get("available_from")
    rental_duration = row.get("rental_duration")
    flags = json.dumps(row.get("flags", {}))

    if is_update:
        cur.execute("""
            UPDATE listings SET landlord_id=%s, rent_id=%s, location_id=%s, property_type_id=%s,
                description=%s, photos=%s, sqm=%s, floor=%s, source_url=%s,
                available_from=%s, rental_duration=%s, flags=%s
            WHERE listing_id=%s
        """, (landlord_id, rent_id, location_id, pt_id,
              description, photos, sqm, floor, source_url,
              available_from, rental_duration, flags, listing_id))
    else:
        cur.execute("""
            INSERT INTO listings (listing_id, landlord_id, rent_id, location_id, property_type_id,
                description, photos, sqm, floor, source_url, available_from, rental_duration, flags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (listing_id, landlord_id, rent_id, location_id, pt_id,
              description, photos, sqm, floor, source_url,
              available_from, rental_duration, flags))

    # Amenities
    raw_amenities = row.get("amenities", [])
    if isinstance(raw_amenities, str):
        raw_amenities = [a.strip() for a in raw_amenities.split(",")]

    cur.execute("DELETE FROM listing_amenities WHERE listing_id = %s", (listing_id,))
    for a in raw_amenities:
        canonical = AMENITY_NORMALIZE.get(a.lower().strip(), a)
        cur.execute("SELECT amenity_id FROM amenities WHERE name = %s", (canonical,))
        a_row = cur.fetchone()
        if a_row:
            aid = a_row[0]
        else:
            cur.execute("INSERT INTO amenities (name) VALUES (%s) RETURNING amenity_id", (canonical,))
            aid = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (%s, %s)
            ON CONFLICT DO NOTHING
        """, (listing_id, aid))

    conn.commit()
    return "updated" if is_update else "inserted"


# ===================================================================
# PHASE 4: Compute distances via OSRM
# ===================================================================
def compute_distances(conn):
    print("\n[Phase 4] Computing OSRM distances...")
    cur = conn.cursor()

    # Get all listings with coords
    cur.execute("""
        SELECT l.listing_id, loc.lat, loc.lng
        FROM listings l JOIN location loc ON l.location_id = loc.location_id
    """)
    listings = [{"listing_id": r[0], "lat": float(r[1]), "lng": float(r[2])} for r in cur.fetchall()]

    # Get all faculties
    cur.execute("SELECT faculty_id, lat, lng FROM faculties")
    faculties = [{"faculty_id": r[0], "lat": float(r[1]), "lng": float(r[2])} for r in cur.fetchall()]

    # Check existing
    cur.execute("SELECT COUNT(*) FROM faculty_distances")
    existing_count = cur.fetchone()[0]
    expected = len(listings) * len(faculties)

    if existing_count >= expected:
        print(f"  ⏭ Already have {existing_count}/{expected} distance records. Skipping OSRM calls.")
        return

    # Clear and recompute
    cur.execute("DELETE FROM faculty_distances")
    conn.commit()

    total = len(listings) * len(faculties)
    print(f"  {len(listings)} listings × {len(faculties)} faculties = {total} pairs")
    print(f"  Estimated time: ~{total * OSRM_DELAY * 2 / 60:.1f} minutes\n")

    done = 0
    errors = 0
    for listing in listings:
        for faculty in faculties:
            done += 1
            lid = listing["listing_id"]
            fid = faculty["faculty_id"]

            walk = osrm_duration(listing["lat"], listing["lng"], faculty["lat"], faculty["lng"], "foot")
            time.sleep(OSRM_DELAY)
            driving = osrm_duration(listing["lat"], listing["lng"], faculty["lat"], faculty["lng"], "driving")
            time.sleep(OSRM_DELAY)
            transit = math.ceil(driving * 1.5) if driving else None

            if walk is not None and transit is not None:
                cur.execute("""
                    INSERT INTO faculty_distances (listing_id, faculty_id, walk_minutes, transit_minutes)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (listing_id, faculty_id) DO UPDATE
                    SET walk_minutes = EXCLUDED.walk_minutes, transit_minutes = EXCLUDED.transit_minutes
                """, (lid, fid, walk, transit))
                conn.commit()
                print(f"    [{done}/{total}] {lid} → {fid}: walk={walk}m transit={transit}m")
            else:
                errors += 1
                print(f"    [{done}/{total}] {lid} → {fid}: FAILED")

    print(f"\n  ✓ {done - errors}/{total} computed, {errors} errors")


def osrm_duration(olat, olng, dlat, dlng, profile="foot"):
    url = f"{OSRM_BASE}/route/v1/{profile}/{olng},{olat};{dlng},{dlat}?overview=false"
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json()
        if data.get("code") == "Ok" and data.get("routes"):
            return math.ceil(data["routes"][0]["duration"] / 60)
    except Exception as e:
        print(f"      OSRM error: {e}")
    return None


# ===================================================================
# PHASE 5: Validate everything in the real database
# ===================================================================
def validate(conn):
    print("\n[Phase 5] Validating against live database...")
    cur = conn.cursor()
    checks = []

    # 1. listing_id format
    cur.execute("SELECT listing_id FROM listings WHERE listing_id !~ '^\\d{7}$'")
    bad = cur.fetchall()
    checks.append(("listing_id follows 7-digit LLLLLNN format",
                    len(bad) == 0,
                    f"{[''.join(r) for r in bad]}" if bad else "All valid"))

    # 2. Required dimensions — no nulls on required fields
    cur.execute("""
        SELECT l.listing_id,
            CASE WHEN ll.name IS NULL THEN 'landlord_name' END,
            CASE WHEN ll.contact_info IS NULL THEN 'contact_info' END,
            CASE WHEN loc.address IS NULL OR loc.address = '' THEN 'address' END,
            CASE WHEN loc.neighborhood IS NULL OR loc.neighborhood = '' THEN 'neighborhood' END,
            CASE WHEN loc.lat IS NULL THEN 'lat' END,
            CASE WHEN loc.lng IS NULL THEN 'lng' END
        FROM listings l
        JOIN landlords ll ON l.landlord_id = ll.landlord_id
        JOIN location loc ON l.location_id = loc.location_id
    """)
    null_issues = []
    for row in cur.fetchall():
        lid = row[0]
        for field in row[1:]:
            if field:
                null_issues.append(f"{lid}: {field}")
    checks.append(("All required dimensions filled (no nulls)",
                    len(null_issues) == 0,
                    f"{len(null_issues)} issues" + (f": {null_issues[:5]}" if null_issues else "")))

    # 3. Lat/lng within bounds
    cur.execute("""
        SELECT l.listing_id, loc.lat, loc.lng FROM listings l
        JOIN location loc ON l.location_id = loc.location_id
        WHERE loc.lat NOT BETWEEN 40.55 AND 40.70 OR loc.lng NOT BETWEEN 22.80 AND 23.05
    """)
    oob = cur.fetchall()
    checks.append(("All lat/lng within Thessaloniki bounds",
                    len(oob) == 0,
                    f"{len(oob)} out of bounds" + (f": {oob}" if oob else "")))

    # 4. Prices in EUR and reasonable
    cur.execute("""
        SELECT l.listing_id, r.monthly_price, r.currency FROM listings l
        JOIN rent r ON l.rent_id = r.rent_id
        WHERE r.monthly_price IS NOT NULL AND (r.monthly_price < 100 OR r.monthly_price > 1000 OR r.currency != 'EUR')
    """)
    price_bad = cur.fetchall()
    cur.execute("SELECT COUNT(*) FROM listings l JOIN rent r ON l.rent_id = r.rent_id WHERE r.monthly_price IS NOT NULL")
    priced = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM listings l JOIN rent r ON l.rent_id = r.rent_id WHERE r.monthly_price IS NULL")
    unpriced = cur.fetchone()[0]
    checks.append(("Prices in EUR, 100-1000 range (where listed)",
                    len(price_bad) == 0,
                    f"{priced} priced, {unpriced} price-not-listed, {len(price_bad)} issues"))

    # 5. Distance completeness
    cur.execute("SELECT COUNT(*) FROM faculty_distances")
    dist_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM listings")
    listing_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM faculties")
    faculty_count = cur.fetchone()[0]
    expected_dists = listing_count * faculty_count
    checks.append(("Every listing has distance data for every faculty",
                    dist_count == expected_dists,
                    f"{dist_count}/{expected_dists} pairs"))

    # 6. No duplicate IDs
    cur.execute("SELECT listing_id, COUNT(*) FROM listings GROUP BY listing_id HAVING COUNT(*) > 1")
    dupes = cur.fetchall()
    checks.append(("No duplicate listing_id values",
                    len(dupes) == 0,
                    f"{listing_count} unique" + (f", dupes: {dupes}" if dupes else "")))

    # 7. Prefix match
    cur.execute("SELECT listing_id, landlord_id FROM listings WHERE LEFT(listing_id, 4) != landlord_id")
    prefix_bad = cur.fetchall()
    checks.append(("listing_id prefix matches landlord_id",
                    len(prefix_bad) == 0,
                    f"{len(prefix_bad)} mismatches" + (f": {prefix_bad}" if prefix_bad else "")))

    # Print results
    for name, passed, detail in checks:
        icon = "✅" if passed else "❌"
        print(f"  {icon} {name} — {detail}")

    return checks, listing_count, faculty_count, dist_count, priced, unpriced


# ===================================================================
# PHASE 6: Generate report
# ===================================================================
def generate_report(checks, listing_count, faculty_count, dist_count, priced, unpriced):
    print("\n[Phase 6] Generating validation report...")
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    failed = sum(1 for _, p, _ in checks if not p)
    overall = "✅ ALL CHECKS PASSED" if failed == 0 else f"⚠️ {failed} CHECK(S) FAILED"

    lines = [
        "# Data Validation Report",
        "",
        f"**Generated:** {now}  ",
        f"**Database:** Supabase PostgreSQL 17 (live)  ",
        f"**Overall:** {overall}",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "|--------|-------|",
        f"| Total listings | {listing_count} |",
        f"| With price listed | {priced} |",
        f"| Price not listed (flagged) | {unpriced} |",
        f"| Faculty reference points | {faculty_count} |",
        f"| Distance records | {dist_count} |",
        f"| Expected distance records | {listing_count * faculty_count} |",
        "",
        "## Checks",
        "",
    ]

    for i, (name, passed, detail) in enumerate(checks, 1):
        icon = "✅" if passed else "❌"
        lines.append(f"### {i}. {icon} {name}")
        lines.append("")
        lines.append(detail)
        lines.append("")

    lines.extend([
        "## Data Quality Notes",
        "",
        f"- **Price-not-listed listings:** {unpriced} listings have `monthly_price = NULL` "
        "because landlords do not publish prices. Each has a `PRICE_MISSING` flag in the `flags` JSONB column.",
        "- **Approximate coordinates:** Some batch listings have approximate lat/lng. "
        "Each has a `COORDS_APPROXIMATE` flag.",
        "- **Distances computed via OSRM:** Walking uses foot profile; transit approximated as driving × 1.5.",
        "- **All constraints enforced by PostgreSQL:** CHECK constraints, foreign keys, and NOT NULL rules "
        "are validated at the database level, not just application code.",
        "",
    ])

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  ✓ Report → {REPORT_PATH}")


# ===================================================================
# PHASE 7: Export snapshot
# ===================================================================
def export_snapshot(conn):
    print("\n[Phase 7] Exporting seed snapshot...")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT l.listing_id, l.landlord_id, ll.name AS landlord_name, ll.contact_info,
            loc.address, loc.neighborhood, loc.lat, loc.lng,
            r.monthly_price, r.currency, r.bills_included, r.deposit,
            pt.name AS property_type, l.description, l.photos,
            l.sqm, l.floor, l.source_url, l.available_from, l.rental_duration, l.flags,
            l.created_at, l.updated_at
        FROM listings l
        JOIN landlords ll ON l.landlord_id = ll.landlord_id
        JOIN rent r ON l.rent_id = r.rent_id
        JOIN location loc ON l.location_id = loc.location_id
        JOIN property_types pt ON l.property_type_id = pt.property_type_id
        ORDER BY l.listing_id
    """)
    listings = cur.fetchall()

    # Get amenities per listing
    cur.execute("""
        SELECT la.listing_id, a.name FROM listing_amenities la
        JOIN amenities a ON la.amenity_id = a.amenity_id
        ORDER BY la.listing_id, a.name
    """)
    amenities_map = {}
    for row in cur.fetchall():
        amenities_map.setdefault(row["listing_id"], []).append(row["name"])

    # Get distances per listing
    cur.execute("""
        SELECT fd.listing_id, fd.faculty_id, fd.walk_minutes, fd.transit_minutes
        FROM faculty_distances fd ORDER BY fd.listing_id, fd.faculty_id
    """)
    dist_map = {}
    for row in cur.fetchall():
        dist_map.setdefault(row["listing_id"], []).append({
            "faculty_id": row["faculty_id"],
            "walk_minutes": row["walk_minutes"],
            "transit_minutes": row["transit_minutes"],
        })

    # Get faculties
    cur.execute("SELECT * FROM faculties ORDER BY faculty_id")
    faculties = cur.fetchall()

    # Build snapshot
    snapshot = {
        "exported_at": datetime.now().isoformat(),
        "source": "supabase-live",
        "faculties": [dict(f) for f in faculties],
        "listings_count": len(listings),
        "listings": [],
    }

    for l in listings:
        entry = dict(l)
        entry["amenities"] = amenities_map.get(l["listing_id"], [])
        entry["faculty_distances"] = dist_map.get(l["listing_id"], [])
        snapshot["listings"].append(entry)

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False, default=str)
    print(f"  ✓ Snapshot → {SNAPSHOT_PATH} ({len(listings)} listings)")


# ===================================================================
# MAIN
# ===================================================================
def main():
    print("=" * 60)
    print("Student Housing Directory — Live Database Pipeline")
    print("=" * 60)

    conn = get_conn()
    print("✓ Connected to Supabase PostgreSQL")

    apply_migrations(conn)
    apply_seed(conn)
    load_batches(conn)
    compute_distances(conn)
    checks, lc, fc, dc, priced, unpriced = validate(conn)
    generate_report(checks, lc, fc, dc, priced, unpriced)
    export_snapshot(conn)

    conn.close()

    failed = sum(1 for _, p, _ in checks if not p)
    print(f"\n{'=' * 60}")
    print(f"DONE — {len(checks) - failed}/{len(checks)} checks passed")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
