#!/usr/bin/env python3
"""
Standalone data validation script for the Student Housing Directory.

Connects to the live Supabase PostgreSQL database and runs a full suite of
integrity checks. Prints a pass/fail summary and returns exit code 1 if
any check fails (useful for CI).

Usage:
    python3 scripts/validate_data.py

Environment variable required:
    DATABASE_URL  - PostgreSQL connection string (session pooler recommended)

Example:
    export DATABASE_URL="postgresql://postgres.REF:PASS@aws-1-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
    python3 scripts/validate_data.py
"""

import os
import sys

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 is not installed.")
    print("  Fix: pip install psycopg2-binary")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_connection():
    """Connect to Supabase PostgreSQL. Exits with clear message on failure."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("=" * 60)
        print("ERROR: DATABASE_URL environment variable is not set.")
        print()
        print("Set it to your Supabase session-pooler connection string:")
        print()
        print('  export DATABASE_URL="postgresql://postgres.REF:PASS@aws-1-REGION.pooler.supabase.com:5432/postgres?sslmode=require"')
        print()
        print("Find this in: Supabase Dashboard → Project Settings → Database")
        print("              → Method: Session pooler → Type: URI")
        print("=" * 60)
        sys.exit(1)

    try:
        conn = psycopg2.connect(db_url, connect_timeout=10)
        return conn
    except psycopg2.OperationalError as e:
        error_str = str(e)
        print("=" * 60)
        print("ERROR: Could not connect to the database.")
        print()
        if "could not translate host name" in error_str:
            print("DNS resolution failed — the hostname in DATABASE_URL is wrong")
            print("or the Supabase project is paused. Check the dashboard.")
        elif "password authentication failed" in error_str:
            print("Wrong password. Reset it in Supabase Dashboard →")
            print("Project Settings → Database → Database Password.")
        elif "connection refused" in error_str or "no route to host" in error_str:
            print("Cannot reach the server. If using the direct connection,")
            print("switch to the session pooler (your machine may lack IPv6).")
        elif "Tenant or user not found" in error_str:
            print("Wrong region in the pooler URL. Check the connection string")
            print("in Supabase Dashboard → Project Settings → Database.")
        elif "timeout" in error_str.lower():
            print("Connection timed out. Check your network or try again.")
        else:
            print(f"Details: {e}")
        print()
        print(f"DATABASE_URL starts with: {db_url[:50]}...")
        print("=" * 60)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Check functions — each returns (passed: bool, detail: str)
# ---------------------------------------------------------------------------

def check_tables_exist(cur) -> tuple[bool, str]:
    """Verify all expected tables are present."""
    expected = [
        "landlords", "rent", "location", "property_types", "amenities",
        "faculties", "listings", "listing_amenities", "faculty_distances",
    ]
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    """)
    actual = {row[0] for row in cur.fetchall()}
    missing = [t for t in expected if t not in actual]
    if missing:
        return False, f"Missing tables: {missing}"
    return True, f"All {len(expected)} tables present"


def check_listing_id_format(cur) -> tuple[bool, str]:
    """All listing_id values must be exactly 7 digits (LLLLNNN)."""
    cur.execute("SELECT listing_id FROM listings WHERE listing_id !~ '^\\d{7}$'")
    bad = [r[0] for r in cur.fetchall()]
    if bad:
        return False, f"{len(bad)} invalid listing_id(s): {bad[:10]}"
    cur.execute("SELECT COUNT(*) FROM listings")
    total = cur.fetchone()[0]
    return True, f"All {total} listing_ids match 7-digit LLLLNNN format"


def check_listing_prefix_match(cur) -> tuple[bool, str]:
    """First 4 digits of listing_id must equal landlord_id."""
    cur.execute("""
        SELECT listing_id, landlord_id FROM listings
        WHERE LEFT(listing_id, 4) != landlord_id
    """)
    bad = cur.fetchall()
    if bad:
        return False, f"{len(bad)} prefix mismatches: {bad[:5]}"
    return True, "All listing_id prefixes match landlord_id"


def check_no_null_dimensions(cur) -> tuple[bool, str]:
    """Every listing must have all required dimension fields filled."""
    cur.execute("""
        SELECT
            l.listing_id,
            CASE WHEN ll.name IS NULL OR ll.name = '' THEN 'landlord.name' END,
            CASE WHEN ll.contact_info IS NULL OR ll.contact_info = '' THEN 'landlord.contact_info' END,
            CASE WHEN loc.address IS NULL OR loc.address = '' THEN 'location.address' END,
            CASE WHEN loc.neighborhood IS NULL OR loc.neighborhood = '' THEN 'location.neighborhood' END,
            CASE WHEN loc.lat IS NULL THEN 'location.lat' END,
            CASE WHEN loc.lng IS NULL THEN 'location.lng' END,
            CASE WHEN r.currency IS NULL OR r.currency = '' THEN 'rent.currency' END,
            CASE WHEN pt.name IS NULL THEN 'property_type.name' END
        FROM listings l
        JOIN landlords ll ON l.landlord_id = ll.landlord_id
        JOIN rent r ON l.rent_id = r.rent_id
        JOIN location loc ON l.location_id = loc.location_id
        JOIN property_types pt ON l.property_type_id = pt.property_type_id
    """)
    issues = []
    for row in cur.fetchall():
        listing_id = row[0]
        nulls = [f for f in row[1:] if f is not None]
        if nulls:
            issues.append(f"{listing_id}: {', '.join(nulls)}")
    if issues:
        return False, f"{len(issues)} listing(s) with null dimensions:\n" + "\n".join(f"    {i}" for i in issues[:10])
    cur.execute("SELECT COUNT(*) FROM listings")
    total = cur.fetchone()[0]
    return True, f"All {total} listings have complete required dimensions"


