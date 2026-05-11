import { describe, it, expect } from 'vitest';
import { inquiryEmailSubject, inquiryEmailHtml } from '@/templates/email/inquiry';

// English is the default locale as of issue #158 / Step B (the platform
// is now English-only; Greek support has been removed from email
// resolvers and the site UI). The 'el' branch in the template still
// exists as dormant code — covered by one regression-guard test below
// so it doesn't silently rot before the follow-up Greek-template-strip
// PR lands.

describe('inquiryEmailSubject', () => {
  it('uses English by default with both name and summary', () => {
    expect(inquiryEmailSubject('Anna', '12 Egnatias · Center')).toBe(
      'New inquiry from Anna — 12 Egnatias · Center · StudentX'
    );
  });

  it('omits the summary segment when none is provided', () => {
    expect(inquiryEmailSubject('Anna', '')).toBe('New inquiry from Anna · StudentX');
  });

  it('falls back to a generic name when student name is whitespace', () => {
    expect(inquiryEmailSubject('   ', '', 'en')).toBe('New inquiry from A student · StudentX');
  });

  it('falls back to English strings when the locale is unrecognized', () => {
    expect(inquiryEmailSubject('Maria', '', 'fr')).toBe('New inquiry from Maria · StudentX');
  });

  it('regression-guard: dormant Greek branch still renders when locale="el" is passed explicitly', () => {
    // Senders no longer pass locale='el' — but the STRINGS.el branch is
    // still in the template until the follow-up cleanup PR strips it.
    // This test catches accidental removal before that PR is ready.
    expect(inquiryEmailSubject('Maria', '12 Egnatias', 'el')).toBe(
      'Νέο αίτημα από Maria — 12 Egnatias · StudentX'
    );
  });
});

describe('inquiryEmailHtml', () => {
  const baseArgs = {
    landlordName: 'Bob',
    student: { name: 'Maria', email: 'maria@example.com' },
    message: 'Hi, is it still available?',
    listing: { listing_id: '0100006', address: '12 Egnatias', neighborhood: 'Center', monthly_price: 450 },
    appUrl: 'https://studentx.uk',
  };

  it('produces English HTML with the correct lang and listing URL by default', () => {
    const html = inquiryEmailHtml(baseArgs);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('https://studentx.uk/property/thessaloniki/listing/0100006');
    expect(html).toContain('https://studentx.uk/property/thessaloniki/landlord/inquiries');
    expect(html).toContain('€450/mo');
    expect(html).toContain('Reply to student');
  });

  it('escapes HTML in user-supplied fields to prevent injection', () => {
    const html = inquiryEmailHtml({
      ...baseArgs,
      student: { name: '<script>x</script>', email: 'a@b.com' },
      message: 'a & b < c',
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('a &amp; b &lt; c');
  });

  it('converts newlines in the message to <br/>', () => {
    const html = inquiryEmailHtml({ ...baseArgs, message: 'line1\nline2' });
    expect(html).toContain('line1<br/>line2');
  });

  it('regression-guard: dormant Greek branch still renders when locale="el" is passed explicitly', () => {
    const html = inquiryEmailHtml({ ...baseArgs, locale: 'el' });
    expect(html).toContain('<html lang="el">');
    expect(html).toContain('€450/μήνα');
  });
});
