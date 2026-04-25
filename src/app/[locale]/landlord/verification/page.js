'use client';

import { useEffect, useState, useRef } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

export default function LandlordVerificationPage() {
  const [loading, setLoading] = useState(true);
  const [verifiedTier, setVerifiedTier] = useState(null);
  const [latestRequest, setLatestRequest] = useState(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // LandlordShell handles the redirect to /landlord/login
        return;
      }

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
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setSubmitError('');

    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSubmitError('Session expired. Please sign in again.');
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append('id_document', file);

    try {
      const res = await fetch('/api/landlord/verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
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

  return (
    <LandlordShell eyebrow="Verification" title="Get verified">
      <div className="max-w-lg">
        <p className="text-night/60 text-sm mb-8">
          Upload a government-issued ID to receive a free Verified badge shown on all your listings.
        </p>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-parchment rounded-sm" />
            <div className="h-32 bg-parchment rounded-sm" />
          </div>
        ) : verifiedTier && verifiedTier !== 'none' ? (
          /* Already verified */
          <Card tone="parchment" className="px-6 py-5 flex items-start gap-4">
            <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-blue/10 flex items-center justify-center text-blue">
              <Icon name="shieldCheck" className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display text-lg text-night mb-0.5">
                Your account is verified
              </p>
              <p className="text-sm text-night/70">
                Your listings display the{' '}
                <span className="font-semibold text-night">
                  {verifiedTier === 'verified_pro' ? 'SuperLandlord Heavy' : 'SuperLandlord'}
                </span>{' '}
                badge automatically.
              </p>
            </div>
          </Card>
        ) : latestRequest?.status === 'pending' ? (
          /* Pending review */
          <Card tone="parchment" className="px-6 py-5">
            <p className="label-caps text-gold mb-1">Under review</p>
            <p className="font-display text-lg text-night mb-1">
              Your ID is being reviewed
            </p>
            <p className="text-sm text-night/70">
              Submitted{' '}
              {new Date(latestRequest.submitted_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
              . We&apos;ll review it within 1–2 business days.
            </p>
          </Card>
        ) : latestRequest?.status === 'rejected' ? (
          /* Rejected — allow re-upload */
          <div className="space-y-6">
            <div className="rounded-sm border border-red-200 bg-red-50 px-6 py-4">
              <p className="label-caps text-red-700 mb-1">Rejected</p>
              <p className="font-display text-base text-red-800 mb-1">
                Previous submission rejected
              </p>
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
    </LandlordShell>
  );
}

function UploadForm({ file, setFile, fileInputRef, submitting, submitError, submitSuccess, onSubmit }) {
  if (submitSuccess) {
    return (
      <Card tone="parchment" className="px-6 py-5 flex items-start gap-4">
        <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-blue/10 flex items-center justify-center text-blue">
          <Icon name="check" className="w-5 h-5" />
        </div>
        <div>
          <p className="font-display text-lg text-night mb-1">Document submitted</p>
          <p className="text-sm text-night/70">
            We&apos;ll review your ID within 1–2 business days and notify you when your badge is activated.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="label-caps text-night/70 mb-2 block">
          Government-issued ID <span className="text-red-600 normal-case">*</span>
        </label>
        <p className="text-xs text-night/50 mb-3">
          Passport, national ID card, or driver&apos;s license. JPEG, PNG, or PDF · max 10 MB.
        </p>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-sm border-2 border-dashed px-6 py-8 text-center transition-colors ${
            file
              ? 'border-blue/40 bg-blue/5 text-blue'
              : 'border-night/15 hover:border-gold/60 bg-parchment text-night/60'
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
              <Icon name="check" className="w-8 h-8 mx-auto text-blue mb-2" />
              <p className="text-sm font-medium text-night">{file.name}</p>
              <p className="text-xs text-night/50 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB · click to change
              </p>
            </div>
          ) : (
            <div>
              <Icon name="plus" className="w-8 h-8 mx-auto text-night/40 mb-2" />
              <p className="text-sm text-night/60">Click to select a file</p>
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={!file || submitting}
        className="w-full justify-center"
      >
        {submitting ? 'Submitting…' : 'Submit for verification'}
      </Button>

      <p className="text-xs text-night/50 text-center">
        Your document is stored securely and only reviewed by our team.
      </p>
    </form>
  );
}
