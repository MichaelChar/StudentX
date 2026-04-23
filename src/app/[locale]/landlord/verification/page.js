'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

export default function LandlordVerificationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [verifiedTier, setVerifiedTier] = useState(null);
  const [latestRequest, setLatestRequest] = useState(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [token, setToken] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      setToken(session.access_token);

      try {
        const res = await fetch('/api/landlord/verification', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setVerifiedTier(data.verifiedTier ?? 'none');
          setLatestRequest(data.latestRequest ?? null);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setSubmitError('');

    const formData = new FormData();
    formData.append('id_document', file);

    try {
      const res = await fetch('/api/landlord/verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit. Please try again.');
      } else {
        setSubmitSuccess(true);
        setLatestRequest({ status: 'pending', submitted_at: new Date().toISOString() });
      }
    } catch {
      setSubmitError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-light rounded" />
          <div className="h-32 bg-gray-light rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6">
        <Link href="/landlord/dashboard" className="text-sm text-gray-dark/50 hover:text-navy transition-colors">
          ← Back to dashboard
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-bold text-navy mb-2">Get Verified</h1>
      <p className="text-gray-dark/60 text-sm mb-8">
        Upload a government-issued ID to receive a free Verified badge shown on all your listings.
      </p>

      {/* Already verified */}
      {verifiedTier && verifiedTier !== 'none' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 flex items-start gap-4">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <p className="font-heading font-bold text-emerald-800 text-base mb-0.5">Your account is verified</p>
            <p className="text-sm text-emerald-700">
              Your listings display the{' '}
              <span className="font-semibold">
                {verifiedTier === 'verified_pro' ? 'SuperLandlord Heavy' : 'SuperLandlord'}
              </span>{' '}
              badge automatically.
            </p>
          </div>
        </div>
      ) : latestRequest?.status === 'pending' ? (
        /* Pending review */
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-5">
          <p className="font-heading font-bold text-blue-800 text-base mb-1">Your ID is under review</p>
          <p className="text-sm text-blue-700">
            Submitted{' '}
            {new Date(latestRequest.submitted_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
            . We&apos;ll review it within 1–2 business days.
          </p>
        </div>
      ) : latestRequest?.status === 'rejected' ? (
        /* Rejected — allow re-upload */
        <div className="space-y-6">
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
            <p className="font-heading font-bold text-red-800 text-sm mb-0.5">Previous submission rejected</p>
            {latestRequest.review_notes && (
              <p className="text-sm text-red-700">{latestRequest.review_notes}</p>
            )}
          </div>
          <UploadForm
            file={file}
            setFile={setFile}
            fileInputRef={fileInputRef}
            submitting={submitting}
            submitError={submitError}
            submitSuccess={submitSuccess}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        /* No request yet */
        <UploadForm
          file={file}
          setFile={setFile}
          fileInputRef={fileInputRef}
          submitting={submitting}
          submitError={submitError}
          submitSuccess={submitSuccess}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function UploadForm({ file, setFile, fileInputRef, submitting, submitError, submitSuccess, onSubmit }) {
  if (submitSuccess) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5">
        <p className="font-heading font-bold text-emerald-800 text-base mb-1">Document submitted!</p>
        <p className="text-sm text-emerald-700">
          We&apos;ll review your ID within 1–2 business days and notify you when your badge is activated.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-navy mb-2">
          Government-issued ID <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-dark/50 mb-3">
          Passport, national ID card, or driver&apos;s license. JPEG, PNG, or PDF · max 10 MB.
        </p>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gold/50 bg-gray-light/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <svg className="w-8 h-8 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-emerald-700">{file.name}</p>
              <p className="text-xs text-gray-dark/40 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · click to change</p>
            </div>
          ) : (
            <div>
              <svg className="w-8 h-8 mx-auto text-gray-dark/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm text-gray-dark/50">Click to select a file</p>
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || submitting}
        className="w-full bg-navy text-white font-heading font-semibold py-3 rounded-lg hover:bg-navy/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : 'Submit for verification'}
      </button>

      <p className="text-xs text-gray-dark/40 text-center">
        Your document is stored securely and only reviewed by our team.
      </p>
    </form>
  );
}
