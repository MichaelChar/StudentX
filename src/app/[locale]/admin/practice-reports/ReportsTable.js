'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';

const STATUS_BADGE = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
  resolved: 'bg-night/5 text-night/60 border-night/15',
};

const KIND_BADGE = {
  error: 'bg-red-50 text-red-600 border-red-200',
  edit: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Badge({ children, className }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export default function ReportsTable({
  reports,
  subjects,
  activeStatus,
  activeSubject,
  statuses,
  updateReport,
}) {
  const t = useTranslations('admin.practiceReports');
  const [expandedId, setExpandedId] = useState(null);

  // Build a filter href that preserves the other facet.
  const statusHref = (s) => ({
    pathname: '/admin/practice-reports',
    query: { status: s, ...(activeSubject ? { subject: activeSubject } : {}) },
  });
  const subjectHref = (slug) => ({
    pathname: '/admin/practice-reports',
    query: { status: activeStatus, ...(slug ? { subject: slug } : {}) },
  });

  const filterPill = (active) =>
    `text-sm px-3 py-1.5 rounded-lg border transition-colors ${
      active ? 'bg-night text-white border-night' : 'border-night/15 text-night/60 hover:border-night/40'
    }`;

  return (
    <div>
      {/* Filters — pure links, so filtering is server-side (no client state). */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-night/40 mr-1">
            {t('filterStatus')}
          </span>
          {statuses.map((s) => (
            <Link key={s} href={statusHref(s)} className={filterPill(s === activeStatus)}>
              {t(`status.${s}`)}
            </Link>
          ))}
        </div>
        {subjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-night/40 mr-1">
              {t('filterSubject')}
            </span>
            <Link href={subjectHref(null)} className={filterPill(!activeSubject)}>
              {t('allSubjects')}
            </Link>
            {subjects.map((s) => (
              <Link key={s.slug} href={subjectHref(s.slug)} className={filterPill(s.slug === activeSubject)}>
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-night/15 rounded-[22px]">
          <p className="text-night/50">{t('empty', { status: t(`status.${activeStatus}`).toLowerCase() })}</p>
        </div>
      ) : (
        <div className="border border-night/10 rounded-[22px] overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-parchment">
              <tr className="text-left text-night/55">
                <th className="px-4 py-3 font-semibold">{t('columns.date')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.subject')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.test')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.question')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.kind')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.status')}</th>
                <th className="px-4 py-3 font-semibold">{t('columns.message')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night/10">
              {reports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                  updateReport={updateReport}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportRow({ report, expanded, onToggle, updateReport }) {
  const t = useTranslations('admin.practiceReports');
  const router = useRouter();
  const [note, setNote] = useState(report.admin_note ?? '');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const preview = report.message.length > 80 ? `${report.message.slice(0, 80)}…` : report.message;
  const deepLink = `/student/ausom/semester-2/${report.subject}/${report.test_id}?review=${report.question_id}`;

  function act(status) {
    setError('');
    startTransition(async () => {
      const res = await updateReport({ id: report.id, status, adminNote: note });
      if (!res?.ok) {
        setError(t('saveError'));
        return;
      }
      // revalidatePath in the action refreshes the server tree; pull it in.
      router.refresh();
    });
  }

  return (
    <>
      <tr
        className="hover:bg-parchment/60 cursor-pointer align-top"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <td className="px-4 py-3 text-night/70 whitespace-nowrap">{formatDate(report.created_at)}</td>
        <td className="px-4 py-3 text-night">{report.subject}</td>
        <td className="px-4 py-3 text-night/70 font-mono text-xs">{report.test_id}</td>
        <td className="px-4 py-3 text-night/70 font-mono text-xs">{report.question_id}</td>
        <td className="px-4 py-3">
          <Badge className={KIND_BADGE[report.kind] || ''}>{t(`kind.${report.kind}`)}</Badge>
        </td>
        <td className="px-4 py-3">
          <Badge className={STATUS_BADGE[report.status] || ''}>{t(`status.${report.status}`)}</Badge>
        </td>
        <td className="px-4 py-3 text-night/60 max-w-xs truncate">{preview}</td>
      </tr>
      {expanded && (
        <tr className="bg-parchment/40">
          <td colSpan={7} className="px-4 py-5">
            <div className="space-y-4 max-w-3xl">
              <Field label={t('fields.message')}>
                <p className="text-night/80 whitespace-pre-wrap">{report.message}</p>
              </Field>
              {report.proposed_change && (
                <Field label={t('fields.proposedChange')}>
                  <p className="text-night/80 whitespace-pre-wrap">{report.proposed_change}</p>
                </Field>
              )}
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {report.reporter_email && (
                  <Field label={t('fields.reporterEmail')}>
                    <a href={`mailto:${report.reporter_email}`} className="text-blue underline">
                      {report.reporter_email}
                    </a>
                  </Field>
                )}
                <Field label={t('fields.testVersion')}>
                  <span className="text-night/80 font-mono">{report.test_version}</span>
                </Field>
              </div>

              <Field label={t('fields.adminNote')}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t('adminNotePlaceholder')}
                  className="w-full rounded-lg border border-night/15 bg-white px-3 py-2 text-sm text-night focus:outline-none focus:ring-2 focus:ring-blue/40 focus:border-blue resize-none"
                />
              </Field>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => act('accepted')}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isPending ? t('saving') : t('actions.accept')}
                </button>
                <button
                  type="button"
                  onClick={() => act('rejected')}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {t('actions.reject')}
                </button>
                <button
                  type="button"
                  onClick={() => act('resolved')}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg border border-night/20 text-night/70 text-sm font-semibold hover:bg-night/5 transition-colors disabled:opacity-50"
                >
                  {t('actions.resolve')}
                </button>
                <Link
                  href={deepLink}
                  className="ml-auto text-sm px-3 py-2 rounded-lg border border-blue/30 text-blue font-semibold hover:bg-blue/5 transition-colors"
                >
                  {t('viewQuestion')}
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-night/40 mb-1">{label}</p>
      {children}
    </div>
  );
}
