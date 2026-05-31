import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safeNext';

// Build the dangerous characters via char code so no raw control bytes /
// backslashes are embedded in the source (matches textNormalize.test.js).
const BACKSLASH = String.fromCharCode(92);
const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

describe('safeNextPath', () => {
  it('passes plain root-relative paths through unchanged', () => {
    expect(safeNextPath('/student/account')).toBe('/student/account');
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/listing/123#gallery')).toBe('/listing/123#gallery');
  });

  it('preserves query strings byte-for-byte', () => {
    const path = '/property/thessaloniki/results?min=300&max=900&sort=walk';
    expect(safeNextPath(path)).toBe(path);
  });

  it('rejects non-string / empty input', () => {
    expect(safeNextPath('')).toBe('');
    expect(safeNextPath(null)).toBe('');
    expect(safeNextPath(undefined)).toBe('');
    expect(safeNextPath(42)).toBe('');
  });

  it('rejects absolute URLs', () => {
    expect(safeNextPath('https://evil.com')).toBe('');
    expect(safeNextPath('http://evil.com/phish')).toBe('');
    expect(safeNextPath('javascript:alert(1)')).toBe('');
  });

  it('rejects protocol-relative URLs (the //evil.com bypass)', () => {
    expect(safeNextPath('//evil.com')).toBe('');
    expect(safeNextPath('//evil.com/fake-login')).toBe('');
  });

  it('rejects backslash-smuggled URLs', () => {
    // "/\evil.com" — WHATWG normalizes the backslash to a slash → "//evil.com"
    expect(safeNextPath('/' + BACKSLASH + 'evil.com')).toBe('');
    expect(safeNextPath('/' + BACKSLASH + BACKSLASH + 'evil.com')).toBe('');
  });

  it('rejects whitespace/control-char-smuggled URLs', () => {
    // Browsers strip tab/newline from URLs, turning these into "//evil.com".
    expect(safeNextPath('/' + TAB + '/evil.com')).toBe('');
    expect(safeNextPath('/' + NEWLINE + '/evil.com')).toBe('');
    expect(safeNextPath('/ok' + NUL + 'path')).toBe('');
  });
});
