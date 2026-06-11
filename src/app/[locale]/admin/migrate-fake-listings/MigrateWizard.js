'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

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

// Data is loaded server-side (page.js) and passed in, so there is no
// fetch-on-mount effect. load() is a manual refresh used only after mutations.
export default function MigrateWizard({ initialCandidates = [], initialPendingLandlords = [] }) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pendingLandlords, setPendingLandlords] = useState(initialPendingLandlords);
  const [selections, setSelections] = useState(() => {
    const m = {};
    for (const c of initialCandidates) m[c.listing_id] = ''; // '' = leave untouched (safe default)
    return m;
  });
  const [names, setNames] = useState({ a: '', b: '' });
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState('');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch('/api/admin/migrate-fake-listings');
    if (!res.ok) {
      setMsg('Could not reload.');
      return;
    }
    const d = await res.json();
    setCandidates(d.candidates || []);
    setPendingLandlords(d.pendingLandlords || []);
    setSelections((prev) => {
      const next = { ...prev };
      for (const c of d.candidates || []) if (!(c.listing_id in next)) next[c.listing_id] = '';
      return next;
    });
  }, []);

  const createLandlord = async (slot) => {
    const display_name = names[slot].trim();
    if (!display_name) return;
    const res = await authedFetch('/api/admin/pending-landlords', { method: 'POST', body: JSON.stringify({ display_name }) });
    if (res.ok) {
      setNames((s) => ({ ...s, [slot]: '' }));
      load();
    } else {
      setMsg('Could not create landlord.');
    }
  };

  const runMigration = async () => {
    // Only act on listings the operator explicitly chose. Blank rows are left
    // untouched (NOT skip/delete) so an accidental click never destroys fakes.
    const assignments = {};
    for (const c of candidates) {
      const sel = selections[c.listing_id];
      if (sel) assignments[c.listing_id] = sel;
    }
    if (Object.keys(assignments).length === 0) {
      setMsg('Choose an action (a landlord, or Skip / delete) for at least one listing first.');
      return;
    }
    setRunning(true);
    setMsg('Migrating…');
    const res = await authedFetch('/api/admin/migrate-fake-listings', { method: 'POST', body: JSON.stringify({ assignments }) });
    const d = await res.json();
    setRunning(false);
    if (res.ok) {
      setSummary(d);
      setMsg('');
      load(); // migrated+deleted rows drop out of the candidate set, so re-running is safe
    } else {
      setMsg(d.error || 'Migration failed.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-2xl font-bold text-night">Migrate fake listings</h1>
        <Link href="/admin/dashboard" className="text-sm text-blue underline">
          ← Dashboard
        </Link>
      </div>
      <p className="text-sm text-night/50 mb-6">
        Move seed/fake listings into the pending pipeline and remove them from the public directory. Protected owners
        (michaelcharlesg) are never shown here and can never be deleted. Safe to re-run.
      </p>

      <section className="border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-3">Create pending landlords</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {['a', 'b'].map((slot) => (
            <div key={slot} className="flex gap-2">
              <input
                className="flex-1 text-sm border border-gray-200 rounded px-3 py-2"
                placeholder={`Pending landlord ${slot === 'a' ? '1' : '2'} name`}
                value={names[slot]}
                onChange={(e) => setNames((s) => ({ ...s, [slot]: e.target.value }))}
              />
              <button onClick={() => createLandlord(slot)} className="text-sm bg-night text-white rounded px-3 py-2">
                Create
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-night/40 mt-2">{pendingLandlords.length} pending landlord(s) available to assign.</p>
      </section>

      {summary && (
        <div className="text-sm rounded px-3 py-2 mb-4 bg-green-50 text-green-800">
          {summary.migrated} migrated, {summary.skipped} skipped, {summary.errors} errors.
          {summary.errorDetail?.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {summary.errorDetail.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-night/70 bg-parchment rounded px-3 py-2 mb-4">{msg}</p>}

      <section className="border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center bg-gray-50 px-4 py-2 text-xs font-semibold text-night/50">
          <span>Cover</span>
          <span>Listing</span>
          <span>Assign to</span>
        </div>
        {candidates.length === 0 ? (
          <p className="px-4 py-6 text-sm text-night/40">No fake listings left to migrate.</p>
        ) : (
          candidates.map((c) => (
            <div key={c.listing_id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-4 py-2 border-t border-gray-100">
              {c.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.cover} alt="" className="w-14 h-14 rounded object-cover bg-gray-100" />
              ) : (
                <div className="w-14 h-14 rounded bg-gray-100 grid place-items-center text-[10px] text-night/30">none</div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-night truncate">
                  {c.title} <span className="text-night/30">({c.listing_id})</span>
                </p>
                <p className="text-xs text-night/50">
                  {[c.neighborhood, c.property_type, money(c.price_eur_month), c.sqm ? `${c.sqm}m²` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {c.already_migrated && <span className="text-[11px] text-green-700">already staged</span>}
              </div>
              <select
                className="text-xs border border-gray-200 rounded px-2 py-1"
                value={selections[c.listing_id] || ''}
                onChange={(e) => setSelections((s) => ({ ...s, [c.listing_id]: e.target.value }))}
              >
                <option value="">— leave untouched —</option>
                {pendingLandlords.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.display_name || l.id}
                  </option>
                ))}
                <option value="skip">Skip / delete</option>
              </select>
            </div>
          ))
        )}
      </section>

      <button
        onClick={runMigration}
        disabled={running || candidates.length === 0}
        className="text-sm bg-blue text-white rounded px-5 py-2.5 disabled:opacity-40"
      >
        {running ? 'Migrating…' : 'Migrate'}
      </button>
    </div>
  );
}
