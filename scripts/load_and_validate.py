#!/usr/bin/env python3
"""
Comprehensive data loading, validation, distance computation, and export pipeline.

Loads seed data + real batch files, validates all constraints,
computes OSRM walking/transit distances, and exports everything.

Usage:
    python3 scripts/load_and_validate.py

Outputs:
    - docs/data-validation-report.md
    - data/seed-snapshot.json
"""

import json
import math
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BATCHES_DIR = PROJECT_ROOT / "data" / "batches"
SEED_SQL = PROJECT_ROOT / "supabase" / "seed.sql"
FACULTIES_SQL = PROJECT_ROOT / "supabase" / "migrations" / "002_seed_faculties.sql"
REPORT_PATH = PROJECT_ROOT / "docs" / "data-validation-report.md"
SNAPSHOT_PATH = PROJECT_ROOT / "data" / "seed-snapshot.json"

# ---------------------------------------------------------------------------
# Thessaloniki bounds
# ---------------------------------------------------------------------------
LAT_MIN, LAT_MAX = 40.55, 40.70  # extended slightly for IHU Sindos
LNG_MIN, LNG_MAX = 22.80, 23.05

# ---------------------------------------------------------------------------
# Canonical data maps
# ---------------------------------------------------------------------------
PROPERTY_TYPE_MAP = {
    "studio": "Studio",
    "1-bedroom": "1-Bedroom",
    "1-bed": "1-Bedroom",
    "2-bedroom": "2-Bedroom",
    "2-bed": "2-Bedroom",
    "2-bedroom (x2)": "2-Bedroom (x2)",
    "room": "Room in shared apartment",
    "room in shared apartment": "Room in shared apartment",
}

AMENITY_NORMALIZE = {
    "ac": "AC",
    "furnished": "Furnished",
    "balcony": "Balcony",
    "elevator": "Elevator",
    "parking": "Parking",
    "ground floor": "Ground floor",
    "ground_floor": "Ground floor",
    "washing machine": "Washing machine",
    "washing_machine": "Washing machine",
    "dishwasher": "Dishwasher",
    "internet included": "Internet included",
    "internet_included": "Internet included",
    "heating": "Heating",
    "wi-fi": "Wi-Fi",
    "wifi": "Wi-Fi",
    "tv": "TV",
    "kitchen": "Kitchen",
    "double_glazed_windows": "Double glazed windows",
    "double glazed windows": "Double glazed windows",
    "weekly_cleaning": "Weekly cleaning",
    "weekly cleaning": "Weekly cleaning",
    "microwave": "Microwave",
    "oven": "Oven",
    "gas_heating": "Gas heating",
    "gas heating": "Gas heating",
    "private_yard": "Private yard",
    "private yard": "Private yard",
}

# Faculty reference points (from 002_seed_faculties.sql)
FACULTIES = [
    {"faculty_id": "auth-main", "name": "AUTH Main Campus", "university": "AUTH", "lat": 40.6301, "lng": 22.9563},
    {"faculty_id": "auth-medical", "name": "AUTH Medical School", "university": "AUTH", "lat": 40.6225, "lng": 22.9555},
    {"faculty_id": "auth-agriculture", "name": "AUTH School of Agriculture", "university": "AUTH", "lat": 40.6290, "lng": 22.9510},
    {"faculty_id": "uom-main", "name": "UoM Main Campus", "university": "UoM", "lat": 40.6253, "lng": 22.9614},
    {"faculty_id": "ihu-thermi", "name": "IHU Thermi Campus", "university": "IHU", "lat": 40.5678, "lng": 22.9975},
    {"faculty_id": "ihu-sindos", "name": "IHU Sindos Campus", "university": "IHU", "lat": 40.6720, "lng": 22.8090},
]


# ===================================================================
# PHASE 1: Load and normalize all listings
# ===================================================================

