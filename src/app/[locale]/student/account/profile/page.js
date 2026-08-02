import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStudent } from '@/lib/requireStudent';
import AccountChrome from '@/components/student/AccountChrome';
import StudentProfileEditor from '@/components/student/StudentProfileEditor';
import {
  STUDENT_PROFILE_SELECT,
  ageFromDateOfBirth,
} from '@/lib/studentProfileFields';

export default async function StudentProfilePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({ next: '/student/account/profile' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.profile' });
  const { supabase, student: base } = auth;

  // requireStudent selects a slim column set; re-fetch full guest profile.
  const { data: full } = await supabase
    .from('students')
    .select(STUDENT_PROFILE_SELECT)
    .eq('student_id', base.student_id)
    .maybeSingle();

  const student = full
    ? {
        ...full,
        languages: Array.isArray(full.languages) ? full.languages : [],
        age: ageFromDateOfBirth(full.date_of_birth),
      }
    : {
        ...base,
        languages: [],
        age: null,
      };

  return (
    <AccountChrome locale={locale} student={student} active="profile">
      <section>
        <h2 className="font-display text-2xl text-night mb-2">{t('title')}</h2>
        <p className="text-night/60 mb-6 font-sans text-sm md:text-base max-w-2xl">
          {t('lede')}
        </p>
        <StudentProfileEditor initialStudent={student} />
      </section>
    </AccountChrome>
  );
}
