#!/usr/bin/env python3
"""
Ingestion script for the Student Housing Directory.

Takes a CSV or JSON batch file, validates it, and upserts records into Supabase.

Usage:
    python3 scripts/ingest.py path/to/batch.csv
    python3 scripts/ingest.py path/to/batch.json

Environment variables required:
    SUPABASE_URL      - Supabase project URL
    SUPABASE_KEY      - Supabase service role key (not anon — needs write access)
"""

import argparse
import csv
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py is not installed.")
    print("  Fix: pip install supabase")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUIRED_FIELDS = [
    "address", "neighborhood", "lat", "lng",
    "property_type", "landlord_name", "landlord_id",
]
# Note: monthly_price is intentionally NOT required — many real landlords
# don't publish prices. Null prices are allowed and flagged.

# Thessaloniki coordinate bounds (ingestion-level — tighter than DB CHECK)
# Wider DB bounds (40.55-40.70, 22.80-23.05) allow IHU Thermi/Sindos.
# Ingestion bounds flag anything outside the urban core for review.
LAT_MIN, LAT_MAX = 40.58, 40.68
LNG_MIN, LNG_MAX = 22.90, 22.98

# Known property type names → canonical (must match property_types table)
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

# Amenity normalization: lowercase/underscore variants → canonical name
AMENITY_NORMALIZE = {
    "ac": "AC", "furnished": "Furnished", "balcony": "Balcony",
    "elevator": "Elevator", "parking": "Parking",
    "ground floor": "Ground floor", "ground_floor": "Ground floor",
    "washing machine": "Washing machine", "washing_machine": "Washing machine",
    "dishwasher": "Dishwasher",
    "internet included": "Internet included", "internet_included": "Internet included",
    "heating": "Heating", "wi-fi": "Wi-Fi", "wifi": "Wi-Fi", "tv": "TV",
    "kitchen": "Kitchen",
    "double_glazed_windows": "Double glazed windows",
    "double glazed windows": "Double glazed windows",
    "weekly_cleaning": "Weekly cleaning", "weekly cleaning": "Weekly cleaning",
    "microwave": "Microwave", "oven": "Oven",
    "gas_heating": "Gas heating", "gas heating": "Gas heating",
    "private_yard": "Private yard", "private yard": "Private yard",
}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW_DIR = PROJECT_ROOT / "data" / "raw"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def init_supabase() -> Client:
    """Connect to Supabase. Exits with a clear message on failure."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("=" * 60)
        print("ERROR: Supabase credentials not set.")
        print()
        print("Set these environment variables before running:")
        print()
        print('  export SUPABASE_URL="https://YOUR-REF.supabase.co"')
        print('  export SUPABASE_KEY="your-service-role-key"')
        print()
        print("Find them in: Supabase Dashboard → Project Settings → API")
        print("Use the service_role key (not anon) for write access.")
        print("=" * 60)
        sys.exit(1)

    try:
        client = create_client(url, key)
        # Quick connectivity test — will raise on bad URL/key
        client.table("landlords").select("landlord_id").limit(1).execute()
        return client
    except Exception as e:
        error_str = str(e)
        print("=" * 60)
        print("ERROR: Could not connect to Supabase.")
        print()
        if "PGRST" in error_str and "schema cache" in error_str:
            print("Tables don't exist yet. Run the migrations first:")
            print("  See docs/ingestion-guide.md for setup instructions.")
        elif "Invalid API key" in error_str or "JWSError" in error_str:
            print("Invalid API key. Check SUPABASE_KEY is the service_role key.")
        elif "Name or service not known" in error_str or "resolve" in error_str.lower():
            print("Cannot resolve SUPABASE_URL. Check the URL is correct.")
        else:
            print(f"Details: {e}")
        print()
        print(f"  SUPABASE_URL = {url}")
        print(f"  SUPABASE_KEY = {key[:20]}...")
        print("=" * 60)
        sys.exit(1)


def load_batch(path: Path) -> list[dict]:
    """Load a CSV or JSON batch file into a list of dicts."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".csv":
            with open(path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                if reader.fieldnames is None:
                    print(f"Error: CSV file '{path.name}' is empty or has no header row.")
                    sys.exit(1)
                # Check for expected columns
                missing_cols = [c for c in REQUIRED_FIELDS if c not in reader.fieldnames]
                if missing_cols:
                    print(f"Error: CSV is missing required columns: {missing_cols}")
                    print(f"  Found columns: {reader.fieldnames}")
                    print(f"  See templates/batch_template.csv for the expected format.")
                    sys.exit(1)
                return [row for row in reader]
        elif suffix == ".json":
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                data = [data]
            if not isinstance(data, list):
                print(f"Error: JSON file must contain an array of objects (got {type(data).__name__}).")
                sys.exit(1)
            if data:
                missing_keys = [k for k in REQUIRED_FIELDS if k not in data[0]]
                if missing_keys:
                    print(f"Warning: First JSON object is missing keys: {missing_keys}")
                    print(f"  Found keys: {list(data[0].keys())}")
            return data
        else:
            print(f"Error: Unsupported file format '{suffix}'. Use .csv or .json.")
            sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in '{path.name}': {e}")
        sys.exit(1)
    except UnicodeDecodeError as e:
        print(f"Error: File '{path.name}' is not valid UTF-8.")
        print(f"  {e}")
        print(f"  Tip: Convert with: iconv -f ISO-8859-7 -t UTF-8 {path.name} > fixed.{suffix[1:]}")
        sys.exit(1)
    except csv.Error as e:
        print(f"Error: Malformed CSV in '{path.name}': {e}")
        sys.exit(1)


def copy_to_staging(path: Path) -> Path:
    """Copy raw input file to data/raw/ with a timestamped filename."""
    DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    dest = DATA_RAW_DIR / f"batch_{timestamp}{path.suffix}"
    shutil.copy2(path, dest)
    print(f"Staged raw file → {dest}")
    return dest


def normalize_str(value) -> str:
    """Strip whitespace and normalize to single spaces."""
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def parse_bool(value) -> bool:
    """Parse a boolean from various representations."""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "y")
    return bool(value)


