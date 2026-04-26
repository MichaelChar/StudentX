// Names of the cookies SessionSync writes from the browser. Server-side
// helpers (requireStudent, requireLandlord) read these to materialise an
// auth context inside RSCs and route handlers without dragging in the
// Supabase auth-helpers package — which is heavier than we need and not
// fully tested on the @opennextjs/cloudflare adapter.
export const SB_ACCESS_TOKEN_COOKIE = 'sb-access-token';

// 1 hour matches Supabase's default access-token TTL. autoRefreshToken on
// the browser will refresh the JWT before expiry and SessionSync will
// rewrite the cookie via /api/auth/session, so this lifetime just bounds
// how long a stolen cookie is replayable.
export const SB_ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;
