/**
 * Digest email sent when new listings match a saved search.
 * @param {object} params
 * @param {string} params.label - Optional label for the search
 * @param {object[]} params.listings - Array of matching listings (up to 10)
 * @param {string} params.manageUrl - Full URL to manage/unsubscribe page
 * @param {string} params.appUrl - Base URL of the app
 */
export function digestEmailHtml({ label, listings, manageUrl, appUrl }) {
  const count = listings.length;
  const title = label
    ? `${count} new listing${count !== 1 ? 's' : ''} match "${label}"`
    : `${count} new listing${count !== 1 ? 's' : ''} match your search`;

  const listingRows = listings.slice(0, 10).map((l) => {
    const photo = l.photos?.[0];
    const price = l.monthly_price ? `€${l.monthly_price}/mo` : '';
    const neighborhood = l.neighborhood || '';
    const type = l.property_type || '';
    const listingUrl = `${appUrl}/listing/${l.listing_id}`;

    return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e5e0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${photo ? `<td width="80" style="vertical-align:top;padding-right:16px;">
              <img src="${photo}" width="80" height="60" alt="" style="border-radius:6px;object-fit:cover;display:block;" />
            </td>` : ''}
            <td style="vertical-align:top;">
              <p style="margin:0 0 4px;font-family:'Helvetica Neue',sans-serif;font-size:16px;font-weight:700;color:#1a2744;">${price}</p>
              ${type ? `<p style="margin:0 0 2px;font-size:13px;color:#555;">${type}${neighborhood ? ' · ' + neighborhood : ''}</p>` : ''}
              <a href="${listingUrl}" style="display:inline-block;margin-top:8px;font-family:'Helvetica Neue',sans-serif;font-size:13px;font-weight:600;color:#c9a84c;text-decoration:none;">View listing →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
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
              <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#1a2744;">${title}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                Here are the latest listings that match your saved search:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${listingRows}
              </table>
              <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background:#1a2744;border-radius:8px;padding:0;">
                    <a href="${appUrl}/results" style="display:inline-block;padding:12px 28px;font-family:'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">View all results</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f5f0;padding:20px 32px;border-top:1px solid #e5e5e0;">
              <p style="margin:0;font-size:12px;color:#999;">
                StudentX · Student housing directory for Thessaloniki, Greece<br/>
                You're receiving this because you saved a search alert.<br/>
                <a href="${manageUrl}" style="color:#999;">Manage alerts</a> · <a href="${manageUrl}" style="color:#999;">Unsubscribe</a>
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

export function digestEmailSubject(label, count) {
  if (label) {
    return `${count} new listing${count !== 1 ? 's' : ''} match "${label}" — StudentX`;
  }
  return `${count} new listing${count !== 1 ? 's' : ''} match your search — StudentX`;
}
