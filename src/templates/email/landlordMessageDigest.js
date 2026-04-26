/**
 * Email sent to a landlord when one or more unread chat messages from
 * a student have been waiting past the debounce window. One email per
 * inquiry per N minutes (see /api/cron/landlord-message-digest).
 *
 * Mirrors the styling and locale-as-key pattern of inquiry.js. New
 * strings live under the `student.notifications.*` namespace (the
 * email goes to the landlord, but the i18n key namespace is owned by
 * the student-flows feature folder).
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {string} params.studentName
 * @param {object} params.listing - { listing_id, address?, neighborhood?, monthly_price? }
 * @param {number} params.unreadCount
 * @param {string} params.snippet - Most recent unread message body
 * @param {string} params.appUrl
 * @param {string} params.inquiryId
 * @param {'el'|'en'} [params.locale='el']
 */

const STRINGS = {
  el: {
    htmlLang: 'el',
    'student.notifications.titleTag': 'Νέα μηνύματα στη συνομιλία σου',
    'student.notifications.headerTagline': 'Φοιτητική στέγαση · Θεσσαλονίκη',
    'student.notifications.heading': (count, name) =>
      count === 1
        ? `Νέο μήνυμα από ${name}`
        : `${count} νέα μηνύματα από ${name}`,
    'student.notifications.greetingFallback': 'εσένα',
    'student.notifications.intro': (greeting, count, name, summary) => {
      const noun = count === 1 ? 'ένα αδιάβαστο μήνυμα' : `${count} αδιάβαστα μηνύματα`;
      const tail = summary
        ? ` σχετικά με την αγγελία σου <strong style="color:#1a2744;">${summary}</strong>`
        : '';
      return `Γεια ${greeting}, έχεις ${noun} από τον/την ${name}${tail}.`;
    },
    'student.notifications.snippetLabel': 'Πιο πρόσφατο μήνυμα',
    'student.notifications.cta': 'Άνοιγμα συνομιλίας',
    'student.notifications.inboxButton': 'Όλα τα μηνύματα',
    'student.notifications.viewListing': 'Δες την αγγελία →',
    'student.notifications.footerLine1':
      'StudentX · Κατάλογος φοιτητικής στέγης για τη Θεσσαλονίκη',
    'student.notifications.footerLine2':
      'Λαμβάνεις αυτό το email επειδή ένας φοιτητής σου έγραψε στο StudentX.',
    'student.notifications.footerLine3':
      'Ανοίγουμε ένα email κάθε λίγα λεπτά όταν έχεις αδιάβαστα μηνύματα — όχι ένα ανά μήνυμα.',
    'student.notifications.subjectOne': (name) => `Νέο μήνυμα από ${name} · StudentX`,
    'student.notifications.subjectMany': (count, name) =>
      `${count} νέα μηνύματα από ${name} · StudentX`,
    'student.notifications.subjectFallbackName': 'έναν φοιτητή',
    'student.notifications.pricePerMonth': (n) => `€${n}/μήνα`,
  },
  en: {
    htmlLang: 'en',
    'student.notifications.titleTag': 'New messages in your conversation',
    'student.notifications.headerTagline': 'Student Housing · Thessaloniki',
    'student.notifications.heading': (count, name) =>
      count === 1
        ? `New message from ${name}`
        : `${count} new messages from ${name}`,
    'student.notifications.greetingFallback': 'there',
    'student.notifications.intro': (greeting, count, name, summary) => {
      const noun = count === 1 ? 'one unread message' : `${count} unread messages`;
      const tail = summary
        ? ` about your listing <strong style="color:#1a2744;">${summary}</strong>`
        : '';
      return `Hi ${greeting}, you have ${noun} from ${name}${tail}.`;
    },
    'student.notifications.snippetLabel': 'Latest message',
    'student.notifications.cta': 'Open conversation',
    'student.notifications.inboxButton': 'All inquiries',
    'student.notifications.viewListing': 'View listing →',
    'student.notifications.footerLine1':
      'StudentX · Student housing directory for Thessaloniki, Greece',
    'student.notifications.footerLine2':
      "You're receiving this because a student is messaging you on StudentX.",
    'student.notifications.footerLine3':
      'We bundle messages into one email every few minutes instead of one per message.',
    'student.notifications.subjectOne': (name) => `New message from ${name} · StudentX`,
    'student.notifications.subjectMany': (count, name) =>
      `${count} new messages from ${name} · StudentX`,
    'student.notifications.subjectFallbackName': 'a student',
    'student.notifications.pricePerMonth': (n) => `€${n}/mo`,
  },
};

