/**
 * Welcome email sent when a landlord activates SuperLandlord or
 * SuperLandlord Heavy. Reminds them that the public SuperLandlord badge
 * also requires submitting an ID for admin review.
 *
 * @param {object} params
 * @param {string} params.landlordName - Used in the greeting
 * @param {string} params.tierName - "SuperLandlord" or "SuperLandlord Heavy"
 * @param {string} params.verificationUrl - Full URL to /landlord/verification
 */
export function subscriptionWelcomeHtml({ landlordName, tierName, verificationUrl }) {
  const greeting = landlordName ? `Hi ${landlordName},` : 'Hi there,';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to the SuperLandlord family</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#f6f4ff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <tr>
            <td style="background:#0a2540;padding:24px 32px;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffcb57;">StudentX</p>
              <p style="margin:4px 0 0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#ffffffB3;">Student Housing · Thessaloniki</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;">Welcome to the SuperLandlord family</h1>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                Your ${tierName} subscription is active. Together with StudentX, you'll reach right students for your properties.
              </p>
              <p style="margin:0 0 24px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                <strong>One last step:</strong> To display the SuperLandlord badge on your listings, upload a government-issued ID for review. Our team will verify shortly.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#635BFF;border-radius:8px;padding:0;">
                    <a href="${verificationUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Upload ID</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#7a8595;line-height:1.5;">
                Your document is stored securely and never shown publicly — it is used only for verification.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#7a8595;">
                StudentX · Official housing partner for AUSoM and other amazing universities
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

export function subscriptionWelcomeSubject(tierName) {
  return `Your ${tierName} subscription is active — next step: verify your ID`;
}