def parse_numeric(value, default=None):
    """Parse a numeric value, return default if empty/invalid."""
    if value is None or str(value).strip() == "":
        return default
    try:
        cleaned = str(value).strip().replace(",", ".").lstrip("€$£")
        return float(cleaned)
    except ValueError:
        return default


def normalize_property_type(raw: str):
    """Map raw property type to canonical name, or None if unknown."""
    key = raw.strip().lower()
    return PROPERTY_TYPE_MAP.get(key)


def parse_amenities(raw) -> list[str]:
    """Parse amenities from comma-separated string or list into canonical names."""
    if isinstance(raw, list):
        raw_list = [str(a).strip() for a in raw if a]
    elif isinstance(raw, str) and raw.strip():
        raw_list = [a.strip() for a in raw.split(",") if a.strip()]
    else:
        return []

    canonical = []
    for amenity in raw_list:
        normalized = AMENITY_NORMALIZE.get(amenity.lower().strip())
        canonical.append(normalized if normalized else amenity)
    return canonical


def validate_row(row: dict, row_index: int) -> list[str]:
    """Validate a single row, return list of error messages (empty = valid)."""
    errors = []

    # Check required fields
    for field in REQUIRED_FIELDS:
        val = row.get(field)
        if val is None or str(val).strip() == "":
            errors.append(f"Row {row_index + 1}: Missing required field '{field}'")

    if errors:
        return errors

    # Validate landlord_id format (4 digits)
    landlord_id = str(row["landlord_id"]).strip()
    if not re.match(r"^\d{4}$", landlord_id):
        errors.append(
            f"Row {row_index + 1}: landlord_id '{landlord_id}' is not 4 digits. "
            f"Expected format: 0001–9999."
        )

    # Validate listing_id if provided (7 digits)
    listing_id = str(row.get("listing_id", "")).strip()
    if listing_id and not re.match(r"^\d{7}$", listing_id):
        errors.append(
            f"Row {row_index + 1}: listing_id '{listing_id}' is not 7 digits. "
            f"Expected format: LLLLNNN (e.g., 0001001). Leave blank for auto-assignment."
        )

    # Validate coordinates
    lat = parse_numeric(row["lat"])
    lng = parse_numeric(row["lng"])
    if lat is None:
        errors.append(
            f"Row {row_index + 1}: lat '{row['lat']}' is not a valid number."
        )
    elif not (LAT_MIN <= lat <= LAT_MAX):
        errors.append(
            f"Row {row_index + 1}: lat {lat} is outside Thessaloniki bounds "
            f"({LAT_MIN}–{LAT_MAX}). If this listing is near IHU Thermi/Sindos, "
            f"the DB allows 40.55–40.70 — adjust LAT_MIN/LAT_MAX in the script."
        )
    if lng is None:
        errors.append(
            f"Row {row_index + 1}: lng '{row['lng']}' is not a valid number."
        )
    elif not (LNG_MIN <= lng <= LNG_MAX):
        errors.append(
            f"Row {row_index + 1}: lng {lng} is outside Thessaloniki bounds "
            f"({LNG_MIN}–{LNG_MAX}). If near IHU Thermi/Sindos, "
            f"the DB allows 22.80–23.05 — adjust LNG_MIN/LNG_MAX in the script."
        )

    # Validate price (allowed to be null — many landlords don't publish)
    price = parse_numeric(row.get("monthly_price"))
    if price is not None and price <= 0:
        errors.append(
            f"Row {row_index + 1}: monthly_price {price} must be positive "
            f"(or leave blank/null if price is not listed)."
        )

    # Validate property type
    pt = normalize_property_type(str(row["property_type"]))
    if pt is None:
        known = ", ".join(sorted(PROPERTY_TYPE_MAP.keys()))
        errors.append(
            f"Row {row_index + 1}: Unknown property_type '{row['property_type']}'. "
            f"Known types: {known}"
        )

    return errors


