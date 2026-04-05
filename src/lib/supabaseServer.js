import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client that uses the caller's JWT.
 * RLS policies run as the authenticated user.
 */
export function getSupabaseWithToken(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

/**
 * Validates a JWT and returns the Supabase user, or null if invalid.
 */
export async function getUserFromToken(token) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * Extracts the Bearer token from an Authorization header.
 */
export function extractToken(request) {
  const header = request.headers.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
