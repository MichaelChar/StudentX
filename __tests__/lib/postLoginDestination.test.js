import { describe, it, expect } from 'vitest';
import { postLoginDestination, STUDENT_HOME, LANDLORD_HOME } from '@/lib/postLoginDestination';

describe('postLoginDestination', () => {
  it('sends each role home when there is no next', () => {
    expect(postLoginDestination('student', '')).toBe(STUDENT_HOME);
    expect(postLoginDestination('landlord', '')).toBe(LANDLORD_HOME);
  });

  it('honours a neutral next for either role, query intact', () => {
    const next = '/property/thessaloniki/listing/42?from=results';
    expect(postLoginDestination('student', next)).toBe(next);
    expect(postLoginDestination('landlord', next)).toBe(next);
    expect(postLoginDestination('landlord', '/admin/dashboard')).toBe('/admin/dashboard');
  });

  it("never sends a landlord into the student area — they'd bounce off requireStudent", () => {
    expect(postLoginDestination('landlord', '/student/account/bookings')).toBe(LANDLORD_HOME);
    expect(postLoginDestination('landlord', '/student')).toBe(LANDLORD_HOME);
    expect(postLoginDestination('landlord', '/student?x=1')).toBe(LANDLORD_HOME);
  });

  it('never sends a student into the landlord area', () => {
    expect(postLoginDestination('student', '/property/thessaloniki/landlord/dashboard')).toBe(STUDENT_HOME);
    expect(postLoginDestination('student', '/property/athens/landlord')).toBe(STUDENT_HOME);
  });

  it('does not over-match look-alike paths', () => {
    // /students-guide is not /student; /property/x/landlords is the public
    // landlord directory, not the dashboard tree.
    expect(postLoginDestination('landlord', '/students-guide')).toBe('/students-guide');
    expect(postLoginDestination('student', '/property/thessaloniki/landlords/7')).toBe(
      '/property/thessaloniki/landlords/7',
    );
  });
});
