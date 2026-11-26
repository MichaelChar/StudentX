import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_CITY } from '@/lib/cityRoutes';
import {
  SHOWCASE_LIVE,
  PLATFORM_EMAILS_PARKED,
  PARKED_PREFIXES,
  LISTING_TO_PROPERTY,
  isParkedPath,
  parkedRedirectTarget,
  platformEmailParked,
  showcaseMarker,
  showcasePageProps,
} from '@/lib/showcase';

// The platform is parked behind SHOWCASE_LIVE (src/lib/showcase.js). The
// middleware can't be imported under Vitest (next-intl's ESM build, see
// cityPicker.test.js), so it delegates every parking decision to
// parkedRedirectTarget(), and that is what is pinned here, in both states of
// the flag.
const HOUSING = `/property/${DEFAULT_CITY}`;
const live = (p) => parkedRedirectTarget(p, { live: true, boardingHome: HOUSING });
const notLive = (p) => parkedRedirectTarget(p, { live: false, boardingHome: HOUSING });

const SHOWCASE_PAGES = [
  '/',
  '/about-us',
  '/press',
  '/ventures',
  '/mg2',
  '/map',
  '/featured-properties',
  '/featured-properties/101',
];

const PARKED_SAMPLES = [
  '/property',
  `/property/${DEFAULT_CITY}`,
  `/property/${DEFAULT_CITY}/results`,
  `/property/${DEFAULT_CITY}/listing/9999999`,
  `/property/${DEFAULT_CITY}/landlord/dashboard`,
  '/student/ausom',
  '/student/flashcards/x',
  '/student/account',
  '/login',
  '/signup',
  '/resources',
  '/gigs',
  '/gigs/42',
  '/admin',
  '/admin/practice-reports',
  '/claim/abc123',
  '/admissions',
  '/admissions/terms',
  '/boarding',
  '/boarding/quiz/embed',
];

describe('SHOWCASE_LIVE', () => {
  // On since the go-live PR: the showcase is the public site and the platform
  // is parked. Turning it off is a decision (see the header of showcase.js),
  // not a cleanup, so it has to change this test too.
  it('is live, and the email gate follows it', () => {
    expect(SHOWCASE_LIVE).toBe(true);
    expect(PLATFORM_EMAILS_PARKED).toBe(SHOWCASE_LIVE);
  });

  it('parks exactly the agreed products', () => {
    expect([...PARKED_PREFIXES].sort()).toEqual(
      ['admin', 'admissions', 'boarding', 'claim', 'gigs', 'login', 'property', 'resources', 'signup', 'student'],
    );
  });
});

describe('isParkedPath', () => {
  it('matches every parked product and everything under it', () => {
    for (const p of PARKED_SAMPLES) expect(isParkedPath(p), p).toBe(true);
    expect(isParkedPath('/gigs/'), '/gigs/').toBe(true);
  });

  it('does not match the showcase or lookalikes', () => {
    for (const p of [...SHOWCASE_PAGES, '/gigsx', '/propertyx', '/students', '/about', '/api/gigs', '']) {
      expect(isParkedPath(p), p).toBe(false);
    }
  });
});

describe('parkedRedirectTarget, showcase not live', () => {
  it('is boarding parking exactly as before', () => {
    expect(notLive('/')).toBe(HOUSING);
    expect(notLive('/boarding')).toBe(HOUSING);
    expect(notLive('/boarding/partners')).toBe(HOUSING);
  });

  it('leaves the platform and the unbuilt showcase URLs alone', () => {
    for (const p of PARKED_SAMPLES.filter((x) => !x.startsWith('/boarding'))) expect(notLive(p), p).toBeNull();
    expect(notLive('/about')).toBeNull();
    expect(notLive('/about-us')).toBeNull();
  });

  it('redirects nothing once boarding is back too', () => {
    expect(parkedRedirectTarget('/', { live: false, boardingHome: null })).toBeNull();
    expect(parkedRedirectTarget('/boarding', { live: false, boardingHome: null })).toBeNull();
  });
});

