import { describe, it, expect } from 'vitest';
import { arrayMove } from '@/lib/arrayMove';

describe('arrayMove', () => {
  it('returns the same reference when from === to', () => {
    const a = ['a', 'b', 'c'];
    expect(arrayMove(a, 1, 1)).toBe(a);
  });

  it('moves an element forward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves an element backward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves head to tail', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves tail to head', () => {
    expect(arrayMove(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    arrayMove(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('clamps out-of-range "to" indices', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(arrayMove(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });

  it('returns the input untouched for an out-of-range "from"', () => {
    const a = ['a', 'b'];
    expect(arrayMove(a, 5, 0)).toBe(a);
  });
});