def check_coordinates_in_bounds(cur) -> tuple[bool, str]:
    """All lat/lng must be within Thessaloniki bounds (DB constraint: 40.55-40.70, 22.80-23.05)."""
    cur.execute("""
        SELECT l.listing_id, loc.lat, loc.lng
        FROM listings l JOIN location loc ON l.location_id = loc.location_id
        WHERE loc.lat NOT BETWEEN 40.55 AND 40.70
           OR loc.lng NOT BETWEEN 22.80 AND 23.05
    """)
    bad = cur.fetchall()
    if bad:
        details = [f"{r[0]}: ({r[1]}, {r[2]})" for r in bad]
        return False, f"{len(bad)} out of bounds:\n" + "\n".join(f"    {d}" for d in details)
    return True, "All coordinates within Thessaloniki bounds (40.55-40.70, 22.80-23.05)"


def check_prices_valid(cur) -> tuple[bool, str]:
    """Prices (when present) must be EUR and in 100-1000 range."""
    cur.execute("""
        SELECT l.listing_id, r.monthly_price, r.currency
        FROM listings l JOIN rent r ON l.rent_id = r.rent_id
        WHERE r.monthly_price IS NOT NULL
          AND (r.monthly_price < 100 OR r.monthly_price > 1000 OR r.currency != 'EUR')
    """)
    bad = cur.fetchall()
    cur.execute("""
        SELECT COUNT(*) FROM listings l JOIN rent r ON l.rent_id = r.rent_id
        WHERE r.monthly_price IS NOT NULL
    """)
    priced = cur.fetchone()[0]
    cur.execute("""
        SELECT COUNT(*) FROM listings l JOIN rent r ON l.rent_id = r.rent_id
        WHERE r.monthly_price IS NULL
    """)
    unpriced = cur.fetchone()[0]
    if bad:
        details = [f"{r[0]}: {r[2]} {r[1]}" for r in bad]
        return False, f"{len(bad)} price issues:\n" + "\n".join(f"    {d}" for d in details)
    return True, f"{priced} priced (all EUR, 100-1000), {unpriced} price-not-listed (null)"


def check_distances_complete(cur) -> tuple[bool, str]:
    """Every listing must have a distance record for every faculty."""
    cur.execute("SELECT COUNT(*) FROM listings")
    listing_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM faculties")
    faculty_count = cur.fetchone()[0]
    expected = listing_count * faculty_count

    cur.execute("SELECT COUNT(*) FROM faculty_distances")
    actual = cur.fetchone()[0]

    if actual < expected:
        # Find which pairs are missing
        cur.execute("""
            SELECT l.listing_id, f.faculty_id
            FROM listings l CROSS JOIN faculties f
            LEFT JOIN faculty_distances fd
              ON fd.listing_id = l.listing_id AND fd.faculty_id = f.faculty_id
            WHERE fd.listing_id IS NULL
            LIMIT 10
        """)
        missing = [f"{r[0]} → {r[1]}" for r in cur.fetchall()]
        return False, (
            f"{actual}/{expected} pairs ({expected - actual} missing)\n"
            + "\n".join(f"    {m}" for m in missing)
        )
    return True, f"{actual}/{expected} listing×faculty distance pairs present"


def check_no_orphaned_listing_amenities(cur) -> tuple[bool, str]:
    """No listing_amenities rows referencing non-existent listings or amenities."""
    cur.execute("""
        SELECT la.listing_id, la.amenity_id FROM listing_amenities la
        LEFT JOIN listings l ON la.listing_id = l.listing_id
        WHERE l.listing_id IS NULL
    """)
    orphan_listings = cur.fetchall()

    cur.execute("""
        SELECT la.listing_id, la.amenity_id FROM listing_amenities la
        LEFT JOIN amenities a ON la.amenity_id = a.amenity_id
        WHERE a.amenity_id IS NULL
    """)
    orphan_amenities = cur.fetchall()

    total_orphans = len(orphan_listings) + len(orphan_amenities)
    if total_orphans > 0:
        detail = ""
        if orphan_listings:
            detail += f"  {len(orphan_listings)} referencing deleted listings\n"
        if orphan_amenities:
            detail += f"  {len(orphan_amenities)} referencing deleted amenities\n"
        return False, f"{total_orphans} orphaned listing_amenities rows:\n{detail}"
    cur.execute("SELECT COUNT(*) FROM listing_amenities")
    total = cur.fetchone()[0]
    return True, f"{total} listing_amenities rows, 0 orphaned"


