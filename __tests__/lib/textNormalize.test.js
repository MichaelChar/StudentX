import { describe, it, expect } from 'vitest';
import {
  codepointLength,
  normalizeMultiLine,
  normalizeSingleLine,
} from '@/lib/textNormalize';

// Control character byte literals avoid embedding raw control bytes in
// the source file (which break the parser). NUL, unit-separator, DEL.
const NUL = String.fromCharCode(0);
const US = String.fromCharCode(31);
const DEL = String.fromCharCode(127);

describe('codepointLength', () => {
  it('returns plain length for ASCII', () => {
    expect(codepointLength('hello')).toBe(5);
  });

  it('counts astral-plane chars as one codepoint each', () => {
    // 🏠 is U+1F3E0 — outside the BMP, so .length is 2 but codepointLength is 1
    expect('🏠'.length).toBe(2);
    expect(codepointLength('🏠')).toBe(1);
    expect(codepointLength('🏠'.repeat(80))).toBe(80);
  });

  it('handles Greek diacritics as one codepoint each', () => {
    // 'ά' is U+1F71 (precomposed, BMP) — single codepoint regardless
    expect(codepointLength('Φωτεινό')).toBe(7);
  });
});

describe('normalizeSingleLine', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeSingleLine(null)).toBeNull();
    expect(normalizeSingleLine(undefined)).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(normalizeSingleLine('')).toBeNull();
    expect(normalizeSingleLine('   ')).toBeNull();
    expect(normalizeSingleLine('\t\n\r')).toBeNull();
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSingleLine('  hello  ')).toBe('hello');
  });

  it('collapses runs of whitespace to a single space', () => {
    expect(normalizeSingleLine('a    b\t\tc')).toBe('a b c');
  });

  it('replaces newlines with spaces', () => {
    expect(normalizeSingleLine('first\nsecond')).toBe('first second');
    expect(normalizeSingleLine('first\r\nsecond')).toBe('first second');
  });

  it('strips C0 control characters (NUL, unit-separator, DEL)', () => {
    expect(normalizeSingleLine('hello' + NUL + 'world')).toBe('hello world');
    expect(normalizeSingleLine('a' + US + 'b' + DEL + 'c')).toBe('a b c');
  });

  it('coerces non-strings via String()', () => {
    expect(normalizeSingleLine(123)).toBe('123');
    expect(normalizeSingleLine(true)).toBe('true');
  });
});

describe('normalizeMultiLine', () => {
  it('returns null for null/undefined/empty/whitespace-only', () => {
    expect(normalizeMultiLine(null)).toBeNull();
    expect(normalizeMultiLine(undefined)).toBeNull();
    expect(normalizeMultiLine('')).toBeNull();
    expect(normalizeMultiLine('  \n  \n  ')).toBeNull();
  });

  it('preserves single newlines (line breaks within a paragraph)', () => {
    expect(normalizeMultiLine('first\nsecond')).toBe('first\nsecond');
  });

  it('preserves a blank line between paragraphs', () => {
    expect(normalizeMultiLine('para one\n\npara two')).toBe(
      'para one\n\npara two'
    );
  });

  it('collapses three or more consecutive newlines to two', () => {
    expect(normalizeMultiLine('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('normalizes CRLF and CR to LF', () => {
    expect(normalizeMultiLine('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('trims each line and the outer string', () => {
    expect(normalizeMultiLine('   line one  \n   line two   ')).toBe(
      'line one\nline two'
    );
  });

  it('collapses runs of horizontal whitespace within a line', () => {
    expect(normalizeMultiLine('a    b\t\t\tc')).toBe('a b c');
  });

  it('strips non-newline control characters within a line', () => {
    expect(normalizeMultiLine('hello' + NUL + 'world\nbye')).toBe(
      'hello world\nbye'
    );
  });
});