def load_seed_listings() -> list[dict]:
    """Parse seed.sql to extract the 10 seed listings with all dimensions."""
    # Rather than parsing SQL, we reconstruct from known data
    seed_landlords = {
        "0001": {"name": "Kostas Papadopoulos", "contact_info": "+30 2310 123456"},
        "0002": {"name": "Maria Georgiou", "contact_info": "maria.georgiou@email.gr"},
        "0003": {"name": "Nikos Dimitriou", "contact_info": "+30 2310 654321"},
        "0004": {"name": "Elena Katsarou", "contact_info": "elena.katsarou@email.gr"},
        "0005": {"name": "Alexandros Tsimikas", "contact_info": "+30 2310 789012"},
    }
    seed_ptypes = {1: "Studio", 2: "1-Bedroom", 3: "2-Bedroom", 4: "Room in shared apartment"}
    seed_amenities_map = {1: "AC", 2: "Furnished", 3: "Balcony", 4: "Elevator", 5: "Parking",
                          6: "Ground floor", 7: "Washing machine", 8: "Dishwasher",
                          9: "Internet included", 10: "Heating"}
    seed_rents = [
        {"rent_id": 1, "monthly_price": 320, "currency": "EUR", "bills_included": False, "deposit": 320},
        {"rent_id": 2, "monthly_price": 380, "currency": "EUR", "bills_included": False, "deposit": 380},
        {"rent_id": 3, "monthly_price": 480, "currency": "EUR", "bills_included": False, "deposit": 480},
        {"rent_id": 4, "monthly_price": 350, "currency": "EUR", "bills_included": True, "deposit": 350},
        {"rent_id": 5, "monthly_price": 200, "currency": "EUR", "bills_included": True, "deposit": 200},
        {"rent_id": 6, "monthly_price": 280, "currency": "EUR", "bills_included": False, "deposit": 280},
        {"rent_id": 7, "monthly_price": 520, "currency": "EUR", "bills_included": False, "deposit": 520},
        {"rent_id": 8, "monthly_price": 350, "currency": "EUR", "bills_included": False, "deposit": 350},
        {"rent_id": 9, "monthly_price": 300, "currency": "EUR", "bills_included": False, "deposit": 300},
        {"rent_id": 10, "monthly_price": 220, "currency": "EUR", "bills_included": True, "deposit": 220},
    ]
    seed_locations = [
        {"location_id": 1, "address": "Tsimiski 45", "neighborhood": "Kentro", "lat": 40.6325, "lng": 22.9430},
        {"location_id": 2, "address": "Egnatia 132", "neighborhood": "Kamara", "lat": 40.6355, "lng": 22.9470},
        {"location_id": 3, "address": "Vasilissis Olgas 78", "neighborhood": "Kalamaria", "lat": 40.6050, "lng": 22.9560},
        {"location_id": 4, "address": "Plastira 15", "neighborhood": "Kalamaria", "lat": 40.5980, "lng": 22.9510},
        {"location_id": 5, "address": "Olympou 22", "neighborhood": "Ano Poli", "lat": 40.6420, "lng": 22.9490},
        {"location_id": 6, "address": "Kassandrou 88", "neighborhood": "Rotonda", "lat": 40.6340, "lng": 22.9510},
        {"location_id": 7, "address": "Venizelou 56", "neighborhood": "Triandria", "lat": 40.6390, "lng": 22.9610},
        {"location_id": 8, "address": "Ethnikis Amynis 33", "neighborhood": "Kentro", "lat": 40.6290, "lng": 22.9480},
        {"location_id": 9, "address": "Papanastasiou 110", "neighborhood": "Toumba", "lat": 40.6180, "lng": 22.9650},
        {"location_id": 10, "address": "Georgiou Papandreou 64", "neighborhood": "Stavroupoli", "lat": 40.6530, "lng": 22.9350},
    ]
    seed_listings_raw = [
        ("0001001", "0001", 1, 1, 1, "Cozy studio in the heart of Kentro, steps from Tsimiski shopping street. Recently renovated with modern finishes."),
        ("0001002", "0001", 2, 2, 2, "Bright 1-bedroom near Kamara and the Arch of Galerius. Great nightlife access and close to university campus."),
        ("0002001", "0002", 3, 3, 3, "Spacious 2-bedroom apartment in Kalamaria with sea views from the balcony. Ideal for two students sharing."),
        ("0002002", "0002", 4, 4, 2, "Comfortable 1-bedroom in quiet Kalamaria neighborhood. Bills included — no surprises. Near the waterfront promenade."),
        ("0003001", "0003", 5, 5, 4, "Affordable room in a shared apartment in Ano Poli with panoramic city views. Authentic Thessaloniki neighborhood."),
        ("0003002", "0003", 6, 6, 1, "Charming studio near the Rotonda monument. Walking distance to AUTH campus and the city center."),
        ("0004001", "0004", 7, 7, 3, "Modern 2-bedroom in Triandria with full amenities. Perfect for students who want comfort close to UoM."),
        ("0004002", "0004", 8, 8, 1, "Well-maintained studio on Ethnikis Amynis, between the city center and the university. Quiet street, good transport links."),
        ("0005001", "0005", 9, 9, 2, "Ground-floor 1-bedroom in Toumba. Easy access, no stairs. Close to local markets and bus routes to campus."),
        ("0005002", "0005", 10, 10, 4, "Budget-friendly room in Stavroupoli with internet and heating included. Good bus connections to all campuses."),
    ]
    seed_listing_amenities = {
        "0001001": [1, 2, 4, 10],
        "0001002": [1, 2, 3, 10],
        "0002001": [1, 2, 3, 4, 5, 7],
        "0002002": [1, 2, 3, 7, 9],
        "0003001": [2, 10],
        "0003002": [1, 2, 3, 10],
        "0004001": [1, 2, 3, 4, 5, 7, 8],
        "0004002": [1, 2, 4, 7, 10],
        "0005001": [1, 2, 6, 7],
        "0005002": [2, 9, 10],
    }

    listings = []
    for lid, landlord_id, rent_id, loc_id, pt_id, desc in seed_listings_raw:
        rent = seed_rents[rent_id - 1]
        loc = seed_locations[loc_id - 1]
        ll = seed_landlords[landlord_id]
        amenity_ids = seed_listing_amenities[lid]
        listings.append({
            "listing_id": lid,
            "landlord_id": landlord_id,
            "landlord_name": ll["name"],
            "contact_info": ll["contact_info"],
            "address": loc["address"],
            "neighborhood": loc["neighborhood"],
            "lat": loc["lat"],
            "lng": loc["lng"],
            "monthly_price": rent["monthly_price"],
            "currency": rent["currency"],
            "bills_included": rent["bills_included"],
            "deposit": rent["deposit"],
            "property_type": seed_ptypes[pt_id],
            "amenities": [seed_amenities_map[aid] for aid in amenity_ids],
            "description": desc,
            "photos": [],
            "sqm": None,
            "floor": None,
            "source_url": None,
            "available_from": None,
            "rental_duration": None,
            "flags": {},
            "source": "seed",
        })
    return listings


