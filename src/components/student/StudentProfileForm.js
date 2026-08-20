'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import {
  GENDERS,
  BIO_MAX_CHARS,
  PROFILE_REQUIRED_FIELDS,
  missingProfileFields,
  profileCompleteness,
} from '@/lib/studentProfileFields';

const INPUT_CLS =
  'mt-1.5 w-full rounded-control border border-night/15 bg-parchment px-3 py-2.5 text-sm text-night focus-visible:ring-2 focus-visible:ring-blue/20 focus-visible:border-blue';

function emptyForm() {
  return {
    display_name: '',
    date_of_birth: '',
    gender: '',
    bio: '',
    home_university: '',
    receiving_university: '',
  };
}

function studentToForm(student) {
  if (!student) return emptyForm();
  return {
    display_name: student.display_name || '',
    date_of_birth: student.date_of_birth
      ? String(student.date_of_birth).slice(0, 10)
      : '',
    gender: student.gender || '',
    bio: student.bio || '',
    home_university: student.home_university || '',
    receiving_university: student.receiving_university || '',
  };
}

/**
 * Shared guest-profile editor used on the student account page and inline
 * on BookingWidget when a booking is blocked for an incomplete profile.
 *
 * @param {object} props
 * @param {object|null} props.initialStudent
 * @param {string} props.accessToken
 * @param {(student: object) => void} [props.onSaved]
 * @param {boolean} [props.requireComplete] — block save until all fields set
 * @param {boolean} [props.showDisplayName]
 * @param {boolean} [props.compact] — denser layout for the booking rail
 * @param {string} [props.submitLabel]
 */
export default function StudentProfileForm({
  initialStudent,
  accessToken,
  onSaved,
  requireComplete = false,
  showDisplayName = true,
  compact = false,
  submitLabel,
}) {
  const t = useTranslations('student.profile');
  const [form, setForm] = useState(() => studentToForm(initialStudent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const previewStudent = useMemo(
    () => ({
      ...form,
    }),
    [form],
  );
  const missing = missingProfileFields(previewStudent);
  const completeness = profileCompleteness(previewStudent);
  const filledCount = PROFILE_REQUIRED_FIELDS.length - missing.length;
  const totalCount = PROFILE_REQUIRED_FIELDS.length;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('');
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('');

    if (requireComplete && missing.length > 0) {
      setError(t('errorIncomplete'));
      return;
    }

    if (!accessToken) {
      setError(t('errorGeneric'));
      return;
    }

    setSaving(true);
    try {
      const body = {
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        bio: form.bio || null,
        home_university: form.home_university || null,
        receiving_university: form.receiving_university || null,
      };
      if (showDisplayName && form.display_name.trim()) {
        body.display_name = form.display_name.trim();
      }

      const res = await fetch('/api/student/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('errorGeneric'));
        return;
      }
      setStatus(t('saved'));
      if (data.student) {
        setForm(studentToForm(data.student));
        onSaved?.(data.student);
      }
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone={compact ? 'parchment' : 'white'} className={compact ? 'p-4' : 'p-6 md:p-8'}>
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="label-caps text-night/60">{t('completenessLabel')}</p>
          <p className="text-sm font-sans text-night/60">
            {t('completenessCount', { filled: filledCount, total: totalCount })}
          </p>
        </div>
        <div
          className="h-2 w-full rounded-full bg-night/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(completeness * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('completenessLabel')}
        >
          {/* Scale, not width: animating `width` is a layout property and
              re-lays-out the row every frame. transform is composited, so the
              same visual fill costs nothing on a mid-range phone. */}
          <div
            className="h-full w-full origin-left bg-blue transition-transform"
            style={{ transform: `scaleX(${completeness})` }}
          />
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-sm text-night/60 font-sans">{t('completenessHint')}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {showDisplayName && (
          <label className="block">
            <span className="label-caps text-night/60">{t('displayName')}</span>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setField('display_name', e.target.value)}
              maxLength={80}
              className={INPUT_CLS}
            />
          </label>
        )}

        <label className="block">
          <span className="label-caps text-night/60">{t('dateOfBirth')}</span>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setField('date_of_birth', e.target.value)}
            className={INPUT_CLS}
          />
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('gender')}</span>
          <select
            value={form.gender}
            onChange={(e) => setField('gender', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`gender_${g}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('bio')}</span>
          <textarea
            rows={compact ? 3 : 4}
            maxLength={BIO_MAX_CHARS}
            value={form.bio}
            onChange={(e) => setField('bio', e.target.value)}
            placeholder={t('bioPlaceholder')}
            className={`${INPUT_CLS} resize-none`}
          />
          <span className="mt-1 block text-xs text-night/50 font-sans">
            {t('bioCount', {
              n: form.bio.length,
              max: BIO_MAX_CHARS,
            })}
          </span>
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('homeUniversity')}</span>
          <input
            type="text"
            value={form.home_university}
            onChange={(e) => setField('home_university', e.target.value)}
            placeholder={t('homeUniversityPlaceholder')}
            className={INPUT_CLS}
          />
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('receivingUniversity')}</span>
          <input
            type="text"
            value={form.receiving_university}
            onChange={(e) => setField('receiving_university', e.target.value)}
            placeholder={t('receivingUniversityPlaceholder')}
            className={INPUT_CLS}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="text-sm text-magenta bg-parchment border border-night/10 rounded-control px-3 py-2"
          >
            {error}
          </p>
        )}
        {status && !error && (
          <p className="text-sm text-night/60 font-sans" role="status">
            {status}
          </p>
        )}

        <Button
          type="submit"
          variant="gold"
          disabled={saving}
          className="w-full justify-center sm:w-auto"
        >
          {saving ? t('saving') : submitLabel || t('save')}
        </Button>
      </form>
    </Card>
  );
}
