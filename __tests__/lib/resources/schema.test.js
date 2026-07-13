import { describe, it, expect } from 'vitest';
import { ResourceEntrySchema } from '@/lib/resources/schema';

const validEntry = {
  id: 'practice:biochemistry:mega-test',
  type: 'practice-test',
  title: 'Biochemistry I — Predicted Exam Questions',
  description: 'Mega test predicting the contents for the exam',
  href: '/student/ausom/semester-2/biochemistry/mega-test',
  school: 'ausom',
  subject: 'biochemistry',
  semester: 'semester-2',
  country: 'gr',
  year: 2026,
  meta: { questionCount: 48 },
};

describe('ResourceEntrySchema', () => {
  it('accepts a well-formed entry', () => {
    expect(ResourceEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it('rejects an unknown resource type', () => {
    const result = ResourceEntrySchema.safeParse({ ...validEntry, type: 'video-lecture' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown semester', () => {
    const result = ResourceEntrySchema.safeParse({ ...validEntry, semester: 'semester-13' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown country', () => {
    const result = ResourceEntrySchema.safeParse({ ...validEntry, country: 'us' });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range year', () => {
    expect(ResourceEntrySchema.safeParse({ ...validEntry, year: 1999 }).success).toBe(false);
    expect(ResourceEntrySchema.safeParse({ ...validEntry, year: 2026.5 }).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { description, ...rest } = validEntry;
    expect(ResourceEntrySchema.safeParse(rest).success).toBe(false);
  });
});
