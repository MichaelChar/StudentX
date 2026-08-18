'use client';

import { useTranslations } from 'next-intl';
import {
  EXCLUDED_PROPERTY_TYPES,
  EXCLUDED_AMENITY_NAMES,
} from '@/lib/listingWizardRules';
import SuggestedMark from '@/components/listing-wizard/SuggestedMark';

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepProperty({
  form,
  setField,
  toggleAmenity,
  propertyTypes,
  amenities,
  suggested = {},
  onDismissSuggestion,
}) {
  const t = useTranslations('landlord.listingWizard.property');

  const types = (propertyTypes || []).filter(
    (pt) => !EXCLUDED_PROPERTY_TYPES.has(pt.name),
  );
  const amenityList = (amenities || []).filter(
    (a) => !EXCLUDED_AMENITY_NAMES.has(a.name),
  );

  function dismiss(field, empty = '') {
    if (onDismissSuggestion) onDismissSuggestion(field, empty);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="wiz-type">
          {t('typeLabel')}
        </label>
        <select
          id="wiz-type"
          required
          value={form.property_type}
          onChange={(e) => setField('property_type', e.target.value)}
          className={inputClass}
        >
          <option value="">{t('typePlaceholder')}</option>
          {types.map((pt) => (
            <option key={pt.property_type_id} value={pt.name}>
              {pt.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="wiz-bedrooms">
            {t('bedroomsLabel')}
            <SuggestedMark
              show={!!suggested.bedrooms}
              onDismiss={() => dismiss('bedrooms')}
            />
          </label>
          <input
            id="wiz-bedrooms"
            type="number"
            min="0"
            value={form.bedrooms}
            onChange={(e) => setField('bedrooms', e.target.value)}
            className={inputClass}
            placeholder="1"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wiz-bathrooms">
            {t('bathroomsLabel')}
            <SuggestedMark
              show={!!suggested.bathrooms}
              onDismiss={() => dismiss('bathrooms')}
            />
          </label>
          <input
            id="wiz-bathrooms"
            type="number"
            min="0"
            value={form.bathrooms}
            onChange={(e) => setField('bathrooms', e.target.value)}
            className={inputClass}
            placeholder="1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="wiz-sqm">
            {t('sqmLabel')}
            <SuggestedMark
              show={!!suggested.sqm}
              onDismiss={() => dismiss('sqm')}
            />
          </label>
          <input
            id="wiz-sqm"
            type="number"
            min="1"
            value={form.sqm}
            onChange={(e) => setField('sqm', e.target.value)}
            className={inputClass}
            placeholder={t('sqmPlaceholder')}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wiz-floor">
            {t('floorLabel')}
            <SuggestedMark
              show={!!suggested.floor}
              onDismiss={() => dismiss('floor')}
            />
          </label>
          <select
            id="wiz-floor"
            value={form.floor}
            onChange={(e) => setField('floor', e.target.value)}
            className={inputClass}
          >
            <option value="">{t('floorPlaceholder')}</option>
            <option value="0">{t('floorGround')}</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="wiz-description">
          {t('descriptionLabel')}
          <SuggestedMark
            show={!!suggested.description}
            onDismiss={() => dismiss('description')}
          />
        </label>
        <textarea
          id="wiz-description"
          rows={4}
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder={t('descriptionPlaceholder')}
        />
        <p className="mt-1.5 text-xs text-night/50">{t('descriptionTip')}</p>
      </div>

      <fieldset>
        <legend className={`${labelClass} mb-3`}>{t('houseRulesLabel')}</legend>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.smoking_allowed === true}
              onChange={(e) => setField('smoking_allowed', e.target.checked)}
              className="w-4 h-4 accent-blue"
            />
            <span className="text-sm text-night">{t('smokingAllowed')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pets_allowed === true}
              onChange={(e) => setField('pets_allowed', e.target.checked)}
              className="w-4 h-4 accent-blue"
            />
            <span className="text-sm text-night">{t('petsAllowed')}</span>
          </label>
          <div>
            <label className={labelClass} htmlFor="wiz-rules">
              {t('additionalRulesLabel')}
            </label>
            <textarea
              id="wiz-rules"
              rows={2}
              value={form.additional_rules}
              onChange={(e) => setField('additional_rules', e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder={t('additionalRulesPlaceholder')}
            />
          </div>
        </div>
      </fieldset>

      {amenityList.length > 0 && (
        <fieldset>
          <legend className={`${labelClass} mb-3`}>
            {t('amenitiesLabel')}
            <SuggestedMark
              show={!!suggested.amenity_ids}
              onDismiss={() => dismiss('amenity_ids', [])}
            />
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {amenityList.map((amenity) => (
              <label
                key={amenity.amenity_id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={(form.amenity_ids || []).includes(amenity.amenity_id)}
                  onChange={() => toggleAmenity(amenity.amenity_id)}
                  className="w-4 h-4 accent-blue"
                />
                <span className="text-sm text-night">{amenity.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
