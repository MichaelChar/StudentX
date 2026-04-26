#!/usr/bin/env python3
"""
Distance precomputation script for the Student Housing Directory.

Reads all listings and all faculty reference points from Supabase, computes
walk_minutes and transit_minutes using OSRM, and writes results to the
faculty_distances table.

Usage:
    python3 scripts/compute_distances.py
    python3 scripts/compute_distances.py --only-missing   # skip already-computed pairs
    python3 scripts/compute_distances.py --listing 0100001 # compute for one listing only

Re-run when:
    - A new listing is added (or its location_id changes)
    - A faculty's coordinates change
    - The pace model below is updated

Environment variables required:
    SUPABASE_URL      - Supabase project URL
    SUPABASE_KEY      - Supabase service role key (anon won't have write
                        access to faculty_distances)

OSRM notes:
    - Uses the public OSRM demo server (router.project-osrm.org) over HTTPS
    - We pull *distances* (not durations) from the foot profile and convert
      to minutes ourselves, because the public demo's foot duration is
      broken — it returns car-speed durations regardless of profile.
      Distances are real road distances and are correct.
    - Pace model (Thessaloniki city averages):
          walking:  5 km/h  =>  83 m/min
          transit:  ~15 km/h average bus speed (in-vehicle, with stops)
                    =>  250 m/min, plus a 5-min wait/walk-to-stop overhead
      Bus is therefore worse than walking for short trips and quicker for
      longer ones, which matches lived experience in the city.
    - Rate-limited to ~1 request/second to respect the public server
"""

import argparse
import math
import os
import sys
import time

try:
    import requests
except ImportError:
    print("Error: requests library is not installed.")
    print("  Fix: pip install requests")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py is not installed.")
    print("  Fix: pip install supabase")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OSRM_BASE = "https://router.project-osrm.org"
REQUEST_DELAY = 1.1  # seconds between OSRM requests (rate limiting)
OSRM_TIMEOUT = 15  # seconds per HTTP request
MAX_RETRIES = 3  # retry failed OSRM requests

# Pace conversion (see docstring). Tweak together if Thessaloniki transit
# meaningfully changes (e.g. metro opens) so walk/transit stay coherent.
WALK_M_PER_MIN = 83          # 5 km/h walking pace
BUS_M_PER_MIN = 250          # ~15 km/h average bus speed incl. stops
BUS_OVERHEAD_MIN = 5         # avg wait + walk-to/from-stop


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
        print("=" * 60)
        sys.exit(1)

    try:
        client = create_client(url, key)
        client.table("listings").select("listing_id").limit(1).execute()
        return client
    except Exception as e:
        error_str = str(e)
        print("=" * 60)
        print("ERROR: Could not connect to Supabase.")
        print()
        if "PGRST" in error_str and "schema cache" in error_str:
            print("Tables don't exist yet. Run the migrations first.")
        elif "Invalid API key" in error_str:
            print("Invalid API key. Check SUPABASE_KEY.")
        else:
            print(f"Details: {e}")
        print("=" * 60)
        sys.exit(1)


def fetch_listings(supabase: Client) -> list[dict]:
    """Fetch all listings with their location coordinates."""
    try:
        result = supabase.table("listings").select("listing_id, location_id").execute()
    except Exception as e:
        print(f"Error fetching listings: {e}")
        sys.exit(1)

    listings = []
    for row in result.data:
        try:
            loc = (
                supabase.table("location")
                .select("lat, lng")
                .eq("location_id", row["location_id"])
                .execute()
            )
        except Exception as e:
            print(f"  Warning: Could not fetch location for {row['listing_id']}: {e}")
            continue

        if loc.data:
            listings.append({
                "listing_id": row["listing_id"],
                "lat": float(loc.data[0]["lat"]),
                "lng": float(loc.data[0]["lng"]),
            })
        else:
            print(f"  Warning: No location record for listing {row['listing_id']} "
                  f"(location_id={row['location_id']})")
    return listings


def fetch_faculties(supabase: Client) -> list[dict]:
    """Fetch all faculty reference points."""
    try:
        result = supabase.table("faculties").select("*").execute()
    except Exception as e:
        print(f"Error fetching faculties: {e}")
        sys.exit(1)

    if not result.data:
        print("Error: No faculty reference points found in the database.")
        print("  Run migration 002_seed_faculties.sql first.")
        sys.exit(1)

    return [
        {
            "faculty_id": r["faculty_id"],
            "name": r["name"],
            "lat": float(r["lat"]),
            "lng": float(r["lng"]),
        }
        for r in result.data
    ]


def fetch_existing_pairs(supabase: Client) -> set:
    """Fetch all existing (listing_id, faculty_id) pairs from faculty_distances."""
    try:
        result = supabase.table("faculty_distances").select("listing_id, faculty_id").execute()
        return {(r["listing_id"], r["faculty_id"]) for r in result.data}
    except Exception:
        return set()