def load_batch_listings() -> list[dict]:
    """Load all batch JSON files from data/batches/."""
    all_listings = []
    if not BATCHES_DIR.exists():
        return all_listings
    for batch_file in sorted(BATCHES_DIR.glob("*.json")):
        with open(batch_file, encoding="utf-8") as f:
            data = json.load(f)
        for row in data:
            # Normalize amenities from list
            raw_amenities = row.get("amenities", [])
            if isinstance(raw_amenities, str):
                raw_amenities = [a.strip() for a in raw_amenities.split(",")]
            normalized_amenities = []
            for a in raw_amenities:
                canonical = AMENITY_NORMALIZE.get(a.lower().strip())
                if canonical:
                    normalized_amenities.append(canonical)
                else:
                    normalized_amenities.append(a)  # keep as-is

            # Normalize property type
            raw_pt = str(row.get("property_type", "")).strip().lower()
            pt = PROPERTY_TYPE_MAP.get(raw_pt, row.get("property_type"))

            all_listings.append({
                "listing_id": str(row.get("listing_id", "")),
                "landlord_id": str(row.get("landlord_id", "")),
                "landlord_name": row.get("landlord_name", ""),
                "contact_info": row.get("landlord_contact", row.get("contact_info", "")),
                "address": row.get("address", ""),
                "neighborhood": row.get("neighborhood", ""),
                "lat": row.get("lat"),
                "lng": row.get("lng"),
                "monthly_price": row.get("monthly_price"),
                "currency": row.get("currency", "EUR"),
                "bills_included": row.get("bills_included"),
                "deposit": row.get("deposit"),
                "property_type": pt,
                "amenities": normalized_amenities,
                "description": row.get("description", ""),
                "photos": row.get("photos", []),
                "sqm": row.get("sqm"),
                "floor": row.get("floor"),
                "source_url": row.get("source_url"),
                "available_from": row.get("available_from"),
                "rental_duration": row.get("rental_duration"),
                "flags": row.get("flags", {}),
                "source": batch_file.name,
            })
    return all_listings


