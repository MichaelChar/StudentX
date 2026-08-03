'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import BauhausLoader from '@/components/BauhausLoader';
import ListingPreview from '@/components/listing/ListingPreview';
import { arrayMove } from '@/lib/arrayMove';
import { resizeToVariants } from '@/lib/imageResize';
import {
  MIN_PHOTOS,
  PHOTO_LIMIT,
  validateUniversityDistancesMandatory,
  validatePhotoMinimum,
  validateRequiredCoords,
} from '@/lib/listingWizardRules';
import { MIN_UNIVERSITY_DISTANCES } from '@/lib/universityDistances';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StatusLadder from '@/components/listing-wizard/StatusLadder';
import { deriveListingLadder } from '@/lib/listingGoLive';
import { isPropertyVerified } from '@/lib/propertyVerification';
import StepImport from '@/components/listing-wizard/StepImport';
import StepAddress from '@/components/listing-wizard/StepAddress';
import StepProperty from '@/components/listing-wizard/StepProperty';
import StepUniversities from '@/components/listing-wizard/StepUniversities';
import StepPrice from '@/components/listing-wizard/StepPrice';
import StepAvailability from '@/components/listing-wizard/StepAvailability';
import StepPhotos from '@/components/listing-wizard/StepPhotos';
import StepReview from '@/components/listing-wizard/StepReview';
import {
  applyPasteSuggestions,
  parseListingPaste,
  PASTE_FIELD_LABEL_KEYS,
} from '@/lib/pasteImport';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';

