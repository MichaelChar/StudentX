/**
 * Email sent to a student when one or more unread chat messages from
 * a landlord have been waiting past the debounce window. One email per
 * inquiry per N minutes (see /api/cron/student-message-digest).
 *
 * Mirror of landlordMessageDigest.js, inverted: that one notifies the
 * landlord about student messages; this one notifies the student about
 * landlord replies. Strings live under `landlord.notifications.*` —
 * the namespace tracks the *actor* writing the message (the landlord
 * here), not the recipient. Same convention as the landlord-bound
 * template using `student.notifications.*`.
 *
 * @param {object} params
 * @param {string} params.studentName
 * @param {string} params.landlordName
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
    'landlord.notifications.titleTag': 'Νέα μηνύματα στη συνομιλία σου',
    'landlord.notifications.headerTagline': 'Φοιτητική στέγαση · Θεσσαλονίκη',
    'landlord.notifications.heading': (count, name) =>
      count === 1
        ? `Νέο μήνυμα από ${name}`
        : `${count} νέα μηνύματα από ${name}`,
    'landlord.notifications.greetingFallback': 'εσένα',
    'landlord.notifications.intro': (greeting, count, name, summary) => {
      const noun = count === 1 ? 'ένα αδιάβαστο μήνυμα' : `${count} αδιάβαστα μηνύματα`;
      const tail = summary
        ? ` σχετικά με την αγγελία <strong style="color:#0a2540;">${summary}</strong>`
        : '';
      return `Γεια ${greeting}, έχεις ${noun} από τον/την ιδιοκτήτη/τρια ${name}${tail}.`;
    },
    'landlord.notifications.snippetLabel': 'Πιο πρόσφατο μήνυμα',
    'landlord.notifications.cta': 'Άνοιγμα συνομιλίας',
    'landlord.notifications.inboxButton': 'Όλες οι συνομιλίες μου',
    'landlord.notifications.viewListing': 'Δες την αγγελία →',
    'landlord.notifications.footerLine1':
      'StudentX · Κατάλογος φοιτητικής στέγης για τη Θεσσαλονίκη',
    'landlord.notifications.footerLine2':
      'Λαμβάνεις αυτό το email επειδή ένας ιδιοκτήτης σου απάντησε στο StudentX.',
    'landlord.notifications.footerLine3':
      'Ανοίγουμε ένα email κάθε λίγα λεπτά όταν έχεις αδιάβαστα μηνύματα — όχι ένα ανά μήνυμα.',
    'landlord.notifications.subjectOne': (name) => `Νέο μήνυμα από ${name} · StudentX`,
    'landlord.notifications.subjectMany': (count, name) =>
      `${count} νέα μηνύματα από ${name} · StudentX`,
    'landlord.notifications.subjectFallbackName': 'τον ιδιοκτήτη',
    'landlord.notifications.pricePerMonth': (n) => `€${n}/μήνα`,
  },
  en: {
    htmlLang: 'en',
    'landlord.notifications.titleTag': 'New messages in your conversation',
    'landlord.notifications.headerTagline': 'Student Housing · Thessaloniki',
    'landlord.notifications.heading': (count, name) =>
      count === 1
        ? `New message from ${name}`
        : `${count} new messages from ${name}`,
    'landlord.notifications.greetingFallback': 'there',
    'landlord.notifications.intro': (greeting, count, name, summary) => {
      const noun = count === 1 ? 'one unread message' : `${count} unread messages`;
      const tail = summary
        ? ` about <strong style="color:#0a2540;">${summary}</strong>`
        : '';
      return `Hi ${greeting}, you have ${noun} from your landlord ${name}${tail}.`;
    },
    'landlord.notifications.snippetLabel': 'Latest message',
    'landlord.notifications.cta': 'Open conversation',
    'landlord.notifications.inboxButton': 'All my inquiries',
    'landlord.notifications.viewListing': 'View listing →',
    'landlord.notifications.footerLine1':
      'StudentX · Student housing directory for Thessaloniki, Greece',
    'landlord.notifications.footerLine2':
      "You're receiving this because a landlord replied to you on StudentX.",
    'landlord.notifications.footerLine3':
      'We bundle messages into one email every few minutes instead of one per message.',
    'landlord.notifications.subjectOne': (name) => `New message from ${name} · StudentX`,
    'landlord.notifications.subjectMany': (count, name) =>
      `${count} new messages from ${name} · StudentX`,
    'landlord.notifications.subjectFallbackName': 'your landlord',
    'landlord.notifications.pricePerMonth': (n) => `€${n}/mo`,
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

function localePrefix(locale) {
  return locale === 'en' ? '/en' : '';
}

export function studentMessageDigestSubject(landlordName, unreadCount, locale = 'el') {
  const s = pickStrings(locale);
  const trimmed = (landlordName || '').trim() || s['landlord.notifications.subjectFallbackName'];
  return unreadCount === 1
    ? s['landlord.notifications.subjectOne'](trimmed)
    : s['landlord.notifications.subjectMany'](unreadCount, trimmed);
}

export function studentMessageDigestHtml({
  studentName,
  landlordName,
  listing,
  unreadCount,
  snippet,
  appUrl,
  inquiryId,
  locale = 'el',
}) {
  const s = pickStrings(locale);
  const safeLandlord = escapeHtml(landlordName || s['landlord.notifications.subjectFallbackName']);
  const safeGreeting = studentName
    ? escapeHtml(studentName)
    : s['landlord.notifications.greetingFallback'];
  const safeAddress = listing?.address ? escapeHtml(listing.address) : '';
  const safeNeighborhood = listing?.neighborhood ? escapeHtml(listing.neighborhood) : '';
  const safePrice = listing?.monthly_price
    ? s['landlord.notifications.pricePerMonth'](Number(listing.monthly_price))
    : '';
  const listingSummary = [safeAddress, safeNeighborhood, safePrice].filter(Boolean).join(' · ');
  const safeSnippet = snippet ? escapeHtml(snippet).replace(/\n/g, '<br/>') : '';

  const prefix = localePrefix(locale);
  const chatUrl = `${appUrl}${prefix}/student/inquiries/${inquiryId}`;
  const inboxUrl = `${appUrl}${prefix}/student/account`;
  const listingUrl = listing?.listing_id
    ? `${appUrl}${prefix}/property/thessaloniki/listing/${listing.listing_id}`
    : null;

  const heading = s['landlord.notifications.heading'](unreadCount, safeLandlord);
  const intro = s['landlord.notifications.intro'](
    safeGreeting,
    unreadCount,
    safeLandlord,
    listingSummary,
  );

  return `<!DOCTYPE html>
<html lang="${s.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${s['landlord.notifications.titleTag']}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4ff;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <!-- Header -->
          <tr>
            <td style="background:#0a2540;padding:24px 32px;">
              <p style="margin:0;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#ffcb57;">StudentX</p>
              <p style="margin:4px 0 0;font-family:'Helvetica Neue',sans-serif;font-size:11px;color:#ffffff80;">${s['landlord.notifications.headerTagline']}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#0a2540;">${heading}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#0a2540;line-height:1.6;">
                ${intro}
              </p>

              ${
                safeSnippet
                  ? `
              <!-- Snippet -->
              <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7a8595;">${s['landlord.notifications.snippetLabel']}</p>
              <div style="font-size:15px;color:#0a2540;line-height:1.6;border-left:3px solid #ffcb57;padding:4px 16px;margin-bottom:24px;">
                ${safeSnippet}
              </div>`
                  : ''
              }

              <!-- CTAs -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0a2540;border-radius:8px;padding:0;">
                    <a href="${chatUrl}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${s['landlord.notifications.cta']}</a>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="border:1px solid #0a2540;border-radius:8px;padding:0;">
                    <a href="${inboxUrl}" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#0a2540;text-decoration:none;">${s['landlord.notifications.inboxButton']}</a>
                  </td>
                </tr>
              </table>

              ${
                listingUrl
                  ? `<p style="margin:24px 0 0;font-size:13px;color:#7a8595;">
                <a href="${listingUrl}" style="color:#7a8595;">${s['landlord.notifications.viewListing']}</a>
              </p>`
                  : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f6f4ff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-size:12px;color:#7a8595;">
                ${s['landlord.notifications.footerLine1']}<br/>
                ${s['landlord.notifications.footerLine2']}<br/>
                ${s['landlord.notifications.footerLine3']}
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
