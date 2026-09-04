import { describe, it, expect } from 'vitest';
import {
  activeTabKey,
  isChromelessMobileRoute,
  isTabActive,
  mobileTabsFor,
} from '@/lib/mobileTabs';

const keys = (tabs) => tabs.map((t) => t.key);

describe('mobileTabsFor — the founder-specified table', () => {
  it('gives a signed-out guest Explore and Log in only', () => {
    expect(keys(mobileTabsFor({ role: null }))).toEqual(['explore', 'login']);
  });

  /*
    Two tabs, not four, when signed out. Wishlists and Messages both need an
    account; a tab whose only outcome is a login wall is a worse introduction
    than not offering it.
  */
  it('does not offer signed-out users tabs that only lead to a login wall', () => {
    const tabs = keys(mobileTabsFor({ role: null }));
    expect(tabs).not.toContain('wishlists');
    expect(tabs).not.toContain('messages');
  });

  it('gives a signed-in student four tabs', () => {
    expect(keys(mobileTabsFor({ role: 'student' })))
      .toEqual(['explore', 'wishlists', 'messages', 'profile']);
  });

  it('gives a landlord the host nav plus Profile', () => {
    expect(keys(mobileTabsFor({ role: 'landlord' })))
      .toEqual(['today', 'listings', 'messages', 'profile']);
  });

  /*
    Feature 52 is skipped, so the landlord bar mirrors the desktop host nav
    exactly — Today / Listings / Messages — with no Calendar.
  */
  it('never offers a landlord a calendar tab', () => {
    expect(keys(mobileTabsFor({ role: 'landlord' }))).not.toContain('calendar');
  });

  /*
    Recorded consequence, kept on the founder's call (2026-09-04): a student's
    booking — including Feature 44's pending countdown — lives under Profile
    rather than earning a tab of its own.
  */
  it('has no Bookings tab, by decision', () => {
    expect(keys(mobileTabsFor({ role: 'student' }))).not.toContain('bookings');
  });

  it('marks only Messages as carrying the dot', () => {
    for (const role of ['student', 'landlord']) {
      const dotted = mobileTabsFor({ role }).filter((t) => t.dotted).map((t) => t.key);
      expect(dotted).toEqual(['messages']);
    }
  });

  it('returns label KEYS, never rendered copy', () => {
    for (const tab of mobileTabsFor({ role: 'student' })) {
      expect(typeof tab.labelKey).toBe('string');
      expect(tab).not.toHaveProperty('label');
    }
  });

  it('routes landlord tabs through the given city', () => {
    const tabs = mobileTabsFor({ role: 'landlord', city: 'athens' });
    expect(tabs.every((t) => t.href.startsWith('/property/athens/'))).toBe(true);
  });

  it('defaults the city rather than producing an undefined path', () => {
    expect(mobileTabsFor({ role: 'landlord' })[0].href).toContain('/thessaloniki/');
    expect(mobileTabsFor()[0].href).toContain('/thessaloniki/');
  });

  it('uses only icon names the Icon map defines', () => {
    const ALLOWED = new Set([
      'fine','home','search','filter','map','list','check','calendar','walk','star',
      'heart','book','compass','shield','cog','photo','message','share','chevronDown',
      'chevronRight','arrowRight','logout','plus','minus','x','euro','shieldCheck','grid',
    ]);
    for (const role of [null, 'student', 'landlord']) {
      for (const tab of mobileTabsFor({ role })) {
        expect(ALLOWED.has(tab.icon)).toBe(true);
      }
    }
  });
});

describe('isTabActive', () => {
  it('matches the tab root exactly', () => {
    expect(isTabActive('/student/inquiries', '/student/inquiries')).toBe(true);
  });

  /*
    Prefix matching, so a thread still lights Messages and a listing editor
    still lights Listings.
  */
  it('matches deeper paths beneath a tab', () => {
    expect(isTabActive('/student/inquiries/abc/chat', '/student/inquiries')).toBe(true);
    expect(isTabActive('/property/x/landlord/listings/0106001/edit', '/property/x/landlord/listings')).toBe(true);
  });

  /*
    The trailing slash matters: without it `/student/inquiriesX` would light
    Messages, and so would any sibling route that merely starts with the same
    characters.
  */
  it('does not match a sibling route that merely shares a prefix', () => {
    expect(isTabActive('/student/inquiriesXYZ', '/student/inquiries')).toBe(false);
  });

  it('is false for nothing', () => {
    expect(isTabActive(null, '/a')).toBe(false);
    expect(isTabActive('/a', null)).toBe(false);
  });
});

describe('activeTabKey', () => {
  const landlord = mobileTabsFor({ role: 'landlord', city: 'x' });

  it('picks the longest matching tab, not the first', () => {
    expect(activeTabKey(landlord, '/property/x/landlord/listings/0106001/edit')).toBe('listings');
  });

  it('lights Messages from inside a thread', () => {
    const student = mobileTabsFor({ role: 'student' });
    expect(activeTabKey(student, '/student/inquiries/abc/chat')).toBe('messages');
  });

  /*
    A listing page belongs to no tab. Explore must not light on it — that would
    claim the student is browsing results when they are reading one home.
  */
  it('returns null for a path that belongs to no tab', () => {
    const student = mobileTabsFor({ role: 'student', city: 'x' });
    expect(activeTabKey(student, '/property/x/listing/0106001')).toBeNull();
  });

  it('survives empty input', () => {
    expect(activeTabKey([], '/a')).toBeNull();
    expect(activeTabKey(null, '/a')).toBeNull();
  });
});

/*
  Two components consume this — Navbar (whether to render the bar) and
  MobileBarSpacer (whether to reserve its height). They must agree, so the
  boundary is worth pinning down rather than trusting the regex by eye.
*/
describe('isChromelessMobileRoute — where the mobile chrome comes off', () => {
  it('matches a listing detail page', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/listing/0106001')).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/listing/0106001/')).toBe(true);
  });

  it('matches any city segment, not just the one city that exists today', () => {
    expect(isChromelessMobileRoute('/property/athens/listing/abc')).toBe(true);
  });

  /*
    Results is the surface the back arrow returns TO. If it ever matched, a
    student would arrive somewhere with no navigation at all and no way out.
  */
  it('does not match results', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/results')).toBe(false);
  });

  it('does not match anything BELOW a listing page', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/listing/0106001/edit')).toBe(false);
  });

  it('does not match the listing collection with no id', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/listing')).toBe(false);
  });

  it('does not match a landlord listing page', () => {
    expect(isChromelessMobileRoute('/property/thessaloniki/landlord/listings')).toBe(false);
  });

  it('survives a null pathname', () => {
    expect(isChromelessMobileRoute(null)).toBe(false);
    expect(isChromelessMobileRoute(undefined)).toBe(false);
    expect(isChromelessMobileRoute('')).toBe(false);
  });
});