function pickStrings(locale) {
  return STRINGS[locale] || STRINGS.el;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function landlordMessageDigestSubject(studentName, unreadCount, locale = 'el') {
  const s = pickStrings(locale);
  const trimmed = (studentName || '').trim() || s['student.notifications.subjectFallbackName'];
  return unreadCount === 1
    ? s['student.notifications.subjectOne'](trimmed)
    : s['student.notifications.subjectMany'](unreadCount, trimmed);
}

export function landlordMessageDigestHtml({
  landlordName,
  studentName,
  listing,
  unreadCount,
  snippet,
  appUrl,
  inquiryId,
  locale = 'el',
}) {
  const s = pickStrings(locale);
  const safeStudent = escapeHtml(studentName || s['student.notifications.subjectFallbackName']);
  const safeGreeting = landlordName
    ? escapeHtml(landlordName)
    : s['student.notifications.greetingFallback'];
  const safeAddress = listing?.address ? escapeHtml(listing.address) : '';
  const safeNeighborhood = listing?.neighborhood ? escapeHtml(listing.neighborhood) : '';
  const safePrice = listing?.monthly_price
    ? s['student.notifications.pricePerMonth'](Number(listing.monthly_price))
    : '';
  const listingSummary = [safeAddress, safeNeighborhood, safePrice].filter(Boolean).join(' · ');
  const safeSnippet = snippet ? escapeHtml(snippet).replace(/\n/g, '<br/>') : '';

  const chatUrl = `${appUrl}/landlord/inquiries/${inquiryId}/chat`;
  const inboxUrl = `${appUrl}/landlord/inquiries`;
  const listingUrl = listing?.listing_id ? `${appUrl}/listing/${listing.listing_id}` : null;

  const heading = s['student.notifications.heading'](unreadCount, safeStudent);
  const intro = s['student.notifications.intro'](
    safeGreeting,
    unreadCount,
    safeStudent,
    listingSummary,
  );

  return `<!DOCTYPE html>
<html lang="${s.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${s['student.notifications.titleTag']}</title>
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
              <p style="margin:4px 0 0;font-family:'Helvetica Neue',sans-serif;font-size:11px;color:#ffffff80;">${s['student.notifications.headerTagline']}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#1a2744;">${heading}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                ${intro}
              </p>

              ${
                safeSnippet
                  ? `
              <!-- Snippet -->
              <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">${s['student.notifications.snippetLabel']}</p>
              <div style="font-size:15px;color:#333;line-height:1.6;border-left:3px solid #c9a84c;padding:4px 16px;margin-bottom:24px;">
                ${safeSnippet}
              </div>`
                  : ''
              }

              <!-- CTAs -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a2744;border-radius:8px;padding:0;">
                    <a href="${chatUrl}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${s['student.notifications.cta']}</a>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="border:1px solid #1a2744;border-radius:8px;padding:0;">
                    <a href="${inboxUrl}" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#1a2744;text-decoration:none;">${s['student.notifications.inboxButton']}</a>
                  </td>
                </tr>
              </table>

              ${
                listingUrl
                  ? `<p style="margin:24px 0 0;font-size:13px;color:#888;">
                <a href="${listingUrl}" style="color:#888;">${s['student.notifications.viewListing']}</a>
              </p>`
                  : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f5f0;padding:20px 32px;border-top:1px solid #e5e5e0;">
              <p style="margin:0;font-size:12px;color:#999;">
                ${s['student.notifications.footerLine1']}<br/>
                ${s['student.notifications.footerLine2']}<br/>
                ${s['student.notifications.footerLine3']}
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
