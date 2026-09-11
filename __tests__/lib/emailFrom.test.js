import { describe, it, expect, afterEach } from 'vitest';
import { firstName, fromAddressFor, opsFromAddress } from '@/lib/emailFrom';

describe('firstName', () => {
  it('takes the given name and drops the rest', () => {
    expect(firstName('Maria Papadopoulos')).toBe('Maria');
  });

  it('skips honorifics', () => {
    expect(firstName('Dr. Maria Papadopoulos')).toBe('Maria');
    expect(firstName('Mr Kostas')).toBe('Kostas');
  });

  it('keeps Greek letters and apostrophes', () => {
    expect(firstName('Ελένη Νικολάου')).toBe('Ελένη');
    expect(firstName("O'Brien")).toBe("O'Brien");
  });

  it('returns null for empty, email-shaped, or too-short tokens', () => {
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName('J')).toBeNull();
    expect(firstName('user@example.com')).toBeNull();
  });

  it('strips header-injection characters before parsing', () => {
    expect(firstName('Maria\r\nBcc: evil@example.com')).toBe('Maria');
  });
});

describe('fromAddressFor', () => {
  it('personalizes when a first name is available', () => {
    expect(fromAddressFor('Maria Papadopoulos')).toBe(
      '"StudentX loves Maria" <alerts@studentx.uk>',
    );
  });

  it('falls back to the brand when the name is unusable', () => {
    expect(fromAddressFor('')).toBe('StudentX <alerts@studentx.uk>');
    expect(fromAddressFor(undefined)).toBe('StudentX <alerts@studentx.uk>');
  });

  it('does not let quotes or angle brackets into the display name', () => {
    expect(fromAddressFor('Mar"ia <admin>')).toBe(
      '"StudentX loves Maria" <alerts@studentx.uk>',
    );
  });
});

describe('opsFromAddress', () => {
  const original = process.env.OPS_DISPLAY_NAME;

  afterEach(() => {
    if (original === undefined) delete process.env.OPS_DISPLAY_NAME;
    else process.env.OPS_DISPLAY_NAME = original;
  });

  it('defaults to Michael, the live ops inbox owner', () => {
    delete process.env.OPS_DISPLAY_NAME;
    expect(opsFromAddress()).toBe('"StudentX loves Michael" <alerts@studentx.uk>');
  });

  it('honours OPS_DISPLAY_NAME', () => {
    process.env.OPS_DISPLAY_NAME = 'Alex';
    expect(opsFromAddress()).toBe('"StudentX loves Alex" <alerts@studentx.uk>');
  });
});