describe('parkedRedirectTarget, showcase live', () => {
  it('serves the showcase pages, `/` included', () => {
    for (const p of SHOWCASE_PAGES) expect(live(p), p).toBeNull();
  });

  it('sends every parked path to `/`', () => {
    for (const p of PARKED_SAMPLES) expect(live(p), p).toBe('/');
  });

  it('moves /about to /about-us', () => {
    expect(live('/about')).toBe('/about-us');
    expect(live('/about/')).toBe('/about-us');
  });

  it('sends the three live flats to their property pages', () => {
    for (const [id, num] of Object.entries(LISTING_TO_PROPERTY)) {
      expect(live(`/property/${DEFAULT_CITY}/listing/${id}`)).toBe(`/featured-properties/${num}`);
      expect(live(`/property/${DEFAULT_CITY}/listing/${id}/`)).toBe(`/featured-properties/${num}`);
    }
    expect(live(`/property/${DEFAULT_CITY}/listing/0106001/photos`)).toBe('/');
  });
});

// Follow each redirect to where it lands. A loop (or a chain that keeps going)
// is the failure that would take the site down, and the one the flip PR is
// most likely to introduce.
describe('no redirect loops', () => {
  const all = [...SHOWCASE_PAGES, ...PARKED_SAMPLES, '/about', `/property/${DEFAULT_CITY}/listing/0106002`];
  for (const [label, decide] of [['live', live], ['not live', notLive]]) {
    it(`every path lands within one hop (${label})`, () => {
      for (const start of all) {
        const first = decide(start);
        if (first === null) continue;
        expect(first, start).not.toBe(start);
        expect(decide(first), `${start} -> ${first}`).toBeNull();
      }
    });
  }
});

describe('showcase page marker', () => {
  it('is an attribute, not copy', () => {
    expect(showcaseMarker('home')).toBe('data-showcase-page="home"');
    expect(showcasePageProps('property-101')).toEqual({ 'data-showcase-page': 'property-101' });
  });
});

describe('platformEmailParked', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets mail through while the platform is up', () => {
    expect(platformEmailParked('booking-accepted', false)).toBe(false);
  });

  it('skips and logs while parked', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(platformEmailParked('booking-accepted', true)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('kind=booking-accepted outcome=skipped'));
  });
});

// Every user-facing sender must check the gate before it does anything, or a
// landlord gets a link into a parked page. Ops mail is exempt: it goes to
// Michael, who wants it either way. A new sender fails here until it is gated
// or deliberately listed as ops.
describe('every user-facing email sender is gated', () => {
  const OPS = new Set(['sendMoveInProblemOpsEmail', 'sendLeadEmail']);
  const libDir = join(process.cwd(), 'src/lib');
  const files = readdirSync(libDir).filter((f) => /Email\.js$/.test(f));

  it('finds the senders', () => {
    expect(files).toEqual(expect.arrayContaining(['bookingEmail.js', 'inquiryEmail.js', 'gigInquiryEmail.js']));
  });

  for (const file of files) {
    const source = readFileSync(join(libDir, file), 'utf8');
    const senders = [...source.matchAll(/export async function (send\w+)\(/g)];
    for (const m of senders) {
      const name = m[1];
      if (OPS.has(name)) continue;
      it(`${file} ${name}`, () => {
        const next = source.indexOf('\nexport ', m.index + 1);
        const body = source.slice(m.index, next === -1 ? undefined : next);
        expect(body).toMatch(/if \(platformEmailParked\('[\w-]+'\)\) return;/);
      });
    }
  }

  for (const job of ['landlordMessageDigest.js', 'studentMessageDigest.js']) {
    it(`cron job ${job}`, () => {
      const source = readFileSync(join(process.cwd(), 'src/app/api/cron/jobs', job), 'utf8');
      expect(source).toContain("platformEmailParked('");
    });
  }
});