def osrm_route_distance_m(origin_lng: float, origin_lat: float,
                          dest_lng: float, dest_lat: float) -> float | None:
    """
    Query OSRM for the foot-profile *route distance* in metres.
    We deliberately ignore OSRM's duration here — the public demo's foot
    profile returns car-speed durations (long-standing demo data issue).
    Distances are real road distances and reliable.
    Returns None on failure. Retries on timeout.
    OSRM expects coordinates as lng,lat.
    """
    url = (
        f"{OSRM_BASE}/route/v1/foot/"
        f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        f"?overview=false"
    )

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=OSRM_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") == "Ok" and data.get("routes"):
                return float(data["routes"][0]["distance"])
            if data.get("code") == "NoRoute":
                print("      OSRM: No route found")
                return None
            print(f"      OSRM unexpected response: {data.get('code')}")
            return None
        except requests.exceptions.Timeout:
            last_error = f"Timeout after {OSRM_TIMEOUT}s"
            if attempt < MAX_RETRIES:
                print(f"      OSRM timeout, retry {attempt}/{MAX_RETRIES}...")
                time.sleep(2 * attempt)
            continue
        except requests.exceptions.ConnectionError as e:
            last_error = f"Connection error: {e}"
            if attempt < MAX_RETRIES:
                print(f"      OSRM connection error, retry {attempt}/{MAX_RETRIES}...")
                time.sleep(2 * attempt)
            continue
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else "unknown"
            if status == 429:
                last_error = "Rate limited (429)"
                wait = 5 * attempt
                print(f"      OSRM rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"      OSRM HTTP {status}: {e}")
            return None
        except (KeyError, IndexError, ValueError) as e:
            print(f"      OSRM parse error: {e}")
            return None

    print(f"      OSRM failed after {MAX_RETRIES} retries: {last_error}")
    return None


def compute_minutes(listing: dict, faculty: dict) -> tuple[int, int] | tuple[None, None]:
    """
    Returns (walk_minutes, transit_minutes) computed from the road
    distance using the pace model in the module docstring.
    Single OSRM hit per pair (only the distance, not duration).
    """
    distance_m = osrm_route_distance_m(
        listing["lng"], listing["lat"], faculty["lng"], faculty["lat"]
    )
    if distance_m is None:
        return (None, None)
    walk = max(1, math.ceil(distance_m / WALK_M_PER_MIN))
    transit = math.ceil(distance_m / BUS_M_PER_MIN) + BUS_OVERHEAD_MIN
    return (walk, transit)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Compute walk/transit distances from listings to university faculties.",
        epilog="Distances are computed via OSRM and stored in the faculty_distances table.",
    )
    parser.add_argument("--only-missing", action="store_true",
                        help="Only compute pairs not already in faculty_distances")
    parser.add_argument("--listing", type=str, default=None,
                        help="Compute distances for a single listing_id only")
    args = parser.parse_args()

    print("Connecting to Supabase...")
    supabase = init_supabase()
    print("Connected.\n")

    print("Fetching listings...")
    listings = fetch_listings(supabase)
    print(f"  Found {len(listings)} listing(s)")

    if args.listing:
        listings = [l for l in listings if l["listing_id"] == args.listing]
        if not listings:
            print(f"Error: Listing '{args.listing}' not found in database.")
            sys.exit(1)
        print(f"  Filtered to: {args.listing}")

    if not listings:
        print("No listings to process.")
        return

    print("Fetching faculties...")
    faculties = fetch_faculties(supabase)
    print(f"  Found {len(faculties)} faculty reference point(s)")

    # Determine which pairs to compute
    existing_pairs = set()
    if args.only_missing:
        print("Checking existing distances...")
        existing_pairs = fetch_existing_pairs(supabase)
        print(f"  {len(existing_pairs)} already computed")

    pairs_to_compute = []
    for listing in listings:
        for faculty in faculties:
            key = (listing["listing_id"], faculty["faculty_id"])
            if key not in existing_pairs:
                pairs_to_compute.append((listing, faculty))

    if not pairs_to_compute:
        print("\nAll distance pairs already computed. Nothing to do.")
        return

    total = len(pairs_to_compute)
    est_minutes = total * REQUEST_DELAY / 60  # one OSRM hit per pair now
    print(f"\nComputing {total} listing–faculty pairs...")
    print(f"(Rate limited to {REQUEST_DELAY}s/request, estimated {est_minutes:.1f} minutes)\n")

    completed = 0
    errors = 0

    for listing, faculty in pairs_to_compute:
        completed += 1
        lid = listing["listing_id"]
        fid = faculty["faculty_id"]
        label = f"[{completed}/{total}] {lid} → {fid}"

        walk, transit = compute_minutes(listing, faculty)
        time.sleep(REQUEST_DELAY)

        if walk is None or transit is None:
            print(f"  {label} — FAILED (no route)")
            errors += 1
            continue

        try:
            supabase.table("faculty_distances").upsert({
                "listing_id": lid,
                "faculty_id": fid,
                "walk_minutes": walk,
                "transit_minutes": transit,
            }).execute()
            print(f"  {label} — walk: {walk}min, transit: {transit}min")
        except Exception as e:
            print(f"  {label} — DB write error: {e}")
            errors += 1

    print(f"\n{'=' * 50}")
    print(f"Done. {completed - errors}/{total} pairs computed, {errors} errors.")
    if errors > 0:
        print(f"Re-run with --only-missing to retry failed pairs.")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
