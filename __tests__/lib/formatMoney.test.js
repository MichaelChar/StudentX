import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatMoney,
  currencySymbol,
  _clearFormatMoneyCache,
  _getFormatMoneyFormatter,
} from '@/lib/formatMoney';

describe('formatMoney', () => {
  beforeEach(() => {
    _clearFormatMoneyCache();
  });

  it('formats EUR by default as a bare integer', () => {
    expect(formatMoney(450)).toBe('€450');
    expect(formatMoney(450, 'EUR')).toBe('€450');
  });

  it('formats a non-EUR currency', () => {
    expect(formatMoney(450, 'GBP')).toBe('£450');
    expect(formatMoney(1200, 'USD')).toBe('$1,200');
  });

  it('renders cents with two fraction digits', () => {
    expect(formatMoney(251.1)).toBe('€251.10');
    expect(formatMoney(251.1, 'EUR')).toBe('€251.10');
    // bookingFees money() values
    expect(formatMoney(251.1)).toBe('€251.10');
  });

  it('returns empty string (or fallback) for null / undefined / NaN', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(undefined)).toBe('');
    expect(formatMoney(NaN)).toBe('');
    expect(formatMoney(Infinity)).toBe('');
    expect(formatMoney('')).toBe('');
    expect(formatMoney(null, 'EUR', 'en', '—')).toBe('—');
    expect(formatMoney(undefined, 'EUR', 'en', 'n/a')).toBe('n/a');
  });

  it('accepts numeric strings', () => {
    expect(formatMoney('450')).toBe('€450');
    expect(formatMoney('251.10')).toBe('€251.10');
  });

  it('memoises Intl.NumberFormat per (currency, locale, fractionDigits)', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');

    formatMoney(100, 'EUR', 'en');
    formatMoney(200, 'EUR', 'en');
    formatMoney(300, 'EUR', 'en');
    // One constructor call for the whole-amount formatter.
    expect(spy).toHaveBeenCalledTimes(1);

    formatMoney(100.5, 'EUR', 'en');
    formatMoney(200.25, 'EUR', 'en');
    // Second call for the cents formatter.
    expect(spy).toHaveBeenCalledTimes(2);

    formatMoney(50, 'GBP', 'en');
    expect(spy).toHaveBeenCalledTimes(3);

    // Same triple returns the identical instance.
    const a = _getFormatMoneyFormatter('EUR', 'en', 0);
    const b = _getFormatMoneyFormatter('EUR', 'en', 0);
    expect(a).toBe(b);

    spy.mockRestore();
  });
});

describe('currencySymbol', () => {
  beforeEach(() => {
    _clearFormatMoneyCache();
  });

  it('returns the symbol for common currencies', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('USD')).toBe('$');
  });
});
