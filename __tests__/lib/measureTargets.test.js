import { describe, it, expect, vi } from 'vitest';
import { loadMeasureTargets } from '@/lib/measureTargets';

function client({ faculties = [], universities = [], facultiesError = null, universitiesError = null } = {}) {
  return {
    from(table) {
      if (table === 'faculties') return { select: async () => ({ data: faculties, error: facultiesError }) };
      if (table === 'universities') return { select: async () => ({ data: universities, error: universitiesError }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('loadMeasureTargets', () => {
  it('returns faculties and university fallback points', async () => {
    const result = await loadMeasureTargets(
      client({ faculties: [{ faculty_id: 'auth-law' }], universities: [{ university_id: 'uom' }] }),
      '[t]',
    );
    expect(result).toEqual({ faculties: [{ faculty_id: 'auth-law' }], universities: [{ university_id: 'uom' }] });
  });

  it('fails on a faculties error: there is nothing to measure to', async () => {
    const result = await loadMeasureTargets(client({ facultiesError: { message: 'boom' } }), '[t]');
    expect(result).toEqual({ error: 'faculties: boom' });
  });

  it('treats a universities error as soft', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await loadMeasureTargets(
      client({ faculties: [{ faculty_id: 'auth-law' }], universitiesError: { message: 'down' } }),
      '[t]',
    );
    expect(result).toEqual({ faculties: [{ faculty_id: 'auth-law' }], universities: [] });
    expect(spy).toHaveBeenCalledWith('[t] universities:', { message: 'down' });
    spy.mockRestore();
  });
});
