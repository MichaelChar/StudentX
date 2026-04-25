/**
 * Email sent to a landlord when a student submits an inquiry from a listing.
 * Mirrors the brand styling used by digest.js.
 *
 * @param {object} params
 * @param {string} params.landlordName - Name shown in greeting (falls back to "there")
 * @param {object} params.student - { name, email, phone?, faculty? }
 * @param {string} params.message - Raw student message
 * @param {object} params.listing - { listing_id, address?, neighborhood?, monthly_price? }
 * @param {string} params.appUrl - Base URL of the app (no trailing slash)
 */
export function inquiryEmailHtml({ landlordName, student, message, listing, appUrl }) {
  const safeName = escapeHtml(student.name);
  const safeEmail = escapeHtml(student.email);
  const safePhone = student.phone ? escapeHtml(student.phone) : '';
  const safeFaculty = student.faculty ? escapeHtml(student.faculty) : '';
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');
  const safeAddress = listing.address ? escapeHtml(listing.address) : '';
  const safeNeighborhood = listing.neighborhood ? escapeHtml(listing.neighborhood) : '';
  const safePrice = listing.monthly_price ? `€${Number(listing.monthly_price)}/mo` : '';
  const safeGreeting = landlordName ? escapeHtml(landlordName) : 'there';

  const listingUrl = `${appUrl}/listing/${listing.listing_id}`;
  const inboxUrl = `${appUrl}/landlord/inquiries`;

  const listingSummary = [safeAddress, safeNeighborhood, safePrice].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New inquiry on your listing</title>
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
              <p style="margin:4px 0 0;font-family:'Helvetica Neue',sans-serif;font-size:11px;color:#ffffff80;">Student Housing · Thessaloniki</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#1a2744;">New inquiry from ${safeName}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                Hi ${safeGreeting}, a student just sent you a message about your listing${listingSummary ? ` <strong style="color:#1a2744;">${listingSummary}</strong>` : ''}.
              </p>

              <!-- Student card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:8px;padding:20px;margin-bottom:20px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">Student</p>
                    <p style="margin:0 0 4px;font-family:'Helvetica Neue',sans-serif;font-size:16px;font-weight:700;color:#1a2744;">${safeName}</p>
                    <p style="margin:0;font-size:14px;color:#555;">
                      <a href="mailto:${safeEmail}" style="color:#c9a84c;text-decoration:none;">${safeEmail}</a>
                      ${safePhone ? ` · <a href="tel:${safePhone}" style="color:#c9a84c;text-decoration:none;">${safePhone}</a>` : ''}
                    </p>
                    ${safeFaculty ? `<p style="margin:6px 0 0;font-size:13px;color:#777;">Faculty: ${safeFaculty}</p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin:0 0 6px;font-family:'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">Message</p>
              <div style="font-size:15px;color:#333;line-height:1.6;border-left:3px solid #c9a84c;padding:4px 16px;margin-bottom:24px;">
                ${safeMessage}
              </div>

              <!-- CTAs -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a2744;border-radius:8px;padding:0;">
                    <a href="mailto:${safeEmail}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Reply to student</a>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="border:1px solid #1a2744;border-radius:8px;padding:0;">
                    <a href="${inboxUrl}" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#1a2744;text-decoration:none;">Open inbox</a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#888;">
                <a href="${listingUrl}" style="color:#888;">View listing →</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f5f0;padding:20px 32px;border-top:1px solid #e5e5e0;">
              <p style="margin:0;font-size:12px;color:#999;">
                StudentX · Student housing directory for Thessaloniki, Greece<br/>
                You're receiving this because a student contacted you about your listing on StudentX.<br/>
                Just hit Reply to respond — your message will go straight to the student.
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

export function inquiryEmailSubject(studentName, listingSummary) {
  const trimmedName = (studentName || '').trim() || 'A student';
  if (listingSummary) {
    return `New inquiry from ${trimmedName} — ${listingSummary} · StudentX`;
  }
  return `New inquiry from ${trimmedName} · StudentX`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
