/**
 * Service-role helpers for listing_availability_blocks.
 * Students cannot write blocks under RLS — booking paths use the service client.
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';

/**
 * Insert a pending hold for a booking request.
 */
export async function insertPendingBlock({ listingId, moveIn, moveOut }) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listing_availability_blocks')
    .insert({
      listing_id: listingId,
      start_date: moveIn,
      end_date: moveOut,
      kind: 'pending',
    })
    .select('block_id, listing_id, start_date, end_date, kind')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Convert the pending block for a stay into booked (accept path).
 */
export async function convertPendingToBooked({ listingId, moveIn, moveOut }) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listing_availability_blocks')
    .update({ kind: 'booked' })
    .eq('listing_id', listingId)
    .eq('start_date', moveIn)
    .eq('end_date', moveOut)
    .eq('kind', 'pending')
    .select('block_id');
  if (error) throw error;
  return data || [];
}

/**
 * Release a pending or booked block matching the stay dates.
 * @param {'pending'|'booked'} kind
 */
export async function releaseBlock({ listingId, moveIn, moveOut, kind }) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listing_availability_blocks')
    .delete()
    .eq('listing_id', listingId)
    .eq('start_date', moveIn)
    .eq('end_date', moveOut)
    .eq('kind', kind)
    .select('block_id');
  if (error) throw error;
  return data || [];
}

/**
 * Apply a planned blockAction from bookingState.
 */
export async function executeBlockAction(blockAction, stay) {
  if (!blockAction || blockAction.action === 'none') return null;
  const { listing_id: listingId, move_in: moveIn, move_out: moveOut } = stay;
  switch (blockAction.action) {
    case 'insert_pending':
      return insertPendingBlock({ listingId, moveIn, moveOut });
    case 'pending_to_booked':
      return convertPendingToBooked({ listingId, moveIn, moveOut });
    case 'release_pending':
      return releaseBlock({ listingId, moveIn, moveOut, kind: 'pending' });
    case 'release_booked':
      return releaseBlock({ listingId, moveIn, moveOut, kind: 'booked' });
    default:
      return null;
  }
}

/**
 * Fetch pending/booked blocks that overlap a date range (for search exclusion).
 */
export async function listingIdsBlockedInRange(moveIn, moveOut) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listing_availability_blocks')
    .select('listing_id')
    .in('kind', ['pending', 'booked'])
    .lte('start_date', moveOut)
    .gte('end_date', moveIn);
  if (error) {
    console.error('listingIdsBlockedInRange:', error);
    return [];
  }
  return [...new Set((data || []).map((r) => r.listing_id))];
}

/**
 * Public calendar read for one listing (anon-readable via RLS; service is fine too).
 */
export async function fetchAvailabilityBlocks(listingId, { from, to } = {}) {
  const service = getSupabaseAsService();
  let query = service
    .from('listing_availability_blocks')
    .select('block_id, listing_id, start_date, end_date, kind, created_at')
    .eq('listing_id', listingId)
    .order('start_date', { ascending: true });
  if (from) query = query.gte('end_date', from);
  if (to) query = query.lte('start_date', to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
