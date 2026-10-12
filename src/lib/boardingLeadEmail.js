import { getResend } from '@/lib/resend';
import { opsFromAddress } from '@/lib/emailFrom';
import { formatSchoolYear } from '@/lib/boardingPath';
import { CONTACT_EMAIL, MAP_SCHOOLS } from '@/components/boarding/config';

/*
  The email Michael gets for a /boarding lead. Ops mail: plain sender
  (opsFromAddress), plain text, English labels written here rather than in
  en.json — the reader is the operator, not a parent.

  Sent to CONTACT_EMAIL (michael@studentx.uk). When the parent chose email,
  Reply-To is their address, so replying in the inbox reaches them.

  A send failure is logged and swallowed: the row is already stored, and a
  parent must never see "that didn't send" for a problem on our side that a
  retry cannot fix.
*/

const METHOD_LABELS = {
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  imessage: 'iMessage',
  phone: 'Phone call',
  email: 'Email',
  wechat: 'WeChat',
};

const MODE_LABELS = { boarding: 'Boarding', day: 'Day', undecided: 'Still considering' };

const MONTHS = { '01': 'January', '09': 'September' };

export function startLabel(start) {
  if (start === 'asap') return 'As soon as possible';
  if (start === 'unsure') return 'Not sure yet';
  const [year, month] = start.split('-');
  return `${MONTHS[month]} ${year}`;
}

function ageLabel(age) {
  if (age === 13) return '13 or under';
  if (age === 18) return '18 or over';
  return String(age);
}

function schoolNames(keys) {
  const names = keys.map((k) => MAP_SCHOOLS.find((s) => s.key === k)).filter(Boolean)
    .map((s) => (s.mine ? 'My school' : s.short));
  return names.length ? names.join(', ') : '—';
}

function pathLine(entry) {
  if (entry.blocked) return 'Past the last entry point (DP 2, at 17) by their start date';
  return `Joins ${entry.entry.programme} in ${formatSchoolYear(entry.schoolYear)}, IB exams May ${entry.examYear}`;
}

export function buildSubmitEmail(lead, entry) {
  const method = METHOD_LABELS[lead.contactMethod];
  const lines = [
    `${lead.firstName} asked for a personalised presentation on /boarding.`,
    '',
    `Reach them on ${method}: ${lead.contactValue}`,
    '',
    `Start: ${startLabel(lead.start)}`,
    `Age today: ${ageLabel(lead.ageNow)}`,
    `Day or boarding: ${MODE_LABELS[lead.mode]}`,
    `Path: ${pathLine(entry)}`,
    `Asked about: ${schoolNames(lead.interest)}`,
    `Looked at on the map: ${schoolNames(lead.schoolsViewed)}`,
    `Source: ${lead.source}`,
    '',
    'About their child:',
    lead.about || '(left blank)',
    '',
    `Lead ${lead.id}`,
  ];
  return {
    subject: `Boarding lead: ${lead.firstName} via ${method}`,
    text: lines.join('\n'),
    replyTo: lead.contactMethod === 'email' ? lead.contactValue : undefined,
  };
}

// After the presentation request: the parent tapped "Ask me about" on
// another school.
export function buildInterestEmail(existing, addedKeys, id) {
  const method = METHOD_LABELS[existing.contact_method] ?? existing.contact_method;
  const names = schoolNames(addedKeys);
  return {
    subject: `Boarding lead: ${existing.first_name} also asked about ${names}`,
    text: [
      `${existing.first_name} also asked about ${names}, after sending their request.`,
      '',
      `Reach them on ${method}: ${existing.contact_value}`,
      '',
      `Lead ${id}`,
    ].join('\n'),
    replyTo: existing.contact_method === 'email' ? existing.contact_value : undefined,
  };
}

export async function sendLeadEmail({ subject, text, replyTo }) {
  try {
    await getResend().emails.send({
      from: opsFromAddress(),
      to: CONTACT_EMAIL,
      subject,
      text,
      replyTo,
    });
    return true;
  } catch (err) {
    console.error('Boarding lead: email failed (the lead is stored):', err);
    return false;
  }
}