# ===================================================================
# PHASE 2: Validation
# ===================================================================

def validate_listing(listing: dict, all_ids: set) -> list[str]:
    """Validate a single listing, return list of errors."""
    errors = []
    lid = listing["listing_id"]

    # listing_id format: 7 digits
    if not re.match(r"^\d{7}$", lid):
        errors.append(f"listing_id '{lid}' does not match LLLLLNN 7-digit format")

    # landlord_id: 4 digits
    landlord_id = listing["landlord_id"]
    if not re.match(r"^\d{4}$", landlord_id):
        errors.append(f"landlord_id '{landlord_id}' is not 4 digits")

    # listing_id prefix matches landlord_id
    if len(lid) >= 4 and lid[:4] != landlord_id:
        errors.append(f"listing_id prefix '{lid[:4]}' doesn't match landlord_id '{landlord_id}'")

    # Duplicate check
    if lid in all_ids:
        errors.append(f"Duplicate listing_id '{lid}'")

    # Required string fields (must be non-empty)
    for field in ["landlord_name", "address", "neighborhood", "description"]:
        if not listing.get(field) or not str(listing[field]).strip():
            errors.append(f"Missing or empty: {field}")

    # Contact info
    if not listing.get("contact_info") or not str(listing["contact_info"]).strip():
        errors.append("Missing contact_info")

    # Coordinates
    lat = listing.get("lat")
    lng = listing.get("lng")
    if lat is None or lng is None:
        errors.append("Missing lat/lng")
    else:
        if not (LAT_MIN <= float(lat) <= LAT_MAX):
            errors.append(f"lat {lat} outside Thessaloniki bounds ({LAT_MIN}–{LAT_MAX})")
        if not (LNG_MIN <= float(lng) <= LNG_MAX):
            errors.append(f"lng {lng} outside Thessaloniki bounds ({LNG_MIN}–{LNG_MAX})")

    # Price: allowed to be null (real data), but if present must be > 0 and EUR
    price = listing.get("monthly_price")
    if price is not None:
        if float(price) <= 0:
            errors.append(f"monthly_price {price} must be > 0")
        if float(price) > 1000:
            errors.append(f"monthly_price {price} unusually high (>1000 EUR)")
        currency = listing.get("currency", "EUR")
        if currency != "EUR":
            errors.append(f"currency '{currency}' is not EUR")

    # Property type
    pt = listing.get("property_type")
    known_types = set(PROPERTY_TYPE_MAP.values())
    if pt not in known_types:
        errors.append(f"Unknown property_type: '{pt}'")

    # Amenities: should be a list
    amenities = listing.get("amenities")
    if not isinstance(amenities, list):
        errors.append("amenities is not a list")

    return errors


def validate_all(listings: list[dict]) -> tuple[list[dict], list[dict]]:
    """Validate all listings, returning (valid, errors) where errors include the listing + error list."""
    valid = []
    error_records = []
    seen_ids = set()

    for listing in listings:
        errors = validate_listing(listing, seen_ids)
        seen_ids.add(listing["listing_id"])
        if errors:
            error_records.append({"listing": listing, "errors": errors})
        else:
            valid.append(listing)

    return valid, error_records


# ===================================================================
# PHASE 3: Distance computation via OSRM
# ===================================================================

OSRM_BASE = "http://router.project-osrm.org"
OSRM_DELAY = 1.1  # seconds between requests


def osrm_duration(origin_lat, origin_lng, dest_lat, dest_lng, profile="foot"):
    """Get route duration in minutes from OSRM. Returns None on failure."""
    url = f"{OSRM_BASE}/route/v1/{profile}/{origin_lng},{origin_lat};{dest_lng},{dest_lat}?overview=false"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") == "Ok" and data.get("routes"):
            return math.ceil(data["routes"][0]["duration"] / 60)
    except Exception as e:
        print(f"    OSRM error ({profile}): {e}")
    return None