def check_no_orphaned_distances(cur) -> tuple[bool, str]:
    """No faculty_distances rows referencing non-existent listings or faculties."""
    cur.execute("""
        SELECT fd.listing_id FROM faculty_distances fd
        LEFT JOIN listings l ON fd.listing_id = l.listing_id
        WHERE l.listing_id IS NULL
    """)
    orphan_l = cur.fetchall()

    cur.execute("""
        SELECT fd.faculty_id FROM faculty_distances fd
        LEFT JOIN faculties f ON fd.faculty_id = f.faculty_id
        WHERE f.faculty_id IS NULL
    """)
    orphan_f = cur.fetchall()

    total = len(orphan_l) + len(orphan_f)
    if total > 0:
        detail = ""
        if orphan_l:
            detail += f"  {len(orphan_l)} referencing deleted listings\n"
        if orphan_f:
            detail += f"  {len(orphan_f)} referencing deleted faculties\n"
        return False, f"{total} orphaned faculty_distances rows:\n{detail}"
    cur.execute("SELECT COUNT(*) FROM faculty_distances")
    count = cur.fetchone()[0]
    return True, f"{count} faculty_distances rows, 0 orphaned"


def check_no_orphaned_rent(cur) -> tuple[bool, str]:
    """No rent records not referenced by any listing."""
    cur.execute("""
        SELECT r.rent_id FROM rent r
        LEFT JOIN listings l ON r.rent_id = l.rent_id
        WHERE l.listing_id IS NULL
    """)
    orphans = cur.fetchall()
    if orphans:
        return False, f"{len(orphans)} rent records not linked to any listing: {[r[0] for r in orphans[:10]]}"
    return True, "All rent records linked to a listing"


def check_no_orphaned_location(cur) -> tuple[bool, str]:
    """No location records not referenced by any listing."""
    cur.execute("""
        SELECT loc.location_id FROM location loc
        LEFT JOIN listings l ON loc.location_id = l.location_id
        WHERE l.listing_id IS NULL
    """)
    orphans = cur.fetchall()
    if orphans:
        return False, f"{len(orphans)} location records not linked to any listing: {[r[0] for r in orphans[:10]]}"
    return True, "All location records linked to a listing"


def check_no_duplicate_ids(cur) -> tuple[bool, str]:
    """No duplicate listing_id values."""
    cur.execute("SELECT listing_id, COUNT(*) FROM listings GROUP BY listing_id HAVING COUNT(*) > 1")
    dupes = cur.fetchall()
    if dupes:
        return False, f"{len(dupes)} duplicate listing_id values: {[d[0] for d in dupes]}"
    cur.execute("SELECT COUNT(*) FROM listings")
    total = cur.fetchone()[0]
    return True, f"{total} listings, all unique"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

ALL_CHECKS = [
    ("Schema tables exist",                  check_tables_exist),
    ("listing_id format (7-digit LLLLNNN)",  check_listing_id_format),
    ("listing_id prefix matches landlord",   check_listing_prefix_match),
    ("No duplicate listing_ids",             check_no_duplicate_ids),
    ("No null required dimensions",          check_no_null_dimensions),
    ("Coordinates within Thessaloniki",      check_coordinates_in_bounds),
    ("Prices valid (EUR, 100-1000)",         check_prices_valid),
    ("Faculty distances complete",           check_distances_complete),
    ("No orphaned listing_amenities",        check_no_orphaned_listing_amenities),
    ("No orphaned faculty_distances",        check_no_orphaned_distances),
    ("No orphaned rent records",             check_no_orphaned_rent),
    ("No orphaned location records",         check_no_orphaned_location),
]


def main():
    print("=" * 60)
    print("Student Housing Directory — Data Validation")
    print("=" * 60)
    print()

    conn = get_connection()
    cur = conn.cursor()
    print("Connected to database.\n")

    passed = 0
    failed = 0
    results = []

    for name, check_fn in ALL_CHECKS:
        try:
            ok, detail = check_fn(cur)
        except Exception as e:
            ok = False
            detail = f"Check raised exception: {type(e).__name__}: {e}"
            conn.rollback()

        icon = "\033[32m✅ PASS\033[0m" if ok else "\033[31m❌ FAIL\033[0m"
        print(f"  {icon}  {name}")
        # Print detail indented
        for line in detail.split("\n"):
            print(f"         {line}")
        print()

        if ok:
            passed += 1
        else:
            failed += 1
        results.append((name, ok, detail))

    conn.close()

    # Summary
    print("=" * 60)
    if failed == 0:
        print(f"\033[32m  ALL {passed} CHECKS PASSED\033[0m")
    else:
        print(f"\033[31m  {failed} FAILED\033[0m, {passed} passed (out of {passed + failed})")
    print("=" * 60)

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
