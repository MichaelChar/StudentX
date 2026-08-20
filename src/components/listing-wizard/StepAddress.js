'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { TITLE_MAX_LENGTH, codepointLength } from '@/lib/listingTitle';
import {
  searchAddress,
  reverseGeocode,
  formatStreetAddress,
} from '@/lib/geocodeNominatim';
import Icon from '@/components/ui/Icon';
import Card from '@/components/ui/Card';
import SuggestedMark from '@/components/listing-wizard/SuggestedMark';

const AddressMap = dynamic(() => import('./AddressMap'), {
  ssr: false,
  loading: () => (
    <div className="h-64 sm:h-80 w-full rounded-card bg-parchment border border-night/10 animate-pulse" />
  ),
});

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepAddress({
  form,
  setField,
  neighborhoods,
  suggested = {},
  onDismissSuggestion,
}) {
  const t = useTranslations('landlord.listingWizard.address');
  const [query, setQuery] = useState(form.address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const lastNominatimAt = useRef(0);

  const lat = form.lat === '' || form.lat == null ? NaN : Number(form.lat);
  const lng = form.lng === '' || form.lng == null ? NaN : Number(form.lng);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function scheduleSearch(value) {
    setQuery(value);
    setField('address', value);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if ((value || '').trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value), 1100);
  }

  async function runSearch(value) {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Nominatim: max 1 req/sec
    const wait = Math.max(0, 1000 - (Date.now() - lastNominatimAt.current));
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    if (controller.signal.aborted) return;

    setSearching(true);
    try {
      lastNominatimAt.current = Date.now();
      const results = await searchAddress(value, { signal: controller.signal });
      if (!controller.signal.aborted) setSuggestions(results);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setSearchError(t('searchError'));
        setSuggestions([]);
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function pickSuggestion(s) {
    setSuggestions([]);
    setQuery(formatStreetAddress(s.address) || s.display_name.split(',')[0] || '');
    setField('address', formatStreetAddress(s.address) || s.display_name.split(',')[0] || s.display_name);
    setField('lat', s.lat);
    setField('lng', s.lng);
    // Best-effort neighbourhood match against controlled list
    const candidate =
      s.address?.suburb ||
      s.address?.neighbourhood ||
      s.address?.city_district ||
      s.address?.quarter ||
      '';
    if (candidate && neighborhoods?.length) {
      const match = neighborhoods.find(
        (n) => n.toLowerCase() === candidate.toLowerCase(),
      );
      if (match) setField('neighborhood', match);
    }
  }

  async function handlePinMove(newLat, newLng) {
    setField('lat', Number(newLat.toFixed(6)));
    setField('lng', Number(newLng.toFixed(6)));
    // Throttled reverse geocode to fill address if empty
    const wait = Math.max(0, 1000 - (Date.now() - lastNominatimAt.current));
    setTimeout(async () => {
      try {
        lastNominatimAt.current = Date.now();
        const rev = await reverseGeocode(newLat, newLng);
        if (!rev) return;
        const street = formatStreetAddress(rev.address);
        if (street && !(form.address || '').trim()) {
          setField('address', street);
          setQuery(street);
        }
      } catch {
        // non-blocking
      }
    }, wait);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="wiz-title">
          {t('titleLabel')}
        </label>
        <input
          id="wiz-title"
          type="text"
          required
          value={form.title}
          onChange={(e) => {
            if (codepointLength(e.target.value) > TITLE_MAX_LENGTH) return;
            setField('title', e.target.value);
          }}
          className={inputClass}
          placeholder={t('titlePlaceholder')}
        />
        <div className="mt-1.5 flex justify-between gap-3">
          <p className="text-xs text-night/50">{t('titleHint')}</p>
          <span className="text-xs text-night/40 tabular-nums shrink-0">
            {codepointLength(form.title)}/{TITLE_MAX_LENGTH}
          </span>
        </div>
      </div>

      <div className="relative">
        <label className={labelClass} htmlFor="wiz-address-search">
          {t('searchLabel')}
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-night/40"
          />
          <input
            id="wiz-address-search"
            type="text"
            value={query}
            onChange={(e) => scheduleSearch(e.target.value)}
            className={`${inputClass} pl-9`}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
          />
        </div>
        {searching && (
          <p className="mt-1.5 text-xs text-night/50">{t('searching')}</p>
        )}
        {searchError && (
          <p className="mt-1.5 text-xs text-red-700">{searchError}</p>
        )}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-night/10 rounded-card shadow-sm max-h-56 overflow-auto">
            {suggestions.map((s) => (
              <li key={`${s.lat},${s.lng},${s.display_name}`}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-3 py-2.5 text-sm text-night hover:bg-parchment border-b border-night/5 last:border-0"
                >
                  {s.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="wiz-address">
          {t('addressLabel')}
          <SuggestedMark
            show={!!suggested.address}
            onDismiss={() => {
              if (onDismissSuggestion) onDismissSuggestion('address', '');
              setQuery('');
            }}
          />
        </label>
        <input
          id="wiz-address"
          type="text"
          required
          value={form.address}
          onChange={(e) => {
            setField('address', e.target.value);
            setQuery(e.target.value);
          }}
          className={inputClass}
          placeholder={t('addressPlaceholder')}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="wiz-neighborhood">
          {t('neighborhoodLabel')}
        </label>
        <select
          id="wiz-neighborhood"
          required
          value={form.neighborhood}
          onChange={(e) => setField('neighborhood', e.target.value)}
          className={inputClass}
        >
          <option value="">{t('neighborhoodPlaceholder')}</option>
          {(neighborhoods || []).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className={labelClass}>{t('mapLabel')}</p>
        <p className="text-xs text-night/50 mb-2">{t('mapHint')}</p>
        <AddressMap
          lat={Number.isFinite(lat) ? lat : NaN}
          lng={Number.isFinite(lng) ? lng : NaN}
          onMove={handlePinMove}
        />
        {Number.isFinite(lat) && Number.isFinite(lng) ? (
          <Card tone="parchment" border={false} className="mt-2 px-3 py-2">
            <p className="text-xs text-night/60 tabular-nums">
              {t('coordsSet', {
                lat: lat.toFixed(5),
                lng: lng.toFixed(5),
              })}
            </p>
          </Card>
        ) : (
          <p className="mt-2 text-xs text-night/50">{t('coordsRequired')}</p>
        )}
      </div>
    </div>
  );
}
