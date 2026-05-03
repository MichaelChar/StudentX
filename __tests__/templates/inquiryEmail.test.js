import { describe, it, expect } from 'vitest';
import { inquiryEmailSubject, inquiryEmailHtml } from '@/templates/email/inquiry';

describe('inquiryEmailSubject', () => {
  it('uses Greek by default with both name and summary', () => {
    expect(inquiryEmailSubject('Maria', '12 Egnatias · Center')).toBe(
      'Νέο αίτημα από Maria — 12 Egnatias · Center · StudentX'
    );
  });

  it('omits the summary segment when none is provided (Greek)', () => {
    expect(inquiryEmailSubject('Maria', '')).toBe('Νέο αίτημα από Maria · StudentX');
  });

  it('uses English when locale is "en"', () => {
    expect(inquiryEmailSubject('Anna', '12 Egnatias', 'en')).toBe(
      'New inquiry from Anna — 12 Egnatias · StudentX'
    );
  });

  it('falls back to a generic name when student name is empty (Greek)', () => {
    expect(inquiryEmailSubject('', '12 Egnatias', 'el')).toBe(
      'Νέο αίτημα από Ένας φοιτητής — 12 Egnatias · StudentX'
    );
  });

  it('falls back to a generic name when student name is whitespace (English)', () => {
    expect(inquiryEmailSubject('   ', '', 'en')).toBe('New inquiry from A student · StudentX');
  });

  it('falls back to Greek strings when the locale is unrecognized', () => {
    expect(inquiryEmailSubject('Maria', '', 'fr')).toBe('Νέο αίτημα από Maria · StudentX');
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

  it('produces Greek HTML with the correct lang and listing URL by default', () => {
    const html = inquiryEmailHtml(baseArgs);
    expect(html).toContain('<html lang="el">');
    expect(html).toContain('https://studentx.uk/property/listing/0100006');
    expect(html).toContain('https://studentx.uk/property/landlord/inquiries');
    expect(html).toContain('€450/μήνα');
  });

  it('produces English HTML when locale is "en"', () => {
    const html = inquiryEmailHtml({ ...baseArgs, locale: 'en' });
    expect(html).toContain('<html lang="en">');
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
});