/** Core wizard steps (import is optional step 0 for new listings only). */
const MAIN_STEPS = [
  'address',
  'property',
  'universities',
  'price',
  'availability',
  'photos',
  'review',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function emptyForm(initial = {}) {
  return {
    title: '',
    address: '',
    neighborhood: '',
    lat: '',
    lng: '',
    property_type: '',
    bedrooms: '',
    bathrooms: '',
    sqm: '',
    floor: '',
    description: '',
    smoking_allowed: false,
    pets_allowed: false,
    additional_rules: '',
    amenity_ids: [],
    university_distances: [],
    monthly_price: '',
    bills_included: false,
    deposit: '',
    agency_fee: '',
    min_duration_months: '9',
    max_duration_months: '',
    available_from: '',
    available_to: '',
    blackouts: [],
    photos: [],
    external_photo_urls: [],
    video_url: '',
    ...initial,
  };
}

/**
 * Multi-step landlord listing wizard.
 * Replaces the previous single-page ListingForm.
 *
 * Props:
 *   - initialValues: prefilled form state (edit mode)
 *   - listingId: existing listing id (edit / draft)
 *   - onSaveDraft(payload) → Promise<{ listing_id? }>
 *   - onSubmit(payload) → Promise
 *   - isVerified: landlord ID verified?
 *   - listingStatus: public listings.listing_status
 *   - propertyVerifications: rows for video-call stage
 *   - accessToken: bearer token for prefill API
 */
export default function ListingForm({
  initialValues = {},
  listingId: listingIdProp = null,
  onSaveDraft,
  onSubmit,
  submitLabel,
  isVerified = false,
  listingStatus = null,
  propertyVerifications = null,
  accessToken = null,
}) {
  const t = useTranslations('landlord.listingWizard');
  const tLoaders = useTranslations('loaders');
  const tLegacy = useTranslations('landlord.listingForm');

  const fileInputRef = useRef(null);
  const [userId, setUserId] = useState('anon');
  // Paste-import step 0 only on brand-new listings (no edit payload).
  const includeImport = !listingIdProp;
  const STEPS = useMemo(
    () => (includeImport ? ['import', ...MAIN_STEPS] : MAIN_STEPS),
    [includeImport],
  );
  const [step, setStep] = useState(0);
  // Edit pages pass listingIdProp; new listings stash the id returned from
  // the first draft create. Prefer the prop when present.
  const [createdId, setCreatedId] = useState(null);
  const listingId = listingIdProp || createdId;
  // Edit page only mounts this form once initialValues are loaded, so the
  // initializer is the single source of truth (no setState-in-effect sync).
  const [form, setForm] = useState(() => emptyForm(initialValues));
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [saveHint, setSaveHint] = useState('');
  // Paste-import state (step 0)
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  /** @type {[Record<string, true>, Function]} fields still marked "from your text" */
  const [suggested, setSuggested] = useState({});
  const [showImportBanner, setShowImportBanner] = useState(false);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    async function loadOptions() {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);

      const [ptRes, amRes, uniRes, nbRes] = await Promise.all([
        fetch('/api/property-types'),
        fetch('/api/amenities'),
        fetch('/api/universities'),
        fetch('/api/neighborhoods'),
      ]);

      if (ptRes.ok) {
        const { propertyTypes: pts } = await ptRes.json();
        setPropertyTypes(pts || []);
      }
      if (amRes.ok) {
        const { amenities: ams } = await amRes.json();
        setAmenities(ams || []);
      }
      if (uniRes.ok) {
        const { universities: unis } = await uniRes.json();
        setUniversities(unis || []);
      }
      if (nbRes.ok) {
        const { neighborhoods: nbs } = await nbRes.json();
        setNeighborhoods(nbs || []);
      }
    }
    loadOptions();
  }, []);

  const clearSuggestion = useCallback((field) => {
    setSuggested((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setField = useCallback(
    (field, value) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Landlord typed — drop the "from your text" mark for this field.
      clearSuggestion(field);
      setIsDirty(true);
      setSaveHint('');
    },
    [clearSuggestion],
  );

  const dismissSuggestion = useCallback(
    (field, empty = '') => {
      setForm((prev) => ({ ...prev, [field]: empty }));
      clearSuggestion(field);
      setIsDirty(true);
      setSaveHint('');
    },
    [clearSuggestion],
  );

  function toggleAmenity(amenityId) {
    setForm((prev) => ({
      ...prev,
      amenity_ids: prev.amenity_ids.includes(amenityId)
        ? prev.amenity_ids.filter((id) => id !== amenityId)
        : [...prev.amenity_ids, amenityId],
    }));
    clearSuggestion('amenity_ids');
    setIsDirty(true);
  }

  function skipImport() {
    setError('');
    setPasteResult(null);
    setSuggested({});
    setShowImportBanner(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function applyImport(result) {
    setError('');
    setPasteResult(result);
    setForm((prev) => {
      const { nextForm, applied } = applyPasteSuggestions(prev, result.fields);
      const marks = {};
      for (const key of applied) marks[key] = true;
      setSuggested(marks);
      setShowImportBanner(applied.length > 0);
      setIsDirty(applied.length > 0);
      return nextForm;
    });
    // Advance to address (step 1 when import is step 0)
    const addressIdx = STEPS.indexOf('address');
    setStep(addressIdx >= 0 ? addressIdx : Math.min(step + 1, STEPS.length - 1));
  }

  function reorderPhoto(from, to) {
    if (to < 0) return;
    setForm((prev) => ({
      ...prev,
      photos: arrayMove(prev.photos || [], from, to),
    }));
    setIsDirty(true);
  }

  async function handlePhotoFiles(files) {
    setPhotoError('');
    const current = form.photos || [];
    const externalCount = (form.external_photo_urls || []).length;
    const remaining = PHOTO_LIMIT - current.length - externalCount;
    if (remaining <= 0) {
      setPhotoError(tLegacy('photosTooMany'));
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    const wrongType = [];
    const tooLarge = [];
    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) wrongType.push(file);
      else if (file.size > MAX_FILE_SIZE) tooLarge.push(file);
    }
    if (wrongType.length > 0) {
      setPhotoError(tLegacy('photosInvalidType'));
      return;
    }
    if (tooLarge.length > 0) {
      const names = tooLarge
        .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
        .join(', ');
      setPhotoError(
        tLegacy('photosFileTooLarge', {
          names,
          max: MAX_FILE_SIZE / 1024 / 1024,
        }),
      );
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabaseBrowser();

      async function processOne(file) {
        const variants = await resizeToVariants(file);
        const stem = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const contentType = variants.ext === 'webp' ? 'image/webp' : 'image/jpeg';

        async function uploadVariant(size, blob) {
          const path = `${stem}__${size}.${variants.ext}`;
          const { error: uploadError } = await supabase.storage
            .from('listing-photos')
            .upload(path, blob, { upsert: false, contentType });
          if (uploadError) throw uploadError;
          return path;
        }

        await Promise.all([
          uploadVariant('thumb', variants.thumb),
          uploadVariant('full', variants.full),
        ]);
        const cardPath = await uploadVariant('card', variants.card);
        const { data } = supabase.storage
          .from('listing-photos')
          .getPublicUrl(cardPath);
        return data.publicUrl;
      }

      const CONCURRENCY = 3;
      const queue = [...toUpload];
      const uploaded = [];
      const failed = [];

      async function worker() {
        while (queue.length > 0) {
          const file = queue.shift();
          if (!file) return;
          try {
            uploaded.push(await processOne(file));
          } catch (err) {
            failed.push(file.name);
            console.error('[ListingWizard] photo failed:', file.name, err);
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, toUpload.length) },
          worker,
        ),
      );

      if (failed.length > 0) {
        const MAX_NAMES = 5;
        const names =
          failed.slice(0, MAX_NAMES).join(', ') +
          (failed.length > MAX_NAMES
            ? `, +${failed.length - MAX_NAMES} more`
            : '');
        setPhotoError(
          tLegacy('photosPartialError', {
            succeeded: uploaded.length,
            total: toUpload.length,
            names,
          }),
        );
      }

      if (uploaded.length > 0) {
        setForm((prev) => ({
          ...prev,
          photos: [...(prev.photos || []), ...uploaded],
        }));
        setIsDirty(true);
      }
    } catch (err) {
      console.error('[ListingWizard] photo_upload failed:', err);
      setPhotoError(tLegacy('photosError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removePhoto(url) {
    setForm((prev) => ({
      ...prev,
      photos: (prev.photos || []).filter((p) => p !== url),
    }));
    setIsDirty(true);
    try {
      const supabase = getSupabaseBrowser();
      const marker = '/listing-photos/';
      const idx = url.indexOf(marker);
      if (idx === -1) return;
      const path = url.slice(idx + marker.length);
      const variantMatch = path.match(/^(.*)__(thumb|card|full)\.(webp|jpe?g)$/i);
      const paths = variantMatch
        ? ['thumb', 'card', 'full'].map(
            (s) => `${variantMatch[1]}__${s}.${variantMatch[3]}`,
          )
        : [path];
      await supabase.storage.from('listing-photos').remove(paths);
    } catch {
      /* best-effort */
    }
  }

  function buildPayload({ submit = false, draft = true } = {}) {
    return {
      ...form,
      draft,
      submit,
      university_distances: (form.university_distances || [])
        .filter((d) => String(d.distance_meters).trim() !== '')
        .map((d) => ({
          university_id: d.university_id,
          distance_meters: Number(d.distance_meters),
          source: d.source === 'computed' ? 'computed' : 'landlord',
        })),
      blackouts: (form.blackouts || []).filter((b) => b.start_date && b.end_date),
      monthly_price:
        form.monthly_price !== '' && form.monthly_price != null
          ? parseFloat(form.monthly_price)
          : null,
      deposit:
        form.deposit !== '' && form.deposit != null
          ? parseFloat(form.deposit)
          : 0,
      agency_fee:
        form.agency_fee !== '' && form.agency_fee != null
          ? parseFloat(form.agency_fee)
          : null,
      sqm: form.sqm !== '' ? parseInt(form.sqm, 10) : null,
      floor: form.floor !== '' ? parseInt(form.floor, 10) : null,
      bedrooms: form.bedrooms !== '' ? parseInt(form.bedrooms, 10) : null,
      bathrooms: form.bathrooms !== '' ? parseInt(form.bathrooms, 10) : null,
    };
  }

  function validateStep(stepIndex) {
    const key = STEPS[stepIndex];
    if (key === 'import') {
      // Optional — never blocks.
      return null;
    }
    if (key === 'address') {
      if (!form.title?.trim()) return t('errors.titleRequired');
      if (!form.address?.trim()) return t('errors.addressRequired');
      if (!form.neighborhood?.trim()) return t('errors.neighborhoodRequired');
      const coords = validateRequiredCoords(form.lat, form.lng);
      if (!coords.ok) return t('errors.coordsRequired');
      return null;
    }
    if (key === 'property') {
      if (!form.property_type) return t('errors.propertyTypeRequired');
      return null;
    }
    if (key === 'universities') {
      const v = validateUniversityDistancesMandatory(form.university_distances);
      if (!v.ok) return t('errors.universitiesRequired', { count: MIN_UNIVERSITY_DISTANCES });
      return null;
    }
    if (key === 'price') {
      const min = Number(form.min_duration_months);
      const max =
        form.max_duration_months === '' || form.max_duration_months == null
          ? null
          : Number(form.max_duration_months);
      if (max != null && max < min) return t('errors.durationPair');
      return null;
    }
    if (key === 'availability') {
      if (
        form.available_from &&
        form.available_to &&
        form.available_to < form.available_from
      ) {
        return t('errors.availableRange');
      }
      for (const b of form.blackouts || []) {
        if (b.start_date && b.end_date && b.end_date < b.start_date) {
          return t('errors.blackoutRange');
        }
      }
      return null;
    }
    if (key === 'photos') {
      // Soft-check on step continue; hard-check on submit
      return null;
    }
    if (key === 'review') {
      const photos = validatePhotoMinimum(
        form.photos,
        form.external_photo_urls,
      );
      if (!photos.ok) {
        return t('errors.photosRequired', { count: MIN_PHOTOS });
      }
      const unis = validateUniversityDistancesMandatory(
        form.university_distances,
      );
      if (!unis.ok) {
        return t('errors.universitiesRequired', {
          count: MIN_UNIVERSITY_DISTANCES,
        });
      }
      return null;
    }
    return null;
  }

  async function saveDraftQuiet() {
    if (!onSaveDraft) return listingId;
    // Need enough for a create: after property step we have property_type
    if (!form.address || !form.neighborhood || !form.property_type || !form.title) {
      return listingId;
    }
    const coords = validateRequiredCoords(form.lat, form.lng);
    if (!coords.ok) return listingId;

    setSaving(true);
    try {
      const result = await onSaveDraft(buildPayload({ draft: true, submit: false }));
      if (result?.listing_id && !listingIdProp) setCreatedId(result.listing_id);
      setIsDirty(false);
      setSaveHint(t('draftSaved'));
      return result?.listing_id || listingId;
    } catch (err) {
      console.error('[ListingWizard] draft save failed:', err);
      setError(err.message || t('errors.generic'));
      return listingId;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    setError('');
    // Import step has its own CTAs; footer Continue acts as skip-or-apply.
    if (STEPS[step] === 'import') {
      const trimmed = (pasteText || '').trim();
      if (!trimmed) {
        skipImport();
        return;
      }
      // Re-parse with current amenities catalog and apply.
      applyImport(parseListingPaste(trimmed, { amenities }));
      return;
    }
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    // Draft-save once we have property_type
    if (STEPS[step] === 'property' || MAIN_STEPS.indexOf(STEPS[step]) >= 1) {
      await saveDraftQuiet();
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    // Prefill university distances when first entering that step with empty rows.
    if (STEPS[next] === 'universities' && (form.university_distances || []).length === 0) {
      // Fire-and-forget; errors surface in the step UI.
      void prefillDistances();
    }
  }

  function handleBack() {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleFinalSubmit() {
    setError('');
    const err = validateStep(STEPS.indexOf('review'));
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    try {
      await onSubmit(buildPayload({ draft: false, submit: true }));
      setIsDirty(false);
    } catch (e) {
      setError(e.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function prefillDistances() {
    const coords = validateRequiredCoords(form.lat, form.lng);
    if (!coords.ok) {
      setError(t('errors.coordsRequired'));
      return;
    }
    setPrefillLoading(true);
    setError('');
    try {
      const token =
        accessToken ||
        (await getSupabaseBrowser().auth.getSession()).data.session
          ?.access_token;
      const res = await fetch('/api/landlord/compute-university-distances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t('errors.prefillFailed'));
      }
      const { distances } = await res.json();
      // Keep landlord-adjusted rows; only fill missing / replace pure empty
      const existing = form.university_distances || [];
      const landlordKept = existing.filter((r) => r.source === 'landlord');
      const landlordIds = new Set(landlordKept.map((r) => r.university_id));
      const computed = (distances || [])
        .filter((d) => !landlordIds.has(d.university_id))
        .map((d) => ({
          university_id: d.university_id,
          distance_meters: String(d.distance_meters),
          source: 'computed',
        }));
      // Prefer at least 2 nearest computed + any landlord rows
      const merged = [...landlordKept, ...computed].slice(0, universities.length || 3);
      // If still empty, take top 2 computed
      const next =
        merged.length >= MIN_UNIVERSITY_DISTANCES
          ? merged
          : (distances || []).slice(0, MIN_UNIVERSITY_DISTANCES).map((d) => ({
              university_id: d.university_id,
              distance_meters: String(d.distance_meters),
              source: 'computed',
            }));
      setField('university_distances', next);
    } catch (err) {
      setError(err.message || t('errors.prefillFailed'));
    } finally {
      setPrefillLoading(false);
    }
  }

  const ladder = useMemo(() => {
    const flag = form.flags?.listing_status;
    const hasVideo =
      propertyVerifications != null
        ? isPropertyVerified(propertyVerifications)
        : false;
    return deriveListingLadder({
      flags: form.flags,
      listingStatus,
      isVerified,
      hasVideoVerification: hasVideo,
      isSubmitted:
        flag === 'submitted' ||
        flag === 'live' ||
        form.flags?.admin_live_approved === true,
    });
  }, [form.flags, isVerified, listingStatus, propertyVerifications]);

  const checklist = {
    address: Boolean(form.address?.trim() && form.neighborhood?.trim()),
    coords: validateRequiredCoords(form.lat, form.lng).ok,
    property: Boolean(form.property_type),
  };

  const stepKey = STEPS[step];
  const isImportStep = stepKey === 'import';

  return (
    <>
      {(loading || saving) && (
        <BauhausLoader
          mode="overlay"
          eyebrow={loading ? tLoaders('uploading') : t('savingDraft')}
          statuses={tLoaders.raw('uploadingCycle')}
        />
      )}

      <div className="space-y-6">
        <StatusLadder current={ladder.current} completed={ladder.completed} />

        {/* Step progress */}
        <div>
          <p className="label-caps text-night/50 mb-2">
            {t('stepOf', { current: step + 1, total: STEPS.length })}
          </p>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-sm ${
                  i <= step ? 'bg-blue' : 'bg-night/10'
                }`}
              />
            ))}
          </div>
          <h2 className="mt-4 font-display text-2xl text-night">
            {t(`steps.${stepKey}.title`)}
          </h2>
          <p className="mt-1 text-sm text-night/60">
            {t(`steps.${stepKey}.lede`)}
          </p>
        </div>

        {showImportBanner && pasteResult && !isImportStep && (
          <Card tone="parchment" className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 min-w-0">
                <p className="label-caps text-night/70">
                  {t('paste.bannerTitle')}
                </p>
                {pasteResult.found.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {pasteResult.found.map((key) => (
                      <li key={key}>
                        <Pill variant={suggested[key] ? 'info' : 'amenity'}>
                          {t(
                            `paste.fields.${PASTE_FIELD_LABEL_KEYS[key] || key}`,
                          )}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-night/50">
                  {t('paste.bannerTip')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportBanner(false)}
                className="p-1 text-night/40 hover:text-night rounded-sm shrink-0"
                aria-label={t('paste.dismissBanner')}
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        <Card tone="white" className="p-5 md:p-8">
          {isImportStep && (
            <StepImport
              pasteText={pasteText}
              setPasteText={setPasteText}
              amenities={amenities}
              lastResult={pasteResult}
              onSkip={skipImport}
              onApply={applyImport}
            />
          )}
          {stepKey === 'address' && (
            <StepAddress
              form={form}
              setField={setField}
              neighborhoods={neighborhoods}
              suggested={suggested}
              onDismissSuggestion={dismissSuggestion}
            />
          )}
          {stepKey === 'property' && (
            <StepProperty
              form={form}
              setField={setField}
              toggleAmenity={toggleAmenity}
              propertyTypes={propertyTypes}
              amenities={amenities}
              suggested={suggested}
              onDismissSuggestion={dismissSuggestion}
            />
          )}
          {stepKey === 'universities' && (
            <StepUniversities
              form={form}
              setField={setField}
              universities={universities}
              prefillLoading={prefillLoading}
              onPrefill={prefillDistances}
            />
          )}
          {stepKey === 'price' && (
            <StepPrice
              form={form}
              setField={setField}
              suggested={suggested}
              onDismissSuggestion={dismissSuggestion}
            />
          )}
          {stepKey === 'availability' && (
            <StepAvailability
              form={form}
              setField={setField}
              suggested={suggested}
              onDismissSuggestion={dismissSuggestion}
            />
          )}
          {stepKey === 'photos' && (
            <StepPhotos
              form={form}
              setField={setField}
              fileInputRef={fileInputRef}
              uploading={uploading}
              photoError={photoError}
              dragIndex={dragIndex}
              dragOverIndex={dragOverIndex}
              setDragIndex={setDragIndex}
              setDragOverIndex={setDragOverIndex}
              onFiles={handlePhotoFiles}
              onRemove={removePhoto}
              onReorder={reorderPhoto}
            />
          )}
          {stepKey === 'review' && (
            <StepReview
              form={form}
              amenities={amenities}
              universities={universities}
              onPreview={() => setShowPreview(true)}
              checklist={checklist}
            />
          )}
        </Card>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
            {error}
          </p>
        )}
        {saveHint && !error && (
          <p className="text-xs text-night/50">{saveHint}</p>
        )}

        {/* Import step owns its own primary/secondary CTAs */}
        {!isImportStep && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex gap-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  {t('back')}
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {step < STEPS.length - 1 ? (
                <Button type="button" variant="primary" onClick={handleNext}>
                  {t('continue')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleFinalSubmit}
                  disabled={loading}
                >
                  {loading
                    ? t('submitting')
                    : submitLabel || t('submit')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {showPreview && (
        <ListingPreview
          form={form}
          amenities={amenities}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
