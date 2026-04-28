# Tests

Vitest scaffold (PR #wave-2). Run with:

- `npm run test` — single pass
- `npm run test:watch` — watch mode
- `npm run test:coverage` — v8 coverage report (HTML in `coverage/`)

## Layout

`__tests__/` mirrors `src/` paths. Example: `src/lib/transformListing.js` is
tested by `__tests__/lib/transformListing.test.js`.

## Deferred targets (TODO)

These were on the v1 wishlist but skipped because they need source-level
changes or heavy mocking:

- **`src/lib/requireStudent.js#hasAuthCookie`** — not exported. Test once it
  is, or via `requireStudent` with a stubbed `next/headers` + Supabase client.
- **`src/app/api/cron/synthetic-en-listing/route.js#evaluateBody`** — not
  exported. Same story; the cache-control assertion is the regression guard
  worth pinning.
- **`src/app/api/me/unread/route.js`** — needs a chained Supabase mock
  (`from().select().eq().maybeSingle()` for students, plus
  `listings!inner(landlord_id)` for landlords). Worth a dedicated PR with a
  reusable fluent-mock helper.
- **`AuthGate` locale handling** — needs jsdom + a `next-intl/server` mock.
  Cheaper to cover via Playwright once that lands.
