/**
 * Confirmation email sent when a student saves a search alert.
 * @param {object} params
 * @param {string} params.label - Optional label for the search
 * @param {string} params.manageUrl - Full URL to manage/unsubscribe page
 * @param {string} params.frequency - 'daily' | 'weekly'
 */
export function confirmationEmailHtml({ label, manageUrl, frequency }) {
  const title = label ? `Your alert "${label}" is set up` : 'Your search alert is set up';
  const freqLabel = frequency === 'weekly' ? 'weekly' : 'daily';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#f6f4ff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <!-- Header -->
          <tr>
            <td style="background:#0a2540;padding:24px 32px;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffcb57;">StudentX</p>
              <p style="margin:4px 0 0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#ffffffB3;">Student Housing · Thessaloniki</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;">${title}</h1>
              <p style="margin:0 0 24px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                You will receive a ${freqLabel} digest whenever new listings match your saved filters.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#635BFF;border-radius:8px;padding:0;">
                    <a href="${manageUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Manage my alert</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#7a8595;line-height:1.5;">
                To unsubscribe at any time, visit your alert management page using the link above.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#ffffff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#7a8595;">
                StudentX · Student housing directory for Thessaloniki, Greece<br/>
                <a href="${manageUrl}" style="color:#7a8595;">Unsubscribe</a>
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

export function confirmationEmailSubject(label) {
  return label ? `Your "${label}" alert is active — StudentX` : 'Your search alert is active — StudentX';
}
