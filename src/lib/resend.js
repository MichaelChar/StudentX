import { Resend } from 'resend';

let _resend;

export function getResend() {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}
