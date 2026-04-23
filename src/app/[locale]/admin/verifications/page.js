'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

export default function AdminVerificationsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [actionStates, setActionStates] = useState({}); // id -> 'approving' | 'rejecting' | null
  const [notesMap, setNotesMap] = useState({}); // id -> string
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated.');
        setLoading(false);
        return;
      }
      setToken(session.access_token);
      await fetchRequests(session.access_token, 'pending');
    }
    load();
  }, []);

  async function fetchRequests(tok, status) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/verifications?status=${status}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'Failed to load requests');
        return;
      }
      const { requests: data } = await res.json();
      setRequests(data || []);
    } catch {
      setError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id, action) {
    setActionStates((prev) => ({ ...prev, [id]: action === 'approve' ? 'approving' : 'rejecting' }));
    try {
      const res = await fetch(`/api/admin/verifications/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, notes: notesMap[id] || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        alert(body.error || 'Action failed');
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      alert('Action failed');
    } finally {
      setActionStates((prev) => ({ ...prev, [id]: null }));
    }
  }

  function handleFilterChange(status) {
    setStatusFilter(status);
    fetchRequests(token, status);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-dark/50">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600 bg-red-50 border border-red-100 rounded-lg px-6 py-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-2xl font-bold text-navy">Verification Requests</h1>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => handleFilterChange(s)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                statusFilter === s ? 'bg-navy text-white border-navy' : 'border-gray-200 text-gray-dark/60 hover:border-navy/40'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-dark/50">No {statusFilter} verification requests.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {requests.map((req) => (
            <div key={req.id} className="border border-gray-200 rounded-xl p-5 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-heading font-semibold text-navy">{req.landlord_name}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-xs text-gray-dark/50 mb-1">
                    Submitted {new Date(req.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {req.reviewed_at && (
                    <p className="text-xs text-gray-dark/40">
                      Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {req.review_notes && (
                    <p className="text-sm text-gray-dark/60 mt-1 italic">{req.review_notes}</p>
                  )}
                </div>

                {req.document_url && (
                  <a
                    href={req.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors"
                  >
                    View document ↗
                  </a>
                )}
              </div>

              {req.status === 'pending' && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <textarea
                    placeholder="Review notes (optional, shown to landlord on rejection)"
                    value={notesMap[req.id] || ''}
                    onChange={(e) => setNotesMap((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 bg-gray-light px-3 py-2 text-sm text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'approve')}
                      disabled={!!actionStates[req.id]}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {actionStates[req.id] === 'approving' ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'reject')}
                      disabled={!!actionStates[req.id]}
                      className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {actionStates[req.id] === 'rejecting' ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${styles[status] || ''}`}>
      {status}
    </span>
  );
}
