'use client';

import { useAccessToken } from '@/lib/useAccessToken';
import StudentProfileForm from '@/components/student/StudentProfileForm';

/**
 * Client wrapper that supplies the access token to StudentProfileForm.
 * Kept separate so the account profile page can stay a server component.
 */
export default function StudentProfileEditor({ initialStudent }) {
  const token = useAccessToken();
  return (
    <StudentProfileForm
      initialStudent={initialStudent}
      accessToken={token || ''}
      showDisplayName
      requireComplete={false}
    />
  );
}
