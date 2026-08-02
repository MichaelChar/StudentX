'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import {
  GENDERS,
  FUNDING_SOURCES,
  UNIVERSITIES,
  RECEIVING_FACULTIES,
  LANGUAGES,
  NATIONALITIES,
  BIO_MAX_CHARS,
  PROFILE_REQUIRED_FIELDS,
  missingProfileFields,
  profileCompleteness,
} from '@/lib/studentProfileFields';

const INPUT_CLS =
  'mt-1.5 w-full rounded-sm border border-night/15 bg-parchment px-3 py-2.5 text-sm text-night focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue';

function emptyForm() {
  return {
    display_name: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    languages: [],
    bio: '',
    home_university: '',
    receiving_university: '',
    receiving_faculty: '',
    funding_source: '',
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
    nationality: student.nationality || '',
    languages: Array.isArray(student.languages) ? [...student.languages] : [],
    bio: student.bio || '',
    home_university: student.home_university || '',
    receiving_university: student.receiving_university || '',
    receiving_faculty: student.receiving_faculty || '',
    funding_source: student.funding_source || '',
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
      languages: form.languages,
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

  function toggleLanguage(id) {
    setForm((prev) => {
      const has = prev.languages.includes(id);
      const languages = has
        ? prev.languages.filter((x) => x !== id)
        : [...prev.languages, id];
      return { ...prev, languages };
    });
    setStatus('');
    setError('');
  }

  const facultiesForReceiving = useMemo(() => {
    if (!form.receiving_university) return RECEIVING_FACULTIES;
    return RECEIVING_FACULTIES.filter(
      (f) => f.university === form.receiving_university || f.id === 'other',
    );
  }, [form.receiving_university]);

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
        nationality: form.nationality || null,
        languages: form.languages,
        bio: form.bio || null,
        home_university: form.home_university || null,
        receiving_university: form.receiving_university || null,
        receiving_faculty: form.receiving_faculty || null,
        funding_source: form.funding_source || null,
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
          className="h-2 w-full rounded-sm bg-night/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(completeness * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('completenessLabel')}
        >
          <div
            className="h-full bg-blue transition-all"
            style={{ width: `${Math.round(completeness * 100)}%` }}
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
          <span className="label-caps text-night/60">{t('nationality')}</span>
          <select
            value={form.nationality}
            onChange={(e) => setField('nationality', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {NATIONALITIES.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="label-caps text-night/60">{t('languages')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => {
              const on = form.languages.includes(lang.id);
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => toggleLanguage(lang.id)}
                  aria-pressed={on}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs font-sans font-medium transition-colors ${
                    on
                      ? 'border-blue bg-blue text-white'
                      : 'border-night/15 bg-parchment text-night hover:border-blue'
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </fieldset>

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
          <select
            value={form.home_university}
            onChange={(e) => setField('home_university', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {UNIVERSITIES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('receivingUniversity')}</span>
          <select
            value={form.receiving_university}
            onChange={(e) => {
              setField('receiving_university', e.target.value);
              setField('receiving_faculty', '');
            }}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {UNIVERSITIES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('receivingFaculty')}</span>
          <select
            value={form.receiving_faculty}
            onChange={(e) => setField('receiving_faculty', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {facultiesForReceiving.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label-caps text-night/60">{t('fundingSource')}</span>
          <select
            value={form.funding_source}
            onChange={(e) => setField('funding_source', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {FUNDING_SOURCES.map((f) => (
              <option key={f} value={f}>
                {t(`funding_${f}`)}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p
            role="alert"
            className="text-sm text-magenta bg-parchment border border-night/10 rounded-sm px-3 py-2"
          >
            {error}
          </p>
        )}
        {status && !error && (
          <p className="text-sm text-night bg-parchment border border-night/10 rounded-sm px-3 py-2">
            {status}
          </p>
        )}

        <Button
          type="submit"
          variant="gold"
          disabled={saving || !accessToken}
          className="w-full justify-center sm:w-auto"
        >
          {saving ? t('saving') : submitLabel || t('save')}
        </Button>
      </form>
    </Card>
  );
}
