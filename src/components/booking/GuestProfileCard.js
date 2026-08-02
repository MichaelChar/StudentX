'use client';

import { useTranslations } from 'next-intl';
import Card from '@/components/ui/Card';
import {
  ageFromDateOfBirth,
  universityLabel,
  facultyLabel,
  languageLabel,
  nationalityLabel,
} from '@/lib/studentProfileFields';

function monogram(name) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

function formatMemberSince(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * Landlord-facing guest profile block. Never renders email or contact.
 * Photo column does not exist on students — monogram from display_name.
 */
export default function GuestProfileCard({ student }) {
  const t = useTranslations('propylaea.landlord.reservations.guest');

  if (!student) {
    return (
      <Card tone="parchment" className="p-6">
        <p className="label-caps text-night/60 mb-2">{t('eyebrow')}</p>
        <p className="font-display text-xl text-night/60">{t('unknown')}</p>
      </Card>
    );
  }

  const age =
    student.age != null
      ? student.age
      : ageFromDateOfBirth(student.date_of_birth);
  const languages = Array.isArray(student.languages)
    ? student.languages.map((id) => languageLabel(id) || id)
    : [];
  const memberSince = formatMemberSince(student.created_at);
  const genderKey = student.gender ? `gender_${student.gender}` : null;
  const fundingKey = student.funding_source
    ? `funding_${student.funding_source}`
    : null;

  return (
    <Card tone="parchment" className="p-6 md:p-8">
      <p className="label-caps text-night/60 mb-4">{t('eyebrow')}</p>

      <div className="flex items-start gap-4 mb-6">
        <span
          aria-hidden="true"
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue text-white font-display text-xl leading-none select-none"
        >
          {monogram(student.display_name)}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl text-night truncate">
            {student.display_name || t('unknown')}
          </h3>
          {memberSince && (
            <p className="text-sm text-night/60 mt-1 font-sans">
              {t('memberSince', { date: memberSince })}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6">
        {age != null && (
          <ProfileField label={t('age')} value={t('ageYears', { n: age })} />
        )}
        {genderKey && (
          <ProfileField label={t('gender')} value={t(genderKey)} />
        )}
        {student.nationality && (
          <ProfileField
            label={t('nationality')}
            value={nationalityLabel(student.nationality) || student.nationality}
          />
        )}
        {student.home_university && (
          <ProfileField
            label={t('homeUniversity')}
            value={universityLabel(student.home_university) || student.home_university}
          />
        )}
        {student.receiving_university && (
          <ProfileField
            label={t('receivingUniversity')}
            value={
              universityLabel(student.receiving_university) ||
              student.receiving_university
            }
          />
        )}
        {student.receiving_faculty && (
          <ProfileField
            label={t('receivingFaculty')}
            value={
              facultyLabel(student.receiving_faculty) || student.receiving_faculty
            }
          />
        )}
        {fundingKey && (
          <ProfileField label={t('funding')} value={t(fundingKey)} />
        )}
      </dl>

      {languages.length > 0 && (
        <div className="mb-5">
          <p className="label-caps text-night/50 mb-2">{t('languages')}</p>
          <p className="font-sans text-sm text-night">{languages.join(', ')}</p>
        </div>
      )}

      {student.bio && (
        <div>
          <p className="label-caps text-night/50 mb-2">{t('bio')}</p>
          <p className="font-sans text-sm text-night/80 leading-relaxed whitespace-pre-wrap">
            {student.bio}
          </p>
        </div>
      )}
    </Card>
  );
}

function ProfileField({ label, value }) {
  return (
    <div>
      <dt className="label-caps text-night/50">{label}</dt>
      <dd className="mt-1 font-display text-lg text-night">{value}</dd>
    </div>
  );
}
