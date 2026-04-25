/**
 * Email sent to a landlord when a student submits an inquiry from a listing.
 * Mirrors the brand styling used by digest.js.
 *
 * Greek is the primary market, so locale defaults to 'el'. The route resolves
 * the locale from Accept-Language (and would prefer a landlord-stored
 * preferred_locale if/when that column is added). EN is kept as a fallback
 * for non-Greek-speaking landlords.
 *
 * @param {object} params
 * @param {string} params.landlordName - Name shown in greeting (falls back to "there"/"εσένα")
 * @param {object} params.student - { name, email, phone?, faculty? }
 * @param {string} params.message - Raw student message
 * @param {object} params.listing - { listing_id, address?, neighborhood?, monthly_price? }
 * @param {string} params.appUrl - Base URL of the app (no trailing slash)
 * @param {'el'|'en'} [params.locale='el'] - Email locale
 */

const STRINGS = {
  el: {
    htmlLang: 'el',
    titleTag: 'Νέο αίτημα για την αγγελία σου',
    headerTagline: 'Φοιτητική στέγαση · Θεσσαλονίκη',
    headingFrom: (name) => `Νέο αίτημα από ${name}`,
    introNoSummary: (greeting) =>
      `Γεια ${greeting}, ένας φοιτητής μόλις σου έστειλε μήνυμα για την αγγελία σου.`,
    introWithSummary: (greeting, summary) =>
      `Γεια ${greeting}, ένας φοιτητής μόλις σου έστειλε μήνυμα για την αγγελία σου <strong style="color:#1a2744;">${summary}</strong>.`,
    studentLabel: 'Φοιτητής',
    facultyLabel: 'Σχολή',
    messageLabel: 'Μήνυμα',
    replyButton: 'Απάντηση στον φοιτητή',
    inboxButton: 'Άνοιγμα εισερχομένων',
    viewListing: 'Δες την αγγελία →',
    footerLine1: 'StudentX · Κατάλογος φοιτητικής στέγης για τη Θεσσαλονίκη',
    footerLine2: 'Λαμβάνεις αυτό το email επειδή ένας φοιτητής επικοινώνησε μαζί σου για την αγγελία σου στο StudentX.',
    footerLine3: 'Πάτα Reply για απάντηση — το μήνυμά σου θα πάει απευθείας στον φοιτητή.',
    greetingFallback: 'εσένα',
    subjectWithSummary: (name, summary) => `Νέο αίτημα από ${name} — ${summary} · StudentX`,
    subjectNoSummary: (name) => `Νέο αίτημα από ${name} · StudentX`,
    subjectFallbackName: 'Ένας φοιτητής',
    pricePerMonth: (n) => `€${n}/μήνα`,
  },
  en: {
    htmlLang: 'en',
    titleTag: 'New inquiry on your listing',
    headerTagline: 'Student Housing · Thessaloniki',
    headingFrom: (name) => `New inquiry from ${name}`,
    introNoSummary: (greeting) =>
      `Hi ${greeting}, a student just sent you a message about your listing.`,
    introWithSummary: (greeting, summary) =>
      `Hi ${greeting}, a student just sent you a message about your listing <strong style="color:#1a2744;">${summary}</strong>.`,
    studentLabel: 'Student',
    facultyLabel: 'Faculty',
    messageLabel: 'Message',
    replyButton: 'Reply to student',
    inboxButton: 'Open inbox',
    viewListing: 'View listing →',
    footerLine1: 'StudentX · Student housing directory for Thessaloniki, Greece',
    footerLine2: "You're receiving this because a student contacted you about your listing on StudentX.",
    footerLine3: 'Just hit Reply to respond — your message will go straight to the student.',
    greetingFallback: 'there',
    subjectWithSummary: (name, summary) => `New inquiry from ${name} — ${summary} · StudentX`,
    subjectNoSummary: (name) => `New inquiry from ${name} · StudentX`,
    subjectFallbackName: 'A student',
    pricePerMonth: (n) => `€${n}/mo`,
  },
};

