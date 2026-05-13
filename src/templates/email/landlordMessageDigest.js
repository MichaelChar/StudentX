/**
 * Email sent to a landlord when one or more unread chat messages from
 * a student have been waiting past the debounce window. One email per
 * inquiry per N minutes (see /api/cron/landlord-message-digest).
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {string} params.studentName
 * @param {object} params.listing - { listing_id, address?, neighborhood?, monthly_price? }
 * @param {number} params.unreadCount
 * @param {string} params.snippet - Most recent unread message body
 * @param {string} params.appUrl
 * @param {string} params.inquiryId
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function landlordMessageDigestSubject(studentName, unreadCount) {
  const trimmed = (studentName || '').trim() || 'a student';
  return unreadCount === 1
    ? `New message from ${trimmed} · StudentX`
    : `${unreadCount} new messages from ${trimmed} · StudentX`;
}

export function landlordMessageDigestHtml({
  landlordName,
  studentName,
  listing,
  unreadCount,
  snippet,
  appUrl,
  inquiryId,
}) {
  const safeStudent = escapeHtml(studentName || 'a student');
  const safeGreeting = landlordName ? escapeHtml(landlordName) : 'there';
  const safeAddress = listing?.address ? escapeHtml(listing.address) : '';
  const safeNeighborhood = listing?.neighborhood ? escapeHtml(listing.neighborhood) : '';
  const safePrice = listing?.monthly_price ? `€${Number(listing.monthly_price)}/mo` : '';
  const listingSummary = [safeAddress, safeNeighborhood, safePrice].filter(Boolean).join(' · ');
  const safeSnippet = snippet ? escapeHtml(snippet).replace(/\n/g, '<br/>') : '';

  const chatUrl = `${appUrl}/property/thessaloniki/landlord/inquiries/${inquiryId}/chat`;
  const inboxUrl = `${appUrl}/property/thessaloniki/landlord/inquiries`;
  const listingUrl = listing?.listing_id ? `${appUrl}/property/thessaloniki/listing/${listing.listing_id}` : null;

  const heading = unreadCount === 1
    ? `New message from ${safeStudent}`
    : `${unreadCount} new messages from ${safeStudent}`;

  const noun = unreadCount === 1 ? 'one unread message' : `${unreadCount} unread messages`;
  const tail = listingSummary
    ? ` about your listing <strong style="color:#0a2540;">${listingSummary}</strong>`
    : '';
  const intro = `Hi ${safeGreeting}, you have ${noun} from ${safeStudent}${tail}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New messages in your conversation</title>
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
              <p style="margin:4px 0 0;font-family:'Helvetica Neue',sans-serif;font-size:11px;color:#ffffff80;">Student Housing · Thessaloniki</p>
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
              <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7a8595;">Latest message</p>
              <div style="font-size:15px;color:#0a2540;line-height:1.6;border-left:3px solid #ffcb57;padding:4px 16px;margin-bottom:24px;">
                ${safeSnippet}
              </div>`
                  : ''
              }

              <!-- CTAs -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0a2540;border-radius:8px;padding:0;">
                    <a href="${chatUrl}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open conversation</a>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="border:1px solid #0a2540;border-radius:8px;padding:0;">
                    <a href="${inboxUrl}" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#0a2540;text-decoration:none;">All inquiries</a>
                  </td>
                </tr>
              </table>

              ${
                listingUrl
                  ? `<p style="margin:24px 0 0;font-size:13px;color:#7a8595;">
                <a href="${listingUrl}" style="color:#7a8595;">View listing →</a>
              </p>`
                  : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f6f4ff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-size:12px;color:#7a8595;">
                StudentX · Student housing directory and services<br/>
                A student is messaging you on StudentX!<br/>
                We do not send you an email per message. Instead, we bundle messages every few minutes.
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