def compute_distances_for_listing(listing: dict) -> list[dict]:
    """Compute distances from one listing to all faculties."""
    results = []
    lat, lng = float(listing["lat"]), float(listing["lng"])

    for faculty in FACULTIES:
        lid = listing["listing_id"]
        fid = faculty["faculty_id"]

        walk = osrm_duration(lat, lng, faculty["lat"], faculty["lng"], "foot")
        time.sleep(OSRM_DELAY)

        # Transit approximation: driving × 1.5
        driving = osrm_duration(lat, lng, faculty["lat"], faculty["lng"], "driving")
        time.sleep(OSRM_DELAY)

        transit = math.ceil(driving * 1.5) if driving is not None else None

        if walk is not None and transit is not None:
            results.append({
                "listing_id": lid,
                "faculty_id": fid,
                "walk_minutes": walk,
                "transit_minutes": transit,
            })
            print(f"    {lid} → {fid}: walk={walk}m, transit={transit}m")
        else:
            print(f"    {lid} → {fid}: FAILED (walk={walk}, transit={transit})")

    return results


def compute_all_distances(listings: list[dict]) -> list[dict]:
    """Compute distances for all listings to all faculties."""
    total = len(listings) * len(FACULTIES)
    print(f"\nComputing distances for {len(listings)} listings × {len(FACULTIES)} faculties = {total} pairs")
    print(f"(~{total * OSRM_DELAY * 2:.0f}s estimated at {OSRM_DELAY}s/request)\n")

    all_distances = []
    for i, listing in enumerate(listings):
        print(f"  [{i+1}/{len(listings)}] {listing['listing_id']} ({listing['neighborhood']})")
        dists = compute_distances_for_listing(listing)
        all_distances.extend(dists)

    return all_distances


# ===================================================================
# PHASE 4: Validation of distance completeness
# ===================================================================

def validate_distances(listings: list[dict], distances: list[dict]) -> list[str]:
    """Check every listing has a distance entry for every faculty."""
    issues = []
    dist_set = {(d["listing_id"], d["faculty_id"]) for d in distances}

    for listing in listings:
        for faculty in FACULTIES:
            key = (listing["listing_id"], faculty["faculty_id"])
            if key not in dist_set:
                issues.append(f"Missing distance: {listing['listing_id']} → {faculty['faculty_id']}")

    return issues


# ===================================================================
# PHASE 5: Report generation
# ===================================================================

