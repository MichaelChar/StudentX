import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

/*
  Evaluates the rules the way Googlebot does (RFC 9309 + Google's docs): the
  longest matching pattern wins, and Allow wins a tie. `*` matches any run of
  characters, a trailing `$` anchors the end of the URL (query included), and
  everything else, `?` too, is literal. Asserting on URLs rather than on the
  rule strings is the point: the rules are only right if they admit and refuse
  the right URLs.
*/
function patternToRegExp(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

function isAllowed(url) {
  const [rule] = robots().rules;
  // Next accepts a string or an array for each.
  const candidates = [
    ...[].concat(rule.allow ?? []).map((p) => ({ p, allow: true })),
    ...[].concat(rule.disallow ?? []).map((p) => ({ p, allow: false })),
  ].filter(({ p }) => patternToRegExp(p).test(url));
  if (candidates.length === 0) return true;
  candidates.sort((a, b) => b.p.length - a.p.length || Number(b.allow) - Number(a.allow));
  return candidates[0].allow;
}

describe('robots()', () => {
  it('has one rule group for every crawler, and points at the sitemap', () => {
    const r = robots();
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].userAgent).toBe('*');
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it.each([
    '/',
    '/property/thessaloniki',
    '/property/thessaloniki/results?faculty=auth-medicine',
    '/property/thessaloniki/listing/0106002',
    '/property/thessaloniki/landlords/abc',
    '/gigs/results?pay=paid',
    '/resources',
    '/student/ausom',
    '/login',
  ])('lets crawlers reach the public page %s', (url) => {
    expect(isAllowed(url)).toBe(true);
  });

  // The endpoints pages fetch() while rendering. Googlebot's renderer obeys
  // robots.txt for these too, so blocking them blanks the section for Google.
  it.each([
    '/api/listings?page=1', // HomeListings on the housing landing
    '/api/listings',
    '/api/gigs?pay=paid&page=1', // the gigs board
    '/api/gigs',
    '/api/gigs/countries',
    '/api/gigs/prices?pay=paid',
  ])('lets the renderer fetch the public read endpoint %s', (url) => {
    expect(isAllowed(url)).toBe(true);
  });

  it.each([
    '/property/thessaloniki/landlord/login',
    '/property/thessaloniki/landlord/login?next=%2Fproperty%2Fthessaloniki',
    '/property/thessaloniki/landlord/signup',
  ])('lets Google follow the legacy redirect at %s', (url) => {
    expect(isAllowed(url)).toBe(true);
  });

  it.each([
    // Under an allowed collection, but not a page's render-time read. The view
    // beacon in particular must stay blocked, or Googlebot's renders count as
    // listing views.
    '/api/listings/0106002/view',
    '/api/listings/report',
    '/api/listings/count-filtered?faculty=x',
    '/api/listingsfoo',
    '/api/gigs/inquiries',
    // Session, account and system endpoints.
    '/api/auth/me',
    '/api/me/unread',
    '/api/me/favorites',
    '/api/landlord/listings',
    '/api/cron/tick',
    '/api/boarding/lead',
  ])('keeps %s blocked', (url) => {
    expect(isAllowed(url)).toBe(false);
  });

  it.each([
    '/property/thessaloniki/landlord/dashboard',
    '/property/thessaloniki/landlord/listings/new',
    '/property/thessaloniki/landlord/inquiries/123/chat',
    '/property/thessaloniki/landlord/login-help',
  ])('keeps the landlord dashboard page %s blocked', (url) => {
    expect(isAllowed(url)).toBe(false);
  });
});
