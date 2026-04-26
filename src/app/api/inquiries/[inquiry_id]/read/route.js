import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
} from '@/lib/supabaseServer';

/**
 * Marks the *other* side's unread messages as read for this inquiry and
 * zeroes the caller-side unread counter. Implemented as the
 * mark_messages_read SECURITY DEFINER RPC so a single round-trip handles
 * both updates atomically; the RPC itself is bound to the caller's
 * auth.uid() so a student can't mark a landlord's view read or vice versa.
 */
export async function POST(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inquiry_id: inquiryId } = await params;
  const supabase = getSupabaseWithToken(token);

  const { error } = await supabase.rpc('mark_messages_read', { p_inquiry_id: inquiryId });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('mark_messages_read RPC error:', error);
    return NextResponse.json({ error: 'Failed to mark read' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
