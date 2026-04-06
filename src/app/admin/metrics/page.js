'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/admin/metrics', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error || 'Failed to load metrics');
          setLoading(false);
          return;
        }
        const { metrics: data, cached: c } = await res.json();
        setMetrics(data);
        setCached(c);
      } catch {
        setError('Failed to load metrics');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-dark/50">Loading metrics…</p>
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

  const planNames = {
    free: 'Starter',
    starter: 'Starter',
    pro: 'Pro',
    super_pro: 'Super Pro',
    business: 'Business',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-2xl font-bold text-navy">Internal Metrics</h1>
        {cached && (
          <span className="text-xs text-gray-dark/40 bg-gray-100 rounded-full px-3 py-1">cached</span>
        )}
      </div>

      {/* Revenue KPIs */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-dark/40 mb-3">Revenue</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="MRR" value={metrics.mrrFormatted} />
          <KpiCard label="ARR" value={metrics.arrFormatted} />
          <KpiCard label="ARPU" value={metrics.arpuFormatted} />
          <KpiCard label="CAC" value="—" note="not tracked" />
        </div>
      </section>

      {/* Landlord KPIs */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-dark/40 mb-3">Landlords</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total" value={metrics.totalLandlords} />
          <KpiCard label="Paid" value={metrics.paidLandlords} />
          <KpiCard label="Free" value={metrics.freeLandlords} />
          <KpiCard
            label="Free → Paid"
            value={`${metrics.conversionRate}%`}
            trend={metrics.conversionRate > 0 ? 'up' : null}
          />
        </div>
      </section>

      {/* Churn & Listings */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-dark/40 mb-3">Retention & Listings</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Monthly Churn"
            value={`${metrics.churnRate}%`}
            trend={metrics.churnRate > 0 ? 'down' : null}
          />
          <KpiCard label="Cancelled (mo)" value={metrics.cancelledThisMonth} />
          <KpiCard label="Total Listings" value={metrics.totalListings} />
          <KpiCard label="Featured" value={metrics.featuredListings} />
        </div>
      </section>

      {/* Inquiries */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-dark/40 mb-3">Inquiries</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="This Month" value={metrics.inquiriesThisMonth} />
          <KpiCard label="Last Month" value={metrics.inquiriesLastMonth} />
          <KpiCard
            label="MoM Change"
            value={metrics.inquiryTrend !== null ? `${metrics.inquiryTrend > 0 ? '+' : ''}${metrics.inquiryTrend}%` : '—'}
            trend={metrics.inquiryTrend !== null ? (metrics.inquiryTrend >= 0 ? 'up' : 'down') : null}
          />
        </div>
      </section>

      {/* Tier Breakdown */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-dark/40 mb-3">Tier Breakdown</h2>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-navy/70">Plan</th>
                <th className="text-right px-4 py-3 font-semibold text-navy/70">Landlords</th>
                <th className="text-right px-4 py-3 font-semibold text-navy/70">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Free tier row */}
              {(() => {
                const count = metrics.freeLandlords;
                const share = metrics.totalLandlords > 0
                  ? Math.round((count / metrics.totalLandlords) * 1000) / 10
                  : 0;
                return (
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-dark">Starter (Free)</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-dark">{count}</td>
                    <td className="px-4 py-3 text-right text-gray-dark/50">{share}%</td>
                  </tr>
                );
              })()}
              {/* Paid plan rows — dynamic from byPlan */}
              {Object.entries(metrics.byPlan || {})
                .sort((a, b) => b[1] - a[1])
                .map(([planId, count]) => {
                  const share = metrics.totalLandlords > 0
                    ? Math.round((count / metrics.totalLandlords) * 1000) / 10
                    : 0;
                  const label = planNames[planId] || planId.replace(/_/g, ' ');
                  return (
                    <tr key={planId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-dark capitalize">{label}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-dark">{count}</td>
                      <td className="px-4 py-3 text-right text-gray-dark/50">{share}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, trend, note }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
      <p className="text-xs text-gray-dark/50 mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className="font-heading text-xl font-bold text-navy">{value}</p>
        {trend === 'up' && <span className="text-xs text-green-600 mb-0.5">↑</span>}
        {trend === 'down' && <span className="text-xs text-red-500 mb-0.5">↓</span>}
      </div>
      {note && <p className="text-[11px] text-gray-dark/30 mt-0.5">{note}</p>}
    </div>
  );
}
