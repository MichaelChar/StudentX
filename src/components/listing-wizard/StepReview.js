'use client';

import { useTranslations } from 'next-intl';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Button from '@/components/ui/Button';
import { formatPropertyType } from '@/lib/propertyType';
import { formatMoney } from '@/lib/formatMoney';
import { MIN_PHOTOS } from '@/lib/listingWizardRules';
import { MIN_UNIVERSITY_DISTANCES } from '@/lib/universityDistances';

export default function StepReview({
  form,
  amenities,
  universities,
  onPreview,
  checklist,
}) {
  const t = useTranslations('landlord.listingWizard.review');
  const photoCount =
    (form.photos || []).length + (form.external_photo_urls || []).length;
  const uniCount = (form.university_distances || []).filter((r) => {
    const n = Number(r.distance_meters);
    return Number.isInteger(n) && n > 0;
  }).length;

  const amenityNames = (form.amenity_ids || [])
    .map((id) => amenities.find((a) => a.amenity_id === id)?.name)
    .filter(Boolean);

  return (
    <div className="space-y-5">
      <p className="text-sm text-night/70 leading-relaxed">{t('lede')}</p>

      <Card tone="parchment" className="p-5 space-y-3">
        <p className="label-caps text-night/50">{t('summaryLabel')}</p>
        <h3 className="font-display text-2xl text-night">
          {form.title || t('untitled')}
        </h3>
        <p className="text-sm text-night/60">
          {[form.address, form.neighborhood].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap gap-2">
          {form.property_type && (
            <Pill variant="amenity">
              {formatPropertyType(form.property_type, 'en')}
            </Pill>
          )}
          {form.monthly_price !== '' && form.monthly_price != null && (
            <Pill variant="info">{formatMoney(form.monthly_price)}/mo</Pill>
          )}
          {form.bills_included && (
            <Pill variant="amenity">{t('billsIncluded')}</Pill>
          )}
        </div>
        {amenityNames.length > 0 && (
          <p className="text-xs text-night/50">{amenityNames.join(' · ')}</p>
        )}
        {(form.university_distances || []).length > 0 && (
          <ul className="text-xs text-night/60 space-y-0.5">
            {(form.university_distances || []).map((row) => {
              const u = universities.find(
                (x) => x.university_id === row.university_id,
              );
              return (
                <li key={row.university_id}>
                  {u?.short_name || row.university_id}: {row.distance_meters} m
                  {row.source === 'computed' ? ` (${t('computed')})` : ''}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card tone="white" className="p-5 space-y-2">
        <p className="label-caps text-night/50 mb-2">{t('checklistLabel')}</p>
        <CheckItem ok={checklist.address} label={t('checkAddress')} />
        <CheckItem ok={checklist.coords} label={t('checkCoords')} />
        <CheckItem ok={checklist.property} label={t('checkProperty')} />
        <CheckItem
          ok={uniCount >= MIN_UNIVERSITY_DISTANCES}
          label={t('checkUniversities', { count: MIN_UNIVERSITY_DISTANCES })}
        />
        <CheckItem
          ok={photoCount >= MIN_PHOTOS}
          label={t('checkPhotos', { count: MIN_PHOTOS, current: photoCount })}
        />
      </Card>

      <Button type="button" variant="outline" onClick={onPreview}>
        {t('preview')}
      </Button>
    </div>
  );
}

function CheckItem({ ok, label }) {
  return (
    <p className={`text-sm ${ok ? 'text-night' : 'text-night/40'}`}>
      <span className={ok ? 'text-blue' : 'text-night/30'}>
        {ok ? '✓' : '○'}
      </span>{' '}
      {label}
    </p>
  );
}
