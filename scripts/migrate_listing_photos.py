#!/usr/bin/env python3
"""
One-off migration script: Wix CDN -> Supabase Storage for listing photos.

Production listings hotlink photos from static.wixstatic.com (12 of 13 listings
at time of writing). If Wix goes down or revokes hotlinking, the gallery and
og:image break sitewide. This script copies every Wix-hosted photo into our
own Supabase Storage bucket (`listing-photos`) and rewrites
`listings.photos[]` to point at the new URLs.

Usage:
    # Dry run (default — prints what would happen, mutates nothing)
    python3 scripts/migrate_listing_photos.py --dry-run

    # Apply (actually fetch, upload, and update DB)
    python3 scripts/migrate_listing_photos.py --apply

    # Restrict to one listing
    python3 scripts/migrate_listing_photos.py --apply --listing 0100001

    # Override bucket (rare)
    python3 scripts/migrate_listing_photos.py --apply --bucket listing-photos

Idempotency:
    - Skips photos whose URL is already a Supabase Storage URL pointing at the
      expected destination.
    - If the destination object already exists in Storage with matching size,
      skips the upload but still rewrites the DB row (covers the case where a
      previous run uploaded but failed before the DB update).

Safety:
    - --dry-run is the default. --apply is required for any side effect.
    - On any photo failure within a listing, the listing's photos array is
      NOT updated (all-or-nothing per listing).
    - Before any DB write, captures rollback SQL to
      scripts/migrate_listing_photos.rollback.sql so a previous-state restore
      is one psql invocation away.

Pre-flight (one-time):
    The `listing-photos` Supabase Storage bucket must exist and be public.
    Create it via the Supabase Dashboard. See
    docs/runbooks/listing-photos-migration.md for the bucket policy snippet.

Environment variables required:
    SUPABASE_URL  - Supabase project URL (e.g. https://abc.supabase.co)
    SUPABASE_KEY  - Supabase service role key (anon won't have write access
                    to Storage or the listings table for this script's needs)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("Error: requests library is not installed.")
    print("  Fix: pip install -r scripts/requirements.txt")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py is not installed.")
    print("  Fix: pip install -r scripts/requirements.txt")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WIX_HOST = "static.wixstatic.com"
DEFAULT_BUCKET = "listing-photos"
FETCH_TIMEOUT = 15  # seconds per image fetch
MAX_RETRIES = 3
ROLLBACK_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "migrate_listing_photos.rollback.sql",
)

# Map of common Content-Type values to file extensions. Anything not in this
# map falls back to "jpg" (the most common case in production data) so we
# always end up with *some* extension on disk.
CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
}
DEFAULT_EXT = "jpg"


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def init_supabase() -> tuple[Client, str]:
    """Connect to Supabase. Returns (client, project_url). Exits on failure."""
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
        print("Find them in: Supabase Dashboard -> Project Settings -> API")
        print("(Service role key required — anon key won't work for Storage")
        print(" uploads + listings updates.)")
        print("=" * 60)
        sys.exit(1)

    try:
        client = create_client(url, key)
        client.table("listings").select("listing_id").limit(1).execute()
        return client, url.rstrip("/")
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


def fetch_listings(supabase: Client, listing_filter: str | None) -> list[dict]:
    """Fetch all listings with photos arrays. Optionally filter to one id."""
    try:
        query = supabase.table("listings").select("listing_id, photos")
        if listing_filter:
            query = query.eq("listing_id", listing_filter)
        result = query.execute()
    except Exception as e:
        print(f"Error fetching listings: {e}")
        sys.exit(1)

    if listing_filter and not result.data:
        print(f"Error: Listing '{listing_filter}' not found.")
        sys.exit(1)

    return result.data or []


# ---------------------------------------------------------------------------
# URL classification
# ---------------------------------------------------------------------------

def is_wix_url(url: str) -> bool:
    """True iff url is hosted on static.wixstatic.com."""
    try:
        return urlparse(url).hostname == WIX_HOST
    except Exception:
        return False


def is_storage_url(url: str, project_url: str, bucket: str) -> bool:
    """True iff url already points at our Supabase Storage bucket."""
    expected_prefix = f"{project_url}/storage/v1/object/public/{bucket}/"
    return isinstance(url, str) and url.startswith(expected_prefix)


def storage_path_for(listing_id: str, index: int, ext: str) -> str:
    """Compute the in-bucket object path: <listing_id>/<NNN>.<ext>."""
    return f"{listing_id}/{index:03d}.{ext}"


def public_url_for(project_url: str, bucket: str, path: str) -> str:
    """Compute the public Storage URL for an in-bucket path."""
    return f"{project_url}/storage/v1/object/public/{bucket}/{path}"


# ---------------------------------------------------------------------------
# Fetch + upload
# ---------------------------------------------------------------------------

def fetch_image(url: str) -> tuple[bytes, str] | tuple[None, None]:
    """
    Fetch an image with retry-on-timeout. Returns (bytes, content_type).
    Returns (None, None) on permanent failure.
    """
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            return resp.content, content_type
        except requests.exceptions.Timeout:
            last_error = f"Timeout after {FETCH_TIMEOUT}s"
            if attempt < MAX_RETRIES:
                wait = 2 * attempt
                print(f"      Fetch timeout, retry {attempt}/{MAX_RETRIES} in {wait}s...")
                time.sleep(wait)
            continue
        except requests.exceptions.ConnectionError as e:
            last_error = f"Connection error: {e}"
            if attempt < MAX_RETRIES:
                wait = 2 * attempt
                print(f"      Connection error, retry {attempt}/{MAX_RETRIES} in {wait}s...")
                time.sleep(wait)
            continue
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else "unknown"
            last_error = f"HTTP {status}"
            # 4xx is permanent; 5xx may benefit from retry
            if isinstance(status, int) and 500 <= status < 600 and attempt < MAX_RETRIES:
                wait = 2 * attempt
                print(f"      HTTP {status}, retry {attempt}/{MAX_RETRIES} in {wait}s...")
                time.sleep(wait)
                continue
            break

    print(f"      Fetch failed after {MAX_RETRIES} attempts: {last_error}")
    return None, None


def ext_from_content_type(content_type: str) -> str:
    """Map a Content-Type to a filename extension; falls back to jpg."""
    return CONTENT_TYPE_EXT.get(content_type, DEFAULT_EXT)


def storage_object_size(supabase: Client, bucket: str, path: str) -> int | None:
    """
    Returns the size in bytes of an existing object, or None if missing.
    Uses Storage list() under the prefix because the supabase-py client
    doesn't expose a direct stat() — list() returns objects with metadata.
    """
    parent = path.rsplit("/", 1)[0] if "/" in path else ""
    target_name = path.rsplit("/", 1)[-1]
    try:
        items = supabase.storage.from_(bucket).list(parent)
    except Exception:
        return None
    for item in items or []:
        if item.get("name") == target_name:
            metadata = item.get("metadata") or {}
            size = metadata.get("size")
            if isinstance(size, (int, float)):
                return int(size)
            return None
    return None


def upload_to_storage(
    supabase: Client,
    bucket: str,
    path: str,
    data: bytes,
    content_type: str,
) -> str | None:
    """Upload bytes to Storage. Returns an error string, or None on success."""
    try:
        supabase.storage.from_(bucket).upload(
            path=path,
            file=data,
            file_options={
                # cache_control: a year is fine — content-addressed by index
                "cache-control": "31536000",
                "content-type": content_type or "application/octet-stream",
                # upsert=true so re-runs overwrite on byte-mismatch
                "upsert": "true",
            },
        )
        return None
    except Exception as e:
        return str(e)


# ---------------------------------------------------------------------------
# Per-listing migration
# ---------------------------------------------------------------------------

def migrate_listing(
    supabase: Client,
    listing: dict,
    project_url: str,
    bucket: str,
    apply: bool,
) -> dict:
    """
    Process one listing. Returns a result dict:
        {
            "listing_id": str,
            "new_photos": list[str] | None,    # only if all photos succeeded
            "migrated": int,
            "skipped": int,
            "failed": int,
            "errors": list[str],
        }
    Caller decides whether to UPDATE the DB based on whether failed == 0.
    """
    listing_id = listing["listing_id"]
    photos = listing.get("photos") or []
    result = {
        "listing_id": listing_id,
        "new_photos": None,
        "migrated": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
    }

    new_photos: list[str] = []
    for idx, src_url in enumerate(photos):
        # Non-Wix and non-storage URLs (e.g. a host we don't manage): keep as-is.
        if not isinstance(src_url, str) or not src_url:
            new_photos.append(src_url)
            result["skipped"] += 1
            continue

        if is_storage_url(src_url, project_url, bucket):
            # Already migrated — keep as is.
            new_photos.append(src_url)
            result["skipped"] += 1
            continue

        if not is_wix_url(src_url):
            # Some other host, leave it alone.
            new_photos.append(src_url)
            result["skipped"] += 1
            continue

        # --- Wix URL: needs migration ---
        print(f"    [{idx:03d}] {src_url}")

        data, content_type = fetch_image(src_url)
        if data is None:
            err = f"fetch failed for index {idx}: {src_url}"
            print(f"      FAILED: {err}")
            result["failed"] += 1
            result["errors"].append(err)
            new_photos.append(src_url)  # keep original on failure
            continue

        ext = ext_from_content_type(content_type)
        path = storage_path_for(listing_id, idx, ext)
        dest_url = public_url_for(project_url, bucket, path)

        # Idempotency: if the destination object already exists with matching
        # size, skip the upload but still rewrite the DB row.
        existing_size = storage_object_size(supabase, bucket, path)
        size_match = existing_size is not None and existing_size == len(data)

        if not apply:
            action = "would skip upload (size match)" if size_match else "would upload"
            print(f"      DRY: {action} -> {bucket}/{path} ({len(data)} bytes, {content_type or 'unknown'})")
            print(f"      DRY: would rewrite photos[{idx}] -> {dest_url}")
            new_photos.append(dest_url)
            result["migrated"] += 1
            continue

        if size_match:
            print(f"      SKIP upload: object exists with matching size ({existing_size} bytes)")
        else:
            print(f"      UPLOAD -> {bucket}/{path} ({len(data)} bytes, {content_type or 'unknown'})")
            err = upload_to_storage(supabase, bucket, path, data, content_type)
            if err:
                msg = f"upload failed for index {idx}: {err}"
                print(f"      FAILED: {msg}")
                result["failed"] += 1
                result["errors"].append(msg)
                new_photos.append(src_url)  # keep original on failure
                continue

        new_photos.append(dest_url)
        result["migrated"] += 1

    # Only return new_photos if every photo either migrated or was safely
    # skipped. If anything failed, the caller must NOT update the DB row.
    if result["failed"] == 0:
        result["new_photos"] = new_photos
    return result


# ---------------------------------------------------------------------------
# Rollback SQL capture
# ---------------------------------------------------------------------------

def append_rollback_sql(listing_id: str, original_photos: list[str]) -> None:
    """
    Append a SQL UPDATE statement that restores this listing's photos to the
    pre-migration state. Written incrementally so a crash mid-run still
    leaves a valid rollback for whatever rows were touched.
    """
    # Build a Postgres array literal with safe escaping.
    parts = []
    for url in original_photos:
        if url is None:
            parts.append("NULL")
            continue
        # Escape single quotes by doubling them; Postgres array literal syntax.
        escaped = str(url).replace("'", "''")
        parts.append(f"'{escaped}'")
    array_literal = "ARRAY[" + ", ".join(parts) + "]::text[]"

    line = (
        f"UPDATE listings SET photos = {array_literal} "
        f"WHERE listing_id = '{listing_id}';\n"
    )

    # Create the file with a header on first write.
    new_file = not os.path.exists(ROLLBACK_PATH)
    with open(ROLLBACK_PATH, "a", encoding="utf-8") as f:
        if new_file:
            f.write("-- Rollback for migrate_listing_photos.py\n")
            f.write("-- Generated automatically before each --apply DB write.\n")
            f.write("-- Apply via: psql $DATABASE_URL -f scripts/migrate_listing_photos.rollback.sql\n")
            f.write("BEGIN;\n")
        f.write(line)


def finalize_rollback_sql() -> None:
    """Append COMMIT to the rollback file if it was opened."""
    if os.path.exists(ROLLBACK_PATH):
        with open(ROLLBACK_PATH, "a", encoding="utf-8") as f:
            f.write("COMMIT;\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate Wix-hotlinked listing photos into Supabase Storage.",
        epilog="Default mode is --dry-run. Use --apply to actually mutate.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually perform fetches, uploads, and DB updates. Required for any side effect.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print every action that would be taken; mutate nothing. Default if --apply is absent.",
    )
    parser.add_argument(
        "--listing",
        type=str,
        default=None,
        help="Restrict to a single listing_id.",
    )
    parser.add_argument(
        "--only-wix",
        action="store_true",
        help="(Default behavior) Only touch listings with at least one wixstatic URL. "
             "Flag is explicit for forward-compat.",
    )
    parser.add_argument(
        "--bucket",
        type=str,
        default=DEFAULT_BUCKET,
        help=f"Supabase Storage bucket name (default: {DEFAULT_BUCKET})",
    )
    args = parser.parse_args()

    # Resolve effective mode. --apply wins; otherwise dry-run.
    apply = bool(args.apply)
    if apply and args.dry_run:
        print("Both --apply and --dry-run passed; --apply wins.")
    if not apply:
        print("Mode: DRY-RUN (no writes will occur). Pass --apply to mutate.")
    else:
        print("Mode: APPLY (will fetch, upload, and update DB).")
    print(f"Bucket: {args.bucket}")
    print()

    print("Connecting to Supabase...")
    supabase, project_url = init_supabase()
    print(f"Connected to {project_url}\n")

    print("Fetching listings...")
    all_listings = fetch_listings(supabase, args.listing)
    print(f"  Found {len(all_listings)} listing(s) total")

    # Filter to listings that have at least one wixstatic URL. Both default
    # behavior and explicit --only-wix produce the same result; the flag
    # exists so a future reader can tell that this script is wix-scoped.
    affected = [
        l for l in all_listings
        if any(is_wix_url(u) for u in (l.get("photos") or []) if isinstance(u, str))
    ]
    print(f"  {len(affected)} listing(s) have at least one wixstatic.com URL")

    if not affected:
        print("\nNothing to do.")
        return 0

    # If we're applying, wipe any stale rollback file so each run starts fresh.
    if apply and os.path.exists(ROLLBACK_PATH):
        os.remove(ROLLBACK_PATH)

    totals = {"migrated": 0, "skipped": 0, "failed": 0, "listings_updated": 0, "listings_failed": 0}
    print()

    for listing in affected:
        listing_id = listing["listing_id"]
        original_photos = list(listing.get("photos") or [])
        print(f"Listing {listing_id} ({len(original_photos)} photo(s)):")
        result = migrate_listing(supabase, listing, project_url, args.bucket, apply)

        totals["migrated"] += result["migrated"]
        totals["skipped"] += result["skipped"]
        totals["failed"] += result["failed"]

        if result["failed"] > 0:
            print(f"  -> {result['failed']} failure(s); NOT updating photos array for this listing.")
            for err in result["errors"]:
                print(f"     - {err}")
            totals["listings_failed"] += 1
            print()
            continue

        new_photos = result["new_photos"]
        if new_photos == original_photos:
            print("  -> no changes (all photos already migrated or non-Wix)")
            print()
            continue

        if not apply:
            print(f"  -> DRY: would UPDATE listings SET photos=<{len(new_photos)} urls> "
                  f"WHERE listing_id='{listing_id}'")
            print()
            continue

        # Capture rollback BEFORE issuing the UPDATE so a crash here still
        # leaves a recoverable trail.
        append_rollback_sql(listing_id, original_photos)
        try:
            supabase.table("listings").update({"photos": new_photos}).eq("listing_id", listing_id).execute()
            print(f"  -> UPDATED listings.photos for {listing_id}")
            totals["listings_updated"] += 1
        except Exception as e:
            print(f"  -> DB UPDATE failed: {e}")
            totals["listings_failed"] += 1
        print()

    if apply:
        finalize_rollback_sql()

    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"  Photos migrated:   {totals['migrated']}")
    print(f"  Photos skipped:    {totals['skipped']}")
    print(f"  Photos failed:     {totals['failed']}")
    if apply:
        print(f"  Listings updated:  {totals['listings_updated']}")
        print(f"  Listings failed:   {totals['listings_failed']}")
        if totals["listings_updated"] > 0:
            print(f"  Rollback SQL:      {ROLLBACK_PATH}")
    else:
        print("  (dry-run: no writes performed)")
    print("=" * 60)

    return 1 if totals["failed"] > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
