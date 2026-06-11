'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

// All admin mutations re-check the ADMIN_EMAILS allowlist server-side; here we
// just attach the Supabase session token, exactly like the existing admin pages.
async function authedFetch(path, options = {}) {
  const supabase = getSupabaseBrowser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(path, { ...options, headers });
}

const money = (v) => (v == null ? '—' : `€${v}/mo`);

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-night/60',
  assigned: 'bg-blue/10 text-blue',
  needs_manual_entry: 'bg-yellow/30 text-night/70',
  error: 'bg-red-50 text-red-600',
  published: 'bg-green-50 text-green-700',
  claim_sent: 'bg-blue/10 text-blue',
  claimed: 'bg-green-50 text-green-700',
  archived: 'bg-gray-100 text-night/40',
};

function Badge({ status }) {
  return (
    <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_STYLES[status] || 'bg-gray-100 text-night/60'}`}>
      {status}
    </span>
  );
}

function ListingRow({ listing, landlords, onAssign }) {
  const cover = Array.isArray(listing.photos_json) && listing.photos_json[0]?.url;
  return (
    <div className="flex items-center gap-3 py-2 border-t border-gray-100">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="w-12 h-12 rounded object-cover bg-gray-100" />
      ) : (
        <div className="w-12 h-12 rounded bg-gray-100 grid place-items-center text-[10px] text-night/30">no photo</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-night truncate">{listing.address || listing.source_url || listing.id}</p>
        <p className="text-xs text-night/50">
          {[listing.neighborhood, listing.property_type, money(listing.price_eur_month)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Badge status={listing.status} />
      {onAssign && (
        <select
          className="text-xs border border-gray-200 rounded px-2 py-1"
          defaultValue=""
          onChange={(e) => e.target.value && onAssign(listing.id, e.target.value)}
        >
          <option value="">Assign to…</option>
          {landlords.map((l) => (
            <option key={l.id} value={l.id}>
              {l.display_name || l.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function LandlordCard({ landlord, listings, onChanged, setMsg }) {
  const [edit, setEdit] = useState({
    display_name: landlord.display_name || '',
    phone: landlord.phone || '',
    email: landlord.email || '',
    notes: landlord.notes || '',
  });
  const [claimUrl, setClaimUrl] = useState('');

  const save = async () => {
    const res = await authedFetch(`/api/admin/pending-landlords/${landlord.id}`, {
      method: 'PATCH',
      body: JSON.stringify(edit),
    });
    setMsg(res.ok ? 'Saved.' : 'Save failed.');
    if (res.ok) onChanged();
  };

  const generate = async () => {
    const res = await authedFetch(`/api/admin/pending-landlords/${landlord.id}/generate-claim-link`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setClaimUrl(d.url);
      onChanged();
    } else {
      setMsg(d.error || 'Could not generate link.');
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-night">{landlord.display_name || landlord.id}</h3>
        <Badge status={landlord.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {['display_name', 'phone', 'email', 'notes'].map((f) => (
          <input
            key={f}
            className="text-sm border border-gray-200 rounded px-2 py-1"
            placeholder={f.replace('_', ' ')}
            value={edit[f]}
            onChange={(e) => setEdit((s) => ({ ...s, [f]: e.target.value }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        <button onClick={save} className="text-xs bg-night text-white rounded px-3 py-1.5">
          Save
        </button>
        <button onClick={generate} className="text-xs bg-blue text-white rounded px-3 py-1.5">
          Generate claim link
        </button>
        {landlord.published_landlord_id && (
          <span className="text-xs text-green-700 self-center">published as {landlord.published_landlord_id}</span>
        )}
      </div>
      {claimUrl && (
        <div className="flex items-center gap-2 mb-2">
          <input readOnly value={claimUrl} className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50" />
          <button
            onClick={() => navigator.clipboard?.writeText(claimUrl)}
            className="text-xs border border-gray-200 rounded px-2 py-1"
          >
            Copy
          </button>
        </div>
      )}
      <div>
        {listings.length === 0 ? (
          <p className="text-xs text-night/40 py-2 border-t border-gray-100">No listings assigned yet.</p>
        ) : (
          listings.map((l) => <ListingRow key={l.id} listing={l} landlords={[]} />)
        )}
      </div>
    </div>
  );
}

export default function DashboardClient({ initialLandlords, initialListings }) {
  const [landlords, setLandlords] = useState(initialLandlords);
  const [listings, setListings] = useState(initialListings);
  const [msg, setMsg] = useState('');
  const [url, setUrl] = useState('');
  const [batch, setBatch] = useState('');
  const [form, setForm] = useState({ display_name: '', phone: '', email: '', notes: '' });

  const refresh = useCallback(async () => {
    const res = await authedFetch('/api/admin/pending-landlords');
    if (res.ok) {
      const d = await res.json();
      setLandlords(d.landlords);
      setListings(d.listings);
    }
  }, []);

  const byLandlord = useMemo(() => {
    const map = {};
    for (const l of listings) {
      const k = l.pending_landlord_id || '__unassigned__';
      (map[k] = map[k] || []).push(l);
    }
    return map;
  }, [listings]);

  const ingestSingle = async () => {
    if (!url.trim()) return;
    setMsg('Ingesting…');
    const res = await authedFetch('/api/admin/ingest-listing', { method: 'POST', body: JSON.stringify({ url: url.trim() }) });
    const d = await res.json();
    setMsg(res.ok ? `Ingest: ${d.status} (${d.preview?.photos ?? 0} photos)` : `Error: ${d.error}`);
    setUrl('');
    refresh();
  };

  const ingestBatch = async () => {
    const urls = batch.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setMsg(`Queuing ${urls.length}…`);
    const res = await authedFetch('/api/admin/ingest-listings-batch', { method: 'POST', body: JSON.stringify({ urls }) });
    const d = await res.json();
    setMsg(res.ok ? `Queued ${d.results.length}. Refresh in a moment.` : `Error: ${d.error}`);
    setBatch('');
    refresh();
  };

  const createLandlord = async () => {
    const res = await authedFetch('/api/admin/pending-landlords', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) {
      setForm({ display_name: '', phone: '', email: '', notes: '' });
      refresh();
    } else {
      setMsg('Could not create landlord.');
    }
  };

  const assign = async (listingId, landlordId) => {
    const res = await authedFetch(`/api/admin/pending-listings/${listingId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ pending_landlord_id: landlordId }),
    });
    if (res.ok) refresh();
    else setMsg('Assign failed.');
  };

  const unassigned = byLandlord.__unassigned__ || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-night">Pending listings</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/migrate-fake-listings" className="text-sm text-blue underline">
            Migrate fake listings →
          </Link>
          <button onClick={refresh} className="text-sm border border-gray-200 rounded px-3 py-1.5">
            Refresh
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-night/70 bg-parchment rounded px-3 py-2 mb-4">{msg}</p>}

      <section className="border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-3">Ingest from a URL</h2>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-2"
            placeholder="https://www.spitogatos.gr/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={ingestSingle} className="text-sm bg-blue text-white rounded px-4 py-2">
            Ingest
          </button>
        </div>
        <textarea
          className="w-full text-sm border border-gray-200 rounded px-3 py-2 mb-2"
          rows={3}
          placeholder="Batch: one URL per line"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        />
        <button onClick={ingestBatch} className="text-sm border border-gray-200 rounded px-4 py-2">
          Queue batch
        </button>
      </section>

      <section className="border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-3">New pending landlord</h2>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {['display_name', 'phone', 'email', 'notes'].map((f) => (
            <input
              key={f}
              className="text-sm border border-gray-200 rounded px-2 py-1"
              placeholder={f.replace('_', ' ')}
              value={form[f]}
              onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))}
            />
          ))}
        </div>
        <button onClick={createLandlord} className="text-sm bg-night text-white rounded px-4 py-2">
          Create landlord
        </button>
      </section>

      {unassigned.length > 0 && (
        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-1">Unassigned listings</h2>
          {unassigned.map((l) => (
            <ListingRow key={l.id} listing={l} landlords={landlords} onAssign={assign} />
          ))}
        </section>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-3">
        Landlords ({landlords.length})
      </h2>
      {landlords.map((l) => (
        <LandlordCard
          key={l.id}
          landlord={l}
          listings={byLandlord[l.id] || []}
          onChanged={refresh}
          setMsg={setMsg}
        />
      ))}
    </div>
  );
}
