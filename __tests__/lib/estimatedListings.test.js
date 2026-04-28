import { describe, it, expect } from 'vitest';
import { isEstimatedPrice } from '@/lib/estimatedListings';

describe('isEstimatedPrice', () => {
  it.each([
    ['0100001', true],
    ['0100006', true],
    ['0101006', true],
    ['9999999', false],
    ['', false],
    ['0100007', false],
  ])('%s -> %s', (id, expected) => {
    expect(isEstimatedPrice(id)).toBe(expected);
  });
});