def resolve_listing_id(row: dict, supabase: Client, landlord_listing_counts: dict) -> str:
    """Assign listing_id if not already set. Format: LLLLNNN (7 digits)."""
    existing_id = str(row.get("listing_id", "")).strip()
    if existing_id and re.match(r"^\d{7}$", existing_id):
        return existing_id

    landlord_id = str(row["landlord_id"]).strip()

    if landlord_id not in landlord_listing_counts:
        # Query Supabase for the highest existing sequence for this landlord
        try:
            result = (
                supabase.table("listings")
                .select("listing_id")
                .like("listing_id", f"{landlord_id}%")
                .execute()
            )
        except Exception as e:
            raise RuntimeError(
                f"Failed to query existing listings for landlord {landlord_id}: {e}"
            ) from e

        max_suffix = 0
        for record in result.data:
            try:
                suffix = int(record["listing_id"][4:])
                max_suffix = max(max_suffix, suffix)
            except (ValueError, IndexError):
                pass
        landlord_listing_counts[landlord_id] = max_suffix

    landlord_listing_counts[landlord_id] += 1
    suffix = landlord_listing_counts[landlord_id]
    return f"{landlord_id}{suffix:03d}"


def get_or_create_property_type(supabase: Client, name: str, cache: dict) -> int:
    """Get property_type_id by name, creating if needed."""
    if name in cache:
        return cache[name]
    try:
        result = supabase.table("property_types").select("property_type_id").eq("name", name).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to look up property type '{name}': {e}") from e
    if result.data:
        cache[name] = result.data[0]["property_type_id"]
        return cache[name]
    try:
        result = supabase.table("property_types").insert({"name": name}).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to create property type '{name}': {e}") from e
    cache[name] = result.data[0]["property_type_id"]
    return cache[name]


