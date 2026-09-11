#!/usr/bin/env bash
#
# Apply the anon-page Cache Rule described in docs/runbooks/cloudflare-cache-rule.md.
#
# WHY THIS EXISTS. The rule is the one piece of the edge-caching setup that
# cannot be committed — it lives in Cloudflare's config, not the repo. Doing it
# by hand in the dashboard means the expression that actually protects
# /student, /admin, /claim and every landlord surface is retyped from a doc,
# and a typo there is a session leak rather than a broken build. This makes it
# reviewable, diffable and repeatable.
#
# DRY RUN BY DEFAULT. Prints the current rule and the proposed one and changes
# nothing. Pass --apply to write.
#
# Usage:
#   export CF_API_TOKEN=...        # see "Token" below
#   ./scripts/cf-cache-rule.sh              # show the diff
#   ./scripts/cf-cache-rule.sh --apply      # write it
#   ./scripts/cf-cache-rule.sh --disable    # emergency rollback
#
# Token: create at https://dash.cloudflare.com/profile/api-tokens with
#   Zone → Cache Rules → Edit     (write the rule)
#   Zone → Zone → Read            (look up the zone id)
# scoped to the studentx.uk zone only. Nothing else is needed; do not use a
# Global API Key.
#
# Verification after --apply is in the runbook. The one that matters:
#   curl -sI -H 'Cookie: sb-access-token=stub' \
#     https://studentx.uk/property/thessaloniki/listing/0106002 \
#     | grep -iE 'cf-cache-status|cache-control'
# must be private/no-store and must NOT be HIT.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-studentx.uk}"
RULE_DESC="Cache anon public pages (edge)"
API="https://api.cloudflare.com/client/v4"

MODE="dryrun"
case "${1:-}" in
  --apply)   MODE="apply" ;;
  --disable) MODE="disable" ;;
  "")        MODE="dryrun" ;;
  *) echo "unknown arg: $1 (expected --apply, --disable, or nothing)" >&2; exit 2 ;;
esac

: "${CF_API_TOKEN:?CF_API_TOKEN is not set — see the header of this script}"

cf() { # cf METHOD PATH [BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $CF_API_TOKEN"
  fi
}

die_unless_success() { # reads JSON on stdin, echoes it back
  python3 -c '
import json,sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    sys.stderr.write("non-JSON response:\n" + raw[:500] + "\n"); sys.exit(1)
if not d.get("success"):
    sys.stderr.write("Cloudflare API error:\n")
    for e in d.get("errors", []):
        sys.stderr.write("  - %s (code %s)\n" % (e.get("message"), e.get("code")))
    sys.exit(1)
sys.stdout.write(raw)
'
}

# The expression. Kept verbatim in sync with docs/runbooks/cloudflare-cache-rule.md.
#
# The exclusions are belt-and-braces. The actual safety property is
# edge_ttl.mode = respect_origin below, which leaves anything the origin marks
# private/no-store uncached no matter what this expression matched.
read -r -d '' EXPRESSION <<'EXPR' || true
http.request.method eq "GET" and not http.cookie contains "sb-access-token" and not http.request.uri.path contains "/landlord" and not starts_with(http.request.uri.path, "/student") and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/claim") and not starts_with(http.request.uri.path, "/api/") and (http.request.uri.path eq "/" or starts_with(http.request.uri.path, "/about") or starts_with(http.request.uri.path, "/admissions") or starts_with(http.request.uri.path, "/gigs") or starts_with(http.request.uri.path, "/resources") or starts_with(http.request.uri.path, "/property"))
EXPR

echo "→ looking up zone $ZONE_NAME"
ZONE_ID=$(cf GET "/zones?name=$ZONE_NAME" | die_unless_success | python3 -c '
import json,sys
r = json.load(sys.stdin)["result"]
if not r:
    sys.stderr.write("zone not found — is the token scoped to this zone?\n"); sys.exit(1)
print(r[0]["id"])
')
echo "  zone id: $ZONE_ID"

echo "→ reading the cache-settings ruleset"
RULESET=$(cf GET "/zones/$ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" | die_unless_success)
RULESET_ID=$(echo "$RULESET" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["id"])')
echo "  ruleset id: $RULESET_ID"

echo
echo "=== CURRENT rules in this ruleset ==="
echo "$RULESET" | python3 -c '
import json,sys
rules = json.load(sys.stdin)["result"].get("rules", []) or []
if not rules:
    print("  (none)")
for r in rules:
    print("  id:          %s" % r.get("id"))
    print("  description: %s" % r.get("description"))
    print("  enabled:     %s" % r.get("enabled"))
    print("  action:      %s" % r.get("action"))
    print("  expression:  %s" % r.get("expression"))
    ap = r.get("action_parameters") or {}
    if ap:
        print("  params:      %s" % json.dumps(ap))
    print()
'

# Target the FIRST rule in the cache phase — the repo has only ever had one.
# If that stops being true this needs a real selector, so bail loudly rather
# than guessing which one to overwrite.
RULE_ID=$(echo "$RULESET" | python3 -c '
import json,sys
rules = json.load(sys.stdin)["result"].get("rules", []) or []
if len(rules) > 1:
    sys.stderr.write("ERROR: %d rules in the cache phase; this script assumes one.\n"
                     "Pick the right id by hand and edit the script.\n" % len(rules))
    sys.exit(1)
print(rules[0]["id"] if rules else "")
')

BODY=$(MODE="$MODE" RULE_DESC="$RULE_DESC" EXPRESSION="$EXPRESSION" python3 -c '
import json,os
enabled = os.environ["MODE"] != "disable"
print(json.dumps({
    "description": os.environ["RULE_DESC"],
    "expression": os.environ["EXPRESSION"],
    "action": "set_cache_settings",
    "enabled": enabled,
    "action_parameters": {
        "cache": True,
        # respect_origin == dashboard "Use cache-control header if present".
        # This is the load-bearing setting: a private/no-store response stays
        # uncached even if the expression matched it. Never use override_origin.
        "edge_ttl":    {"mode": "respect_origin"},
        "browser_ttl": {"mode": "respect_origin"},
    },
}, indent=2))
')

echo "=== PROPOSED rule ==="
echo "$BODY" | sed 's/^/  /'
echo

if [ "$MODE" = "dryrun" ]; then
  echo "DRY RUN — nothing changed. Re-run with --apply to write it."
  exit 0
fi

if [ -n "$RULE_ID" ]; then
  echo "→ ${MODE}ing existing rule $RULE_ID"
  cf PATCH "/zones/$ZONE_ID/rulesets/$RULESET_ID/rules/$RULE_ID" "$BODY" | die_unless_success > /dev/null
else
  echo "→ creating a new rule (none existed)"
  cf POST "/zones/$ZONE_ID/rulesets/$RULESET_ID/rules" "$BODY" | die_unless_success > /dev/null
fi

echo "  done."
echo
echo "Now verify — the authed request is the one that matters:"
echo
echo "  curl -sI https://studentx.uk/property/thessaloniki/listing/0106002 | grep -i cf-cache-status"
echo "  curl -sI https://studentx.uk/property/thessaloniki/listing/0106002 | grep -i cf-cache-status   # expect HIT"
echo
echo "  curl -sI -H 'Cookie: sb-access-token=stub' \\"
echo "    https://studentx.uk/property/thessaloniki/listing/0106002 \\"
echo "    | grep -iE 'cf-cache-status|cache-control'   # expect private/no-store, NOT HIT"
echo
echo "If that last one says HIT, run: $0 --disable"
