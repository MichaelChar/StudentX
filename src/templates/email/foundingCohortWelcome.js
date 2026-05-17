/**
 * Welcome email for the founding-50 cohort (ranks 6–50). Promises the
 * Founding Member badge, conditional on subscribing to SuperLandlord and
 * passing identity verification. No discount — that's the founding-five
 * differentiator.
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {number} params.foundingRank - 6..50
 * @param {string} params.subscribeUrl - Link to onboarding/subscribe
 */
export function foundingCohortWelcomeHtml({
  landlordName,
  foundingRank,
  subscribeUrl,
}) {
  const greeting = landlordName ? `Hi ${landlordName},` : 'Hi there,';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're founding member #${foundingRank} of 50</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#f6f4ff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <tr>
            <td style="background:#0a2540;padding:24px 32px;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffcb57;">Founding 50</p>
              <p style="margin:4px 0 0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#ffffffB3;">Student Housing · Thessaloniki</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;">You're founding member #${foundingRank} of 50</h1>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                Welcome to the StudentX founding cohort! You're one of our first fifty landlords. As such, we'd like to thank you with an exclusive Founding Member Badge. This is visible to every student who browses StudentX, and will increase your housing success!
              </p>
              <p style="margin:0 0 24px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                <strong>How to unlock the Founding Member badge:</strong> Activate a SuperLandlord subscription and complete identity verification. While both are active, your listings will display the Founding Member badge.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#635BFF;border-radius:8px;padding:0;">
                    <a href="${subscribeUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;">Activate SuperLandlord</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#7a8595;">
                StudentX · Official housing partner for AUSoM and other world-class universities
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

export function foundingCohortWelcomeSubject(foundingRank) {
  return `Welcome to the founding cohort — you're member #${foundingRank}`;
}