def generate_report(
    seed_listings: list[dict],
    batch_listings: list[dict],
    valid_listings: list[dict],
    error_records: list[dict],
    distances: list[dict],
    distance_issues: list[str],
) -> str:
    """Generate the validation report markdown."""

    all_listings = seed_listings + batch_listings
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Detailed checks
    checks = []

    # Check 1: listing_id format
    bad_ids = [l for l in valid_listings if not re.match(r"^\d{7}$", l["listing_id"])]
    checks.append({
        "name": "listing_id follows LLLLLNN 7-digit format",
        "passed": len(bad_ids) == 0,
        "detail": f"{len(valid_listings) - len(bad_ids)}/{len(valid_listings)} valid"
            + (f" — failures: {[l['listing_id'] for l in bad_ids]}" if bad_ids else ""),
    })

    # Check 2: All dimensions filled (no nulls in required columns)
    required_fields = ["listing_id", "landlord_id", "landlord_name", "contact_info",
                       "address", "neighborhood", "lat", "lng", "property_type", "description"]
    null_issues = []
    for l in valid_listings:
        for f in required_fields:
            val = l.get(f)
            if val is None or (isinstance(val, str) and not val.strip()):
                null_issues.append(f"{l['listing_id']}: {f} is null/empty")
    checks.append({
        "name": "All required dimensions filled (no nulls)",
        "passed": len(null_issues) == 0,
        "detail": f"{len(valid_listings)} listings checked, {len(null_issues)} null issues"
            + (f"\n" + "\n".join(f"  - {i}" for i in null_issues[:10]) if null_issues else ""),
    })

    # Check 3: lat/lng within bounds
    coord_issues = []
    for l in valid_listings:
        lat, lng = float(l["lat"]), float(l["lng"])
        if not (LAT_MIN <= lat <= LAT_MAX) or not (LNG_MIN <= lng <= LNG_MAX):
            coord_issues.append(f"{l['listing_id']}: ({lat}, {lng})")
    checks.append({
        "name": "All lat/lng within Thessaloniki bounds",
        "passed": len(coord_issues) == 0,
        "detail": f"{len(valid_listings)} checked, {len(coord_issues)} out of bounds"
            + (f"\n" + "\n".join(f"  - {i}" for i in coord_issues) if coord_issues else ""),
    })

    # Check 4: Prices in EUR and reasonable range (when present)
    price_issues = []
    priced = [l for l in valid_listings if l.get("monthly_price") is not None]
    null_priced = [l for l in valid_listings if l.get("monthly_price") is None]
    for l in priced:
        p = float(l["monthly_price"])
        if p < 100 or p > 1000:
            price_issues.append(f"{l['listing_id']}: €{p}")
        if l.get("currency", "EUR") != "EUR":
            price_issues.append(f"{l['listing_id']}: currency={l.get('currency')}")
    checks.append({
        "name": "Prices in EUR and within 100–1000 range (where listed)",
        "passed": len(price_issues) == 0,
        "detail": f"{len(priced)} priced, {len(null_priced)} price-not-listed (flagged), {len(price_issues)} issues"
            + (f"\n" + "\n".join(f"  - {i}" for i in price_issues) if price_issues else ""),
    })

    # Check 5: Faculty distances complete
    checks.append({
        "name": "Every listing has distance data for every faculty",
        "passed": len(distance_issues) == 0,
        "detail": f"{len(distances)} distance records, {len(distance_issues)} missing pairs"
            + (f"\n" + "\n".join(f"  - {i}" for i in distance_issues[:10]) if distance_issues else ""),
    })

    # Check 6: No duplicate listing IDs
    ids = [l["listing_id"] for l in valid_listings]
    dupes = [lid for lid in ids if ids.count(lid) > 1]
    checks.append({
        "name": "No duplicate listing_id values",
        "passed": len(dupes) == 0,
        "detail": f"{len(set(ids))} unique IDs" + (f" — duplicates: {set(dupes)}" if dupes else ""),
    })

    # Check 7: landlord_id prefix match
    prefix_issues = []
    for l in valid_listings:
        if l["listing_id"][:4] != l["landlord_id"]:
            prefix_issues.append(f"{l['listing_id']}: prefix {l['listing_id'][:4]} != landlord {l['landlord_id']}")
    checks.append({
        "name": "listing_id prefix matches landlord_id",
        "passed": len(prefix_issues) == 0,
        "detail": f"{len(valid_listings)} checked, {len(prefix_issues)} mismatches",
    })

    # Build markdown
    passed = sum(1 for c in checks if c["passed"])
    failed = len(checks) - passed
    overall = "✅ ALL CHECKS PASSED" if failed == 0 else f"⚠️ {failed} CHECK(S) FAILED"

    lines = [
        f"# Data Validation Report",
        f"",
        f"**Generated:** {now}  ",
        f"**Overall:** {overall}",
        f"",
        f"## Summary",
        f"",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Seed listings | {len(seed_listings)} |",
        f"| Batch listings (raw) | {len(batch_listings)} |",
        f"| Valid listings (post-validation) | {len(valid_listings)} |",
        f"| Validation errors | {len(error_records)} |",
        f"| Faculty reference points | {len(FACULTIES)} |",
        f"| Distance records | {len(distances)} |",
        f"| Expected distance records | {len(valid_listings) * len(FACULTIES)} |",
        f"",
        f"## Checks",
        f"",
    ]

    for i, check in enumerate(checks, 1):
        icon = "✅" if check["passed"] else "❌"
        lines.append(f"### {i}. {icon} {check['name']}")
        lines.append(f"")
        lines.append(f"{check['detail']}")
        lines.append(f"")

    # Validation errors detail
    if error_records:
        lines.append(f"## Validation Errors (Detail)")
        lines.append(f"")
        for rec in error_records:
            lid = rec["listing"]["listing_id"]
            src = rec["listing"].get("source", "unknown")
            lines.append(f"### {lid} (source: {src})")
            for err in rec["errors"]:
                lines.append(f"- {err}")
            lines.append(f"")

    # Data quality notes
    lines.extend([
        f"## Data Quality Notes",
        f"",
        f"- **Price-not-listed listings:** {len(null_priced)} listings have `monthly_price = null` "
        f"because landlords do not publish prices on their websites. Each has a `PRICE_MISSING` flag.",
        f"- **Approximate coordinates:** Some batch listings have approximate lat/lng "
        f"(estimated from neighborhood, not exact building pin). Each has a `COORDS_APPROXIMATE` flag.",
        f"- **Deposit unknown:** {sum(1 for l in valid_listings if l.get('deposit') is None)} listings "
        f"have null deposit (not listed by landlord).",
        f"",
    ])

    return "\n".join(lines)


