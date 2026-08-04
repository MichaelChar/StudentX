"""
Kill switch for the batch-ingestion pipeline.

Ingestion is DISABLED. Migration 104 made public visibility admin-only:
`listings.listing_status` defaults to 'disabled', and `/admin/listing-go-live`
will only publish a listing that is submitted, has an ID-verified landlord
(`landlords.is_verified`), and has a completed video-call row in
`property_verifications`.

A scraped/ingested listing has none of those. So ingestion would write rows
that are invisible to students AND impossible to publish through the admin UI
— a silent dead end, with no error at ingest time and nothing in the validate
output to reveal it. Disabling the entry points is honest about that rather
than letting batches land in a state nobody can act on.

To re-enable, one of these has to be true first:
  1. The scripts stamp `listing_status='active'` explicitly, consciously
     bypassing the go-live gate for curated inventory; or
  2. `canAdminGoLive()` in src/lib/listingGoLive.js grows a curated-source
     exemption (e.g. keyed on `flags.source`), so ingested rows can be
     approved through the normal admin queue.

Until then, set INGESTION_ENABLED=1 in the environment for a one-off
deliberate run — the guard is a safety catch, not a lock.
"""

import os
import sys

DOC = "docs/ingestion-guide.md"


def require_ingestion_enabled(script_name):
    """Exit unless the operator has explicitly opted in for this run."""
    if os.environ.get("INGESTION_ENABLED") == "1":
        print(f"[{script_name}] INGESTION_ENABLED=1 — running despite the feature being disabled.")
        print("  Ingested listings will NOT be publicly visible (listing_status defaults")
        print(f"  to 'disabled' since migration 104). See {DOC}.")
        return

    print(f"Ingestion is disabled — {script_name} did not run.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Since migration 104, public visibility is admin go-live only, and the", file=sys.stderr)
    print("go-live gate requires landlord ID verification plus a completed video", file=sys.stderr)
    print("call. Ingested listings have neither, so they would be written invisible", file=sys.stderr)
    print("and could never be published.", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"Background and the two ways to re-enable: {DOC}", file=sys.stderr)
    print("Override for a single deliberate run: INGESTION_ENABLED=1", file=sys.stderr)
    sys.exit(1)
