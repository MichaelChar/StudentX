import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { resizeToVariants } from '@/lib/imageResize';

// Client-side guards before we even resize. The browser resize re-encodes to a
// small WebP regardless, but reject obviously-wrong/huge inputs up front.
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PROFILE_PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Validate a chosen avatar file. Returns an error key string (for next-intl) or
 * null when the file is acceptable.
 */
export function validateProfilePhoto(file) {
  if (!PROFILE_PHOTO_TYPES.includes(file.type)) return 'photoInvalidType';
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return 'photoTooLarge';
  return null;
}

/**
 * Resize a chosen image to a single avatar-sized WebP and upload it to the
 * caller's own folder in the public `landlord-photos` bucket, returning the
 * public URL to store on landlords.profile_photo_url.
 *
 * MUST be called with an authenticated session present in the browser client —
 * the storage INSERT policy (migration 057) requires the object path to begin
 * with the uploader's auth.uid(). The display surfaces crop to a circle with
 * object-cover, so the stored image needn't be square.
 *
 * @param {File} file  user-selected image
 * @param {string} userId  authenticated auth.uid() (session.user.id)
 * @returns {Promise<string>} public URL
 */
export async function uploadLandlordPhoto(file, userId) {
  if (!userId) throw new Error('Not signed in');
  const variants = await resizeToVariants(file);
  const supabase = getSupabaseBrowser();
  // {uid}/ prefix satisfies the folder-scoped storage RLS policy.
  const path = `${userId}/avatar-${Date.now()}-${Math.random().toString(36).slice(2)}.${variants.ext}`;
  const contentType = variants.ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const { error } = await supabase.storage
    .from('landlord-photos')
    .upload(path, variants.card, { upsert: false, contentType });
  if (error) throw error;
  const { data } = supabase.storage.from('landlord-photos').getPublicUrl(path);
  return data.publicUrl;
}
