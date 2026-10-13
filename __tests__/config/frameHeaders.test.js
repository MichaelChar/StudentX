import { describe, it, expect } from 'vitest';

/*
  Only /boarding/quiz/embed may be framed by other sites (partners embed the
  lead form with public/boarding/embed.js). Every other route must keep
  X-Frame-Options: DENY and frame-ancestors 'none' — clickjacking protection
  for sign-in, landlord and booking pages depends on it.

  The site-wide rule SKIPS the embed path rather than being overridden by a
  later rule, because X-Frame-Options can only be replaced, never unset.
  The sources here are plain regex, so they are tested as RegExp.
*/

const config = (await import('../../next.config.mjs')).default;
const rules = await config.headers();

function headersFor(path) {
  const out = {};
  for (const rule of rules) {
    if (new RegExp(`^${rule.source}$`).test(path)) {
      for (const h of rule.headers) out[h.key] = h.value;
    }
  }
  return out;
}

describe('frame headers', () => {
  it('lets any site frame /boarding/quiz/embed', () => {
    const h = headersFor('/boarding/quiz/embed');
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['Content-Security-Policy']).toContain('frame-ancestors *');
    // The rest of the site-wide set is still there.
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBeDefined();
  });

  it.each(['/', '/boarding', '/boarding/quiz', '/boarding/partners', '/login', '/property/thessaloniki/results'])(
    'keeps %s unframeable',
    (path) => {
      const h = headersFor(path);
      expect(h['X-Frame-Options']).toBe('DENY');
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    },
  );

  it('lets the shareable quiz page open the Cal.com popup, like /boarding', () => {
    expect(headersFor('/boarding/quiz')['Content-Security-Policy']).toContain('https://app.cal.com');
    expect(headersFor('/boarding/quiz/embed')['Content-Security-Policy']).not.toContain('cal.com');
  });
});
