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
      '"StudentX loves Maria" <michael@studentx.uk>',
    );
  });

  it('falls back to the brand when the name is unusable', () => {
    expect(fromAddressFor('')).toBe('StudentX <michael@studentx.uk>');
    expect(fromAddressFor(undefined)).toBe('StudentX <michael@studentx.uk>');
  });

  it('does not let quotes or angle brackets into the display name', () => {
    expect(fromAddressFor('Mar"ia <admin>')).toBe(
      '"StudentX loves Maria" <michael@studentx.uk>',
    );
  });
});

/*
  Ops mail is plain `StudentX`, deliberately.

  The personalised form is for student/landlord mail. Ops mail is read while
  something is wrong — the sender column is how you triage it, and the
  recipient is the operator, so "StudentX loves Michael" on an outage alert
  spends that column on branding aimed at the reader themselves.

  These pin it as a decision rather than an accident: an unquoted, unadorned
  mailbox, and no env var reaching into it.
*/
describe('opsFromAddress', () => {
  it('is plain StudentX, never personalised', () => {
    expect(opsFromAddress()).toBe('StudentX <michael@studentx.uk>');
  });

  it('needs no quoting — a bare atom display name', () => {
    // `StudentX` is a single RFC 5322 atext atom, so quoting it would be
    // legal but noisy. Asserted so a future change to quoteDisplayName that
    // over-quotes gets caught here.
    expect(opsFromAddress()).not.toContain('"');
  });

  it('ignores OPS_DISPLAY_NAME, which no longer exists', () => {
    // Regression guard: the var was removed from wrangler.jsonc. If someone
    // re-adds the lookup, this fails rather than silently personalising
    // outage alerts again.
    process.env.OPS_DISPLAY_NAME = 'Alex';
    try {
      expect(opsFromAddress()).toBe('StudentX <michael@studentx.uk>');
    } finally {
      delete process.env.OPS_DISPLAY_NAME;
    }
  });

  it('honours a custom mailbox while staying plain', () => {
    expect(opsFromAddress('ops@studentx.uk')).toBe('StudentX <ops@studentx.uk>');
  });
});