def get_or_create_amenity(supabase: Client, name: str, cache: dict) -> int:
    """Get amenity_id by name, creating if needed."""
    if name in cache:
        return cache[name]
    try:
        result = supabase.table("amenities").select("amenity_id").eq("name", name).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to look up amenity '{name}': {e}") from e
    if result.data:
        cache[name] = result.data[0]["amenity_id"]
        return cache[name]
    try:
        result = supabase.table("amenities").insert({"name": name}).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to create amenity '{name}': {e}") from e
    cache[name] = result.data[0]["amenity_id"]
    return cache[name]


def upsert_listing(supabase: Client, row: dict, listing_id: str,
                   pt_cache: dict, amenity_cache: dict) -> str:
    """Upsert a single listing and all its dimension records. Returns 'inserted' or 'updated'."""
    landlord_id = str(row["landlord_id"]).strip()
    contact_info = normalize_str(row.get("contact_info", row.get("landlord_contact", "")))
    if not contact_info:
        contact_info = "N/A"

    # Upsert landlord
    try:
        supabase.table("landlords").upsert({
            "landlord_id": landlord_id,
            "name": normalize_str(row["landlord_name"]),
            "contact_info": contact_info,
        }).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to upsert landlord {landlord_id}: {e}") from e

    # Check if listing already exists (to determine insert vs update)
    existing = supabase.table("listings").select("listing_id, rent_id, location_id").eq("listing_id", listing_id).execute()
    is_update = len(existing.data) > 0

    # Upsert rent
    price = parse_numeric(row.get("monthly_price"))
    bills = parse_bool(row.get("bills_included", False))
    deposit = parse_numeric(row.get("deposit"), default=price)
    currency = normalize_str(row.get("currency", "EUR")) or "EUR"

    rent_data = {
        "monthly_price": price,
        "currency": currency,
        "bills_included": bills,
        "deposit": deposit,
    }
    try:
        if is_update:
            rent_id = existing.data[0]["rent_id"]
            supabase.table("rent").update(rent_data).eq("rent_id", rent_id).execute()
        else:
            result = supabase.table("rent").insert(rent_data).execute()
            rent_id = result.data[0]["rent_id"]
    except Exception as e:
        raise RuntimeError(f"Failed to upsert rent for {listing_id}: {e}") from e

    # Upsert location
    location_data = {
        "address": normalize_str(row["address"]),
        "neighborhood": normalize_str(row["neighborhood"]),
        "lat": parse_numeric(row["lat"]),
        "lng": parse_numeric(row["lng"]),
    }
    try:
        if is_update:
            location_id = existing.data[0]["location_id"]
            supabase.table("location").update(location_data).eq("location_id", location_id).execute()
        else:
            result = supabase.table("location").insert(location_data).execute()
            location_id = result.data[0]["location_id"]
    except Exception as e:
        raise RuntimeError(f"Failed to upsert location for {listing_id}: {e}") from e

    # Resolve property type
    pt_name = normalize_property_type(str(row["property_type"]))
    property_type_id = get_or_create_property_type(supabase, pt_name, pt_cache)

    # Upsert listing
    description = normalize_str(row.get("description", ""))
    listing_data = {
        "listing_id": listing_id,
        "landlord_id": landlord_id,
        "rent_id": rent_id,
        "location_id": location_id,
        "property_type_id": property_type_id,
        "description": description or None,
    }
    try:
        supabase.table("listings").upsert(listing_data).execute()
    except Exception as e:
        raise RuntimeError(
            f"Failed to upsert listing {listing_id}: {e}. "
            f"Check that listing_id is 7 digits and prefix matches landlord_id."
        ) from e

    # Upsert amenities (replace all for this listing)
    try:
        supabase.table("listing_amenities").delete().eq("listing_id", listing_id).execute()
    except Exception:
        pass  # OK if nothing to delete

    amenities_raw = row.get("amenities", "")
    amenity_names = parse_amenities(amenities_raw)
    for amenity_name in amenity_names:
        amenity_id = get_or_create_amenity(supabase, amenity_name, amenity_cache)
        try:
            supabase.table("listing_amenities").insert({
                "listing_id": listing_id,
                "amenity_id": amenity_id,
            }).execute()
        except Exception as e:
            print(f"    Warning: Failed to link amenity '{amenity_name}' to {listing_id}: {e}")

    return "updated" if is_update else "inserted"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Ingest a batch file into the Student Housing Directory.",
        epilog="See docs/ingestion-guide.md for full instructions.",
    )
    parser.add_argument("file", type=str, help="Path to CSV or JSON batch file")
    args = parser.parse_args()

    input_path = Path(args.file).resolve()
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Stage raw file
    copy_to_staging(input_path)

    # Load data
    rows = load_batch(input_path)
    print(f"Loaded {len(rows)} row(s) from {input_path.name}")

    if not rows:
        print("No data to process.")
        return

    # Validate all rows
    valid_rows = []
    all_errors = []
    for i, row in enumerate(rows):
        errors = validate_row(row, i)
        if errors:
            all_errors.append({"row": i + 1, "data": row, "errors": errors})
        else:
            valid_rows.append(row)

    # Write validation errors
    errors_path = input_path.parent / f"{input_path.stem}_validation_errors.json"
    if all_errors:
        with open(errors_path, "w", encoding="utf-8") as f:
            json.dump(all_errors, f, indent=2, ensure_ascii=False, default=str)
        print(f"Validation errors written → {errors_path}")
        for err in all_errors:
            for msg in err["errors"]:
                print(f"  ✗ {msg}")
    elif errors_path.exists():
        errors_path.unlink()

    print(f"\nValidation: {len(valid_rows)} valid, {len(all_errors)} rejected")

    if not valid_rows:
        print(f"All {len(rows)} rows failed validation. Nothing to upsert.")
        sys.exit(1)

    # Connect to Supabase
    print("\nConnecting to Supabase...")
    supabase = init_supabase()
    print("Connected.\n")

    # Upsert valid rows
    landlord_listing_counts: dict = {}
    pt_cache: dict = {}
    amenity_cache: dict = {}
    inserted = 0
    updated = 0
    upsert_errors = []

    for i, row in enumerate(valid_rows):
        try:
            listing_id = resolve_listing_id(row, supabase, landlord_listing_counts)
            result = upsert_listing(supabase, row, listing_id, pt_cache, amenity_cache)
            if result == "inserted":
                inserted += 1
            else:
                updated += 1
            print(f"  [{i+1}/{len(valid_rows)}] {listing_id} — {result}")
        except Exception as e:
            upsert_errors.append({"row": row, "error": str(e)})
            print(f"  [{i+1}/{len(valid_rows)}] ✗ Error: {e}")

    # Append upsert errors to validation errors file
    if upsert_errors:
        all_errors.extend([
            {"row": "upsert", "data": err["row"], "errors": [err["error"]]}
            for err in upsert_errors
        ])
        with open(errors_path, "w", encoding="utf-8") as f:
            json.dump(all_errors, f, indent=2, ensure_ascii=False, default=str)

    # Summary
    total_errors = len(all_errors)
    print(f"\n{'=' * 50}")
    print(f"Summary: {inserted} inserted, {updated} updated, {total_errors} errors")
    if total_errors > 0:
        print(f"Error details: {errors_path}")
    if inserted + updated > 0:
        print(f"\nNext step: run compute_distances.py to fill faculty_distances")
        print(f"  python3 scripts/compute_distances.py")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
