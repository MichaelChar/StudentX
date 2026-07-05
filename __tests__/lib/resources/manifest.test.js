import { describe, it, expect } from 'vitest';
import { RESOURCES } from '@/lib/resources/manifest.generated';
import { ResourceEntrySchema } from '@/lib/resources/schema';

describe('resources manifest', () => {
  it('is non-empty', () => {
    expect(RESOURCES.length).toBeGreaterThan(0);
  });

  it('every entry has id/type/title/description/href/year and passes schema validation', () => {
    for (const entry of RESOURCES) {
      expect(entry.id).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.href).toBeTruthy();
      expect(Number.isInteger(entry.year)).toBe(true);
      expect(ResourceEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