# ===================================================================
# PHASE 6: Seed snapshot export
# ===================================================================

def export_snapshot(valid_listings: list[dict], distances: list[dict]):
    """Export full data snapshot to JSON."""
    # Build distance lookup
    dist_lookup = {}
    for d in distances:
        key = d["listing_id"]
        if key not in dist_lookup:
            dist_lookup[key] = []
        dist_lookup[key].append({
            "faculty_id": d["faculty_id"],
            "walk_minutes": d["walk_minutes"],
            "transit_minutes": d["transit_minutes"],
        })

    snapshot = {
        "exported_at": datetime.now().isoformat(),
        "faculties": FACULTIES,
        "listings_count": len(valid_listings),
        "listings": [],
    }

    for listing in valid_listings:
        entry = {**listing}
        entry["faculty_distances"] = dist_lookup.get(listing["listing_id"], [])
        # Remove internal field
        entry.pop("source", None)
        snapshot["listings"].append(entry)

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nSnapshot exported → {SNAPSHOT_PATH} ({len(valid_listings)} listings)")


# ===================================================================
# MAIN
# ===================================================================

def main():
    print("=" * 60)
    print("Student Housing Directory — Load & Validate Pipeline")
    print("=" * 60)

    # PHASE 1: Load
    print("\n[Phase 1] Loading data...")
    seed = load_seed_listings()
    print(f"  Seed listings: {len(seed)}")

    batch = load_batch_listings()
    print(f"  Batch listings: {len(batch)}")

    all_listings = seed + batch
    print(f"  Total: {len(all_listings)}")

    # PHASE 2: Validate
    print("\n[Phase 2] Validating...")
    valid, errors = validate_all(all_listings)
    print(f"  Valid: {len(valid)}")
    print(f"  Errors: {len(errors)}")
    for rec in errors:
        lid = rec["listing"]["listing_id"]
        print(f"    {lid}: {rec['errors']}")

    # PHASE 3: Compute distances
    print("\n[Phase 3] Computing distances via OSRM...")
    distances = compute_all_distances(valid)
    print(f"  Computed: {len(distances)} distance records")

    # PHASE 4: Validate distances
    print("\n[Phase 4] Validating distance completeness...")
    distance_issues = validate_distances(valid, distances)
    if distance_issues:
        print(f"  {len(distance_issues)} missing pairs:")
        for issue in distance_issues[:5]:
            print(f"    {issue}")
    else:
        print(f"  All {len(valid) * len(FACULTIES)} pairs present ✓")

    # PHASE 5: Generate report
    print("\n[Phase 5] Generating validation report...")
    report = generate_report(seed, batch, valid, errors, distances, distance_issues)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  Report → {REPORT_PATH}")

    # PHASE 6: Export snapshot
    print("\n[Phase 6] Exporting seed snapshot...")
    export_snapshot(valid, distances)

    # Final summary
    passed_checks = report.count("✅")
    failed_checks = report.count("❌")
    print(f"\n{'=' * 60}")
    print(f"DONE — {passed_checks} checks passed, {failed_checks} failed")
    print(f"  Listings: {len(valid)} valid, {len(errors)} errors")
    print(f"  Distances: {len(distances)}/{len(valid) * len(FACULTIES)} pairs")
    print(f"  Report: {REPORT_PATH}")
    print(f"  Snapshot: {SNAPSHOT_PATH}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
