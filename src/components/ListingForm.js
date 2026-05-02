'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import BauhausLoader from '@/components/BauhausLoader';

const NEIGHBORHOODS_FALLBACK = [
  'Ano Poli', 'Center', 'Faliro', 'Kalamaria', 'Kentro',
  'Ladadika', 'Neapoli', 'Toumba', 'Vardaris',
];

const FREE_PHOTO_LIMIT = 6;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ListingForm({ initialValues = {}, onSubmit, submitLabel }) {
  const t = useTranslations('landlord.listingForm');
  const tLoaders = useTranslations('loaders');
  const fileInputRef = useRef(null);
  const [userId, setUserId] = useState('anon');
  const [form, setForm] = useState({
    address: '',
    neighborhood: '',
    lat: '',
    lng: '',
    property_type: '',
    monthly_price: '',
    bills_included: false,
    deposit: '',
    description: '',
    sqm: '',
    floor: '',
    available_from: '',
    min_duration_months: '9',
    amenity_ids: [],
    photos: [],
    ...initialValues,
  });

  const [propertyTypes, setPropertyTypes] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  // null = unlimited (paid tiers), number = cap (free tier)
  const [photoLimit, setPhotoLimit] = useState(FREE_PHOTO_LIMIT);

  useEffect(() => {
    async function loadOptions() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);

      const fetches = [fetch('/api/property-types'), fetch('/api/amenities')];
      if (session?.access_token) {
        fetches.push(
          fetch('/api/landlord/billing/subscription', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        );
      }

      const [ptRes, amRes, billingRes] = await Promise.all(fetches);

      if (ptRes.ok) {
        const { propertyTypes: pts } = await ptRes.json();
        setPropertyTypes(pts || []);
      }
      if (amRes.ok) {
        const { amenities: ams } = await amRes.json();
        setAmenities(ams || []);
      }
      if (billingRes?.ok) {
        const { verifiedTier } = await billingRes.json();
        if (verifiedTier === 'verified' || verifiedTier === 'verified_pro') {
          setPhotoLimit(null); // unlimited for paid tiers
        }
      }
    }
    loadOptions();
  }, []);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAmenity(amenityId) {
    setForm((prev) => ({
      ...prev,
      amenity_ids: prev.amenity_ids.includes(amenityId)
        ? prev.amenity_ids.filter((id) => id !== amenityId)
        : [...prev.amenity_ids, amenityId],
    }));
  }

  async function handlePhotoFiles(files) {
    setPhotoError('');
    const current = form.photos || [];
    const externalCount = (form.external_photo_urls || []).length;
    const remaining = photoLimit === null ? Infinity : photoLimit - current.length - externalCount;
    if (remaining <= 0) {
      setPhotoError(photoLimit === null ? t('photosTooMany') : `Maximum ${photoLimit} photos allowed.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining === Infinity ? files.length : remaining);
    const wrongType = [];
    const tooLarge = [];
    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) wrongType.push(file);
      else if (file.size > MAX_FILE_SIZE) tooLarge.push(file);
    }
    if (wrongType.length > 0) {
      setPhotoError(t('photosInvalidType'));
      return;
    }
    if (tooLarge.length > 0) {
      const names = tooLarge
        .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
        .join(', ');
      setPhotoError(t('photosFileTooLarge', { names, max: MAX_FILE_SIZE / 1024 / 1024 }));
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabaseBrowser();

      const uploaded = [];
      for (const file of toUpload) {
        const ext = file.name.split('.').pop();
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('listing-photos')
          .upload(path, file, { upsert: false });
        if (uploadError) {
          setPhotoError(t('photosError'));
          continue;
        }
        const { data: { publicUrl } } = supabase.storage
          .from('listing-photos')
          .getPublicUrl(path);
        uploaded.push(publicUrl);
      }

      if (uploaded.length > 0) {
        setForm((prev) => ({ ...prev, photos: [...(prev.photos || []), ...uploaded] }));
      }
    } catch (err) {
      console.error('[ListingForm] photo_upload failed:', err);
      setPhotoError(t('photosError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removePhoto(url) {
    setForm((prev) => ({ ...prev, photos: (prev.photos || []).filter((p) => p !== url) }));
    try {
      const supabase = getSupabaseBrowser();
      const marker = '/listing-photos/';
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        const path = url.slice(idx + marker.length);
        await supabase.storage.from('listing-photos').remove([path]);
      }
    } catch {
      // best-effort: UI already updated, storage cleanup failure is non-blocking
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold';
  const labelClass = 'block text-sm font-medium text-gray-dark mb-1';

  return (
    <>
      {loading && (
        <BauhausLoader
          mode="overlay"
          eyebrow={tLoaders('uploading')}
          statuses={tLoaders.raw('uploadingCycle')}
        />
      )}
      <form onSubmit={handleSubmit} className="space-y-8">
      {/* Location */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          {t('locationSection')}
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('addressLabel')}</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={inputClass}
              placeholder={t('addressPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('neighborhoodLabel')}</label>
              <input
                type="text"
                required
                list="neighborhoods-list"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={inputClass}
                placeholder={t('neighborhoodPlaceholder')}
              />
              <datalist id="neighborhoods-list">
                {NEIGHBORHOODS_FALLBACK.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('latLabel')}</label>
              <input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => set('lat', e.target.value)}
                className={inputClass}
                placeholder={t('latPlaceholder')}
              />
            </div>
            <div>
              <label className={labelClass}>{t('lngLabel')}</label>
              <input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => set('lng', e.target.value)}
                className={inputClass}
                placeholder={t('lngPlaceholder')}
              />
            </div>
          </div>
          <p className="text-xs text-gray-dark/50">
            {t('coordsOptional')}
            {' '}
            {t.rich('coordsHelp', {
              link: (chunks) => (
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </section>

      {/* Property details */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          {t('detailsSection')}
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('propertyTypeLabel')}</label>
            <select
              required
              value={form.property_type}
              onChange={(e) => set('property_type', e.target.value)}
              className={inputClass}
            >
              <option value="">{t('propertyTypePlaceholder')}</option>
              {propertyTypes.map((pt) => (
                <option key={pt.property_type_id} value={pt.name}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('sqmLabel')}</label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => set('sqm', e.target.value)}
                className={inputClass}
                placeholder={t('sqmPlaceholder')}
              />
            </div>
            <div>
              <label className={labelClass}>{t('floorLabel')}</label>
              <input
                type="number"
                value={form.floor}
                onChange={(e) => set('floor', e.target.value)}
                className={inputClass}
                placeholder={t('floorPlaceholder')}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('descriptionLabel')}</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClass + ' resize-none'}
              placeholder={t('descriptionPlaceholder')}
            />
            <p className="mt-1.5 text-xs text-gray-dark/50 leading-relaxed">
              {t('descriptionTip')}
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          {t('pricingSection')}
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('monthlyRentLabel')}</label>
              <input
                type="number"
                min="1"
                value={form.monthly_price}
                onChange={(e) => set('monthly_price', e.target.value)}
                className={inputClass}
                placeholder={t('monthlyRentPlaceholder')}
              />
            </div>
            <div>
              <label className={labelClass}>{t('depositLabel')}</label>
              <input
                type="number"
                min="0"
                value={form.deposit}
                onChange={(e) => set('deposit', e.target.value)}
                className={inputClass}
                placeholder={t('depositPlaceholder')}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.bills_included}
              onChange={(e) => set('bills_included', e.target.checked)}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-sm text-gray-dark">{t('billsIncluded')}</span>
          </label>

        </div>
      </section>

      {/* Availability */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          {t('availabilitySection')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('availableFromLabel')}</label>
            <input
              type="date"
              value={form.available_from}
              onChange={(e) => set('available_from', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('minDurationLabel')}</label>
            <select
              value={form.min_duration_months}
              onChange={(e) => set('min_duration_months', e.target.value)}
              className={inputClass}
            >
              <option value="1">
                {t('minDurationFlexibleName')} ({t('minDurationFlexibleMonths')})
              </option>
              <option value="5">
                {t('minDurationSemesterName')} ({t('minDurationSemesterMonths')})
              </option>
              <option value="9">
                {t('minDurationAcademicName')} ({t('minDurationAcademicMonths')})
              </option>
            </select>
            <p className="mt-1 text-xs text-night/50">{t('minDurationTip')}</p>
          </div>
        </div>
      </section>

      {/* Photos */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          {t('photosSection')}
        </h2>
        <div className="space-y-4">
          {/* Previews */}
          {(form.photos || []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(form.photos || []).map((url, i) => (
                <div key={url} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-gray-light">
                  <Image
                    src={url}
                    alt={`Photo ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white text-gray-dark rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    aria-label={t('photosRemove')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Imported external photos (read-only) */}
          {(form.external_photo_urls || []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-dark/60 mb-2">
                {t('importedPhotos', { count: form.external_photo_urls.length })}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {form.external_photo_urls.map((url, i) => (
                  <div key={url} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-light">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Imported photo ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload button */}
          {(photoLimit === null || ((form.photos || []).length + (form.external_photo_urls || []).length) < photoLimit) && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                id="photo-upload"
                onChange={(e) => handlePhotoFiles(e.target.files)}
                disabled={uploading}
              />
              <label
                htmlFor="photo-upload"
                className={`inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-dark/60 hover:border-gold/60 hover:text-navy cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {uploading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('photosUploading')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('photosLabel')}
                  </>
                )}
              </label>
              <p className="mt-1.5 text-xs text-gray-dark/50">
                {photoLimit === null ? t('photosHintUnlimited') : t('photosHint')}
              </p>
            </div>
          )}

          {photoError && (
            <p className="text-sm text-red-600">{photoError}</p>
          )}
        </div>
      </section>

      {/* Amenities */}
      {amenities.length > 0 && (
        <section>
          <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
            {t('amenitiesSection')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {amenities.map((amenity) => (
              <label key={amenity.amenity_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.amenity_ids.includes(amenity.amenity_id)}
                  onChange={() => toggleAmenity(amenity.amenity_id)}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-sm text-gray-dark">{amenity.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full sm:w-auto bg-gold text-white font-heading font-semibold px-8 py-3 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50"
      >
        {loading ? t('saving') : (submitLabel || t('saveListing'))}
      </button>
    </form>
    </>
  );
}