function pickStrings(locale) {
  return STRINGS[locale] || STRINGS.el;
}

export function inquiryEmailHtml({ landlordName, student, message, listing, appUrl, locale = 'el' }) {
  const s = pickStrings(locale);
  const safeName = escapeHtml(student.name);
  const safeEmail = escapeHtml(student.email);
  const safePhone = student.phone ? escapeHtml(student.phone) : '';
  const safeFaculty = student.faculty ? escapeHtml(student.faculty) : '';
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');
  const safeAddress = listing.address ? escapeHtml(listing.address) : '';
  const safeNeighborhood = listing.neighborhood ? escapeHtml(listing.neighborhood) : '';
  const safePrice = listing.monthly_price ? s.pricePerMonth(Number(listing.monthly_price)) : '';
  const safeGreeting = landlordName ? escapeHtml(landlordName) : s.greetingFallback;

  const listingUrl = `${appUrl}/listing/${listing.listing_id}`;
  const inboxUrl = `${appUrl}/landlord/inquiries`;

  const listingSummary = [safeAddress, safeNeighborhood, safePrice].filter(Boolean).join(' · ');
  const intro = listingSummary
    ? s.introWithSummary(safeGreeting, listingSummary)
    : s.introNoSummary(safeGreeting);

  return `<!DOCTYPE html>
<html lang="${s.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${s.titleTag}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e0;">
          <!-- Header -->
          <tr>
            <td style="background:#1a2744;padding:24px 32px;">
              <p style="margin:0;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;">StudentX</p>
              <p style="margin:4px 0 0;font-family:'Helvetica Neue',sans-serif;font-size:11px;color:#ffffff80;">${s.headerTagline}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#1a2744;">${s.headingFrom(safeName)}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                ${intro}
              </p>

              <!-- Student card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:8px;padding:20px;margin-bottom:20px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">${s.studentLabel}</p>
                    <p style="margin:0 0 4px;font-family:'Helvetica Neue',sans-serif;font-size:16px;font-weight:700;color:#1a2744;">${safeName}</p>
                    <p style="margin:0;font-size:14px;color:#555;">
                      <a href="mailto:${safeEmail}" style="color:#c9a84c;text-decoration:none;">${safeEmail}</a>
                      ${safePhone ? ` · <a href="tel:${safePhone}" style="color:#c9a84c;text-decoration:none;">${safePhone}</a>` : ''}
                    </p>
                    ${safeFaculty ? `<p style="margin:6px 0 0;font-size:13px;color:#777;">${s.facultyLabel}: ${safeFaculty}</p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">${s.messageLabel}</p>
              <div style="font-size:15px;color:#333;line-height:1.6;border-left:3px solid #c9a84c;padding:4px 16px;margin-bottom:24px;">
                ${safeMessage}
              </div>

              <!-- CTAs -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a2744;border-radius:8px;padding:0;">
                    <a href="mailto:${safeEmail}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${s.replyButton}</a>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="border:1px solid #1a2744;border-radius:8px;padding:0;">
                    <a href="${inboxUrl}" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#1a2744;text-decoration:none;">${s.inboxButton}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#888;">
                <a href="${listingUrl}" style="color:#888;">${s.viewListing}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f5f0;padding:20px 32px;border-top:1px solid #e5e5e0;">
              <p style="margin:0;font-size:12px;color:#999;">
                ${s.footerLine1}<br/>
                ${s.footerLine2}<br/>
                ${s.footerLine3}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function inquiryEmailSubject(studentName, listingSummary, locale = 'el') {
  const s = pickStrings(locale);
  const trimmedName = (studentName || '').trim() || s.subjectFallbackName;
  if (listingSummary) {
    return s.subjectWithSummary(trimmedName, listingSummary);
  }
  return s.subjectNoSummary(trimmedName);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
