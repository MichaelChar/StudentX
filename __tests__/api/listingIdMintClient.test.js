import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  listing_id is minted as max(listing_id) + 1 for the landlord. That query must
  see EVERY one of their listings — drafts, submitted-awaiting-review and
  admin-revoked rows all still occupy an id.

  Both mint sites used to run on the anon client, and worked only because
  `listings` carries a SELECT policy of USING (true): the whole table is
  world-readable. Issue #555 proposes replacing that policy. Under any
  owner-scoped version, anon (auth.uid() is null) stops seeing the landlord's
  non-public rows, the max is computed from a subset, and the mint collides:

    landlord holds only drafts  → query returns []      → mints …001 → unique violation
    holds …001 live, …002 draft → max visible is …001   → mints …002 → unique violation

  i.e. the second listing a never-live landlord creates always 500s. This test
  is the tripwire for that, since nothing else would catch it until #555 ships.

  Source-level on purpose: the failure is a CLIENT CHOICE. A behavioural test
  would have to mock PostgREST's RLS semantics to reproduce it, which is
  precisely the thing that would be got wrong.
*/

const MINT_SITES = [
  'src/app/api/landlord/listings/route.js',
  'src/app/api/landlord/listings/[id]/duplicate/route.js',
];

const read = (f) => readFileSync(join(process.cwd(), f), 'utf8');

// The mint statement plus a little of what follows it.
function mintBlock(src) {
  const i = src.indexOf('const { data: maxRow }');
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, i + 320);
}

describe('listing_id mint must not run on the anon client (#555 prerequisite)', () => {
  it.each(MINT_SITES)('%s still mints from max(listing_id)', (f) => {
    const block = mintBlock(read(f));
    expect(block).toMatch(/\.from\('listings'\)/);
    expect(block).toMatch(/order\('listing_id'/);
  });

  it.each(MINT_SITES)('%s does NOT use the anon client for the mint', (f) => {
    expect(mintBlock(read(f))).not.toMatch(/getSupabase\s*\(\s*\)/);
  });

  it.each(MINT_SITES)('%s mints via a client that sees all statuses', (f) => {
    // `supabase` in both routes is getSupabaseAsService().
    expect(mintBlock(read(f))).toMatch(/await\s+supabase\s*$|await\s+supabase\s*\n/);
  });

  it.each(MINT_SITES)('%s still scopes the mint to the landlord', (f) => {
    // Service role bypasses RLS, so this .eq is the only scoping — losing it
    // would mint against the global max instead of the landlord's.
    expect(mintBlock(read(f))).toMatch(/\.eq\('landlord_id',\s*landlordId\)/);
  });

  it('the service client is actually what `supabase` is bound to in both routes', () => {
    for (const f of MINT_SITES) {
      expect(read(f)).toMatch(/const supabase = getSupabaseAsService\(\)/);
    }
  });
});
