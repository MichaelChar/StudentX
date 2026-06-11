'use client';

import { useState } from 'react';
import { PROPERTY_TYPE_ENUM } from '@/lib/pendingMappers';

const money = (v) => (v == null ? '' : `€${v}/mo`);

function PhotoStrip({ photos }) {
  const urls = (Array.isArray(photos) ? photos : []).map((p) => p?.url).filter(Boolean);
  if (!urls.length) return <div className="h-40 bg-gray-100 rounded-lg grid place-items-center text-night/30 text-sm">No photos</div>;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={u} alt="" className="h-40 w-56 object-cover rounded-lg bg-gray-100 flex-shrink-0" />
      ))}
    </div>
  );
}

export default function ClaimClient({ token, landlord, listings }) {
  const claimable = listings.filter((l) => l.status !== 'published');
  const [edits, setEdits] = useState(() => {
    const map = {};
    for (const l of listings) {
      map[l.id] = {
        address: l.address || '',
        neighborhood: l.neighborhood || '',
        price_eur_month: l.price_eur_month ?? '',
        property_type: l.property_type || 'other',
        description: l.description || '',
      };
    }
    return map;
  });
  const [contact, setContact] = useState({
    display_name: landlord.display_name || '',
    phone: landlord.phone || '',
    email: landlord.email || '',
  });
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(landlord.published_landlord_id ? { already: true } : null);

  const setListingField = (id, field, value) => setEdits((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));

  const publish = async () => {
    setPublishing(true);
    const listingEdits = {};
    for (const l of claimable) {
      const e = edits[l.id];
      listingEdits[l.id] = {
        address: e.address || null,
        neighborhood: e.neighborhood || null,
        price_eur_month: e.price_eur_month === '' ? null : Number(e.price_eur_month),
        property_type: e.property_type,
        description: e.description || null,
      };
    }
    const res = await fetch(`/api/claim/${token}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: { landlord: contact, listings: listingEdits } }),
    });
    const d = await res.json();
    setPublishing(false);
    if (res.ok) setResult(d);
    else setResult({ error: d.error || 'Publish failed' });
  };

  if (result?.already || result?.ok) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-night mb-2">You are live 🎉</h1>
          <p className="text-night/60">
            {result.already
              ? 'Your listings have already been published to StudentX.'
              : `Published ${result.published?.length ?? 0} listing(s) to StudentX.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-night mb-1">Claim your StudentX listings</h1>
      <p className="text-night/60 mb-6">
        Review the details below and publish them to the StudentX directory. You can edit anything before publishing.
      </p>

      <section className="border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-3">Your contact details</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {['display_name', 'phone', 'email'].map((f) => (
            <input
              key={f}
              className="text-sm border border-gray-200 rounded px-2 py-1.5"
              placeholder={f.replace('_', ' ')}
              value={contact[f]}
              onChange={(e) => setContact((s) => ({ ...s, [f]: e.target.value }))}
            />
          ))}
        </div>
      </section>

      {result?.error && <p className="text-sm bg-red-50 text-red-600 rounded px-3 py-2 mb-4">{result.error}</p>}

      {claimable.length === 0 ? (
        <p className="text-night/50">There are no listings waiting to be published.</p>
      ) : (
        claimable.map((l) => (
          <div key={l.id} className="border border-gray-200 rounded-lg p-4 mb-4">
            <PhotoStrip photos={l.photos_json} />
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <input
                className="text-sm border border-gray-200 rounded px-2 py-1.5"
                placeholder="address"
                value={edits[l.id].address}
                onChange={(e) => setListingField(l.id, 'address', e.target.value)}
              />
              <input
                className="text-sm border border-gray-200 rounded px-2 py-1.5"
                placeholder="neighborhood"
                value={edits[l.id].neighborhood}
                onChange={(e) => setListingField(l.id, 'neighborhood', e.target.value)}
              />
              <input
                type="number"
                className="text-sm border border-gray-200 rounded px-2 py-1.5"
                placeholder="price € / month"
                value={edits[l.id].price_eur_month}
                onChange={(e) => setListingField(l.id, 'price_eur_month', e.target.value)}
              />
              <select
                className="text-sm border border-gray-200 rounded px-2 py-1.5"
                value={edits[l.id].property_type}
                onChange={(e) => setListingField(l.id, 'property_type', e.target.value)}
              >
                {PROPERTY_TYPE_ENUM.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mt-2"
              rows={3}
              placeholder="description"
              value={edits[l.id].description}
              onChange={(e) => setListingField(l.id, 'description', e.target.value)}
            />
            {l.price_eur_month != null && <p className="text-xs text-night/40 mt-1">Current: {money(l.price_eur_month)}</p>}
          </div>
        ))
      )}

      <button
        onClick={publish}
        disabled={publishing || claimable.length === 0}
        className="w-full text-base bg-blue text-white rounded-lg px-5 py-3 disabled:opacity-40"
      >
        {publishing ? 'Publishing…' : 'Publish my listings'}
      </button>
    </div>
  );
}
