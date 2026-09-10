import { describe, it, expect } from 'vitest';
import {
  defaultThreadId,
  filterThreads,
  isUnread,
  threadPhoto,
  unreadCount,
  threadListings,
} from '@/lib/messageThreads';

const t = (over = {}) => ({
  inquiry_id: 'i1',
  student_name: 'Morne Grundlingh',
  message: 'Is the room still free?',
  status: 'pending',
  created_at: '2026-06-02T10:00:00Z',
  listings: { listing_id: '0106001', photos: ['https://x/a.jpg'], location: { address: 'Polygyrou 5' } },
  ...over,
});

describe('isUnread', () => {
  /*
    One definition across three surfaces: the Messages nav dot
    (hostNavSummary), the Today reply queue (hostToday) and this list all key
    on status === 'pending'. Diverge here and the dot contradicts the list.
  */
  it('is exactly the pending status the nav dot uses', () => {
    expect(isUnread({ status: 'pending' })).toBe(true);
    expect(isUnread({ status: 'replied' })).toBe(false);
    expect(isUnread({ status: 'closed' })).toBe(false);
    expect(isUnread(null)).toBe(false);
  });
});

describe('filterThreads', () => {
  it('returns everything by default', () => {
    const rows = [t(), t({ inquiry_id: 'i2', status: 'replied' })];
    expect(filterThreads(rows)).toHaveLength(2);
  });

  it('narrows to unread', () => {
    const rows = [t(), t({ inquiry_id: 'i2', status: 'replied' })];
    expect(filterThreads(rows, { filter: 'unread' }).map((r) => r.inquiry_id)).toEqual(['i1']);
  });

  it('searches the student name', () => {
    const rows = [t(), t({ inquiry_id: 'i2', student_name: 'Jixuan He' })];
    expect(filterThreads(rows, { query: 'jixuan' }).map((r) => r.inquiry_id)).toEqual(['i2']);
  });

  /*
    A landlord remembers a thread by any of three things — who wrote, which
    property, or what they said. Searching only names would miss "the one about
    Ano Poli".
  */
  it('searches the listing address and the message body too', () => {
    const rows = [t(), t({ inquiry_id: 'i2', listings: { location: { address: 'Ano Poli 4' } } })];
    expect(filterThreads(rows, { query: 'ano poli' }).map((r) => r.inquiry_id)).toEqual(['i2']);
    expect(filterThreads(rows, { query: 'still free' }).map((r) => r.inquiry_id)).toEqual(['i1', 'i2']);
  });

  it('combines the filter and the query', () => {
    const rows = [t(), t({ inquiry_id: 'i2', student_name: 'Jixuan He', status: 'replied' })];
    expect(filterThreads(rows, { filter: 'unread', query: 'jixuan' })).toEqual([]);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(filterThreads([t()], { query: '  MORNE  ' })).toHaveLength(1);
  });

  it('survives rows missing every searchable field', () => {
    const bare = { inquiry_id: 'x', status: 'pending' };
    expect(() => filterThreads([bare], { query: 'anything' })).not.toThrow();
    expect(filterThreads([bare], { query: 'anything' })).toEqual([]);
  });

  it('survives nothing at all', () => {
    expect(filterThreads(null)).toEqual([]);
    expect(filterThreads(undefined, { filter: 'unread' })).toEqual([]);
  });
});

describe('unreadCount', () => {
  it('counts only pending threads', () => {
    expect(unreadCount([t(), t({ inquiry_id: 'i2', status: 'replied' }), t({ inquiry_id: 'i3' })])).toBe(2);
    expect(unreadCount([])).toBe(0);
    expect(unreadCount(null)).toBe(0);
  });
});

describe('defaultThreadId', () => {
  /*
    The longest-waiting student is the one whose booking is actually at risk —
    students shotgun parallel requests and the losers auto-cancel. Opening
    Messages should land a landlord in front of them, not on whatever arrived
    most recently.
  */
  it('opens the OLDEST unanswered thread, not the newest', () => {
    const rows = [
      t({ inquiry_id: 'new', created_at: '2026-09-01T00:00:00Z' }),
      t({ inquiry_id: 'old', created_at: '2026-05-01T00:00:00Z' }),
      t({ inquiry_id: 'mid', created_at: '2026-07-01T00:00:00Z' }),
    ];
    expect(defaultThreadId(rows)).toBe('old');
  });

  it('ignores answered threads when picking', () => {
    const rows = [
      t({ inquiry_id: 'answered-old', created_at: '2026-01-01T00:00:00Z', status: 'replied' }),
      t({ inquiry_id: 'waiting', created_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(defaultThreadId(rows)).toBe('waiting');
  });

  it('falls back to the first thread when everything is answered', () => {
    const rows = [t({ inquiry_id: 'a', status: 'replied' }), t({ inquiry_id: 'b', status: 'closed' })];
    expect(defaultThreadId(rows)).toBe('a');
  });

  it('is null when there are no threads', () => {
    expect(defaultThreadId([])).toBeNull();
    expect(defaultThreadId(null)).toBeNull();
  });
});

describe('threadPhoto', () => {
  it('returns the first usable http photo', () => {
    expect(threadPhoto(t())).toBe('https://x/a.jpg');
  });

  /*
    Same guard as every other photo call site: a stored value may be a relative
    path or junk, and next/image rejects those outright rather than degrading.
  */
  it('skips non-http values rather than handing them to next/image', () => {
    const bad = t({ listings: { photos: ['/relative.jpg', 'data:image/png;base64,x', 'https://ok/b.jpg'] } });
    expect(threadPhoto(bad)).toBe('https://ok/b.jpg');
  });

  it('is null when there are no photos at all', () => {
    expect(threadPhoto(t({ listings: { photos: [] } }))).toBeNull();
    expect(threadPhoto(t({ listings: {} }))).toBeNull();
    expect(threadPhoto(null)).toBeNull();
  });
});

/*
  Issue #206 — inbox filters.

  Note the issue asks for an "Unread" chip AND a New/Replied/Closed status
  filter. Those are the same predicate (isUnread is `status === 'pending'`,
  which the row pill labels "New"), so they are ONE ladder here rather than
  two controls disagreeing about what to call one set.
*/
describe('filterThreads — status ladder (#206)', () => {
  const rows = [
    { inquiry_id: 'a', status: 'pending', listing_id: '0106001' },
    { inquiry_id: 'b', status: 'replied', listing_id: '0106002' },
    { inquiry_id: 'c', status: 'closed', listing_id: '0106001' },
    { inquiry_id: 'd', status: 'archived', listing_id: '0106002' },
  ];
  const ids = (r) => r.map((x) => x.inquiry_id);

  it('all returns everything', () => {
    expect(ids(filterThreads(rows, { filter: 'all' }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('unread selects only pending', () => {
    expect(ids(filterThreads(rows, { filter: 'unread' }))).toEqual(['a']);
  });

  it('replied selects only replied', () => {
    expect(ids(filterThreads(rows, { filter: 'replied' }))).toEqual(['b']);
  });

  it('closed catches every non-pending, non-replied status', () => {
    // 'archived' is not a status anyone has seen, but it must land somewhere
    // rather than vanish — mirroring inquiryStatusVariant's fall-through.
    expect(ids(filterThreads(rows, { filter: 'closed' }))).toEqual(['c', 'd']);
  });
});

describe('filterThreads — by listing (#206)', () => {
  const rows = [
    { inquiry_id: 'a', status: 'pending', listing_id: '0106001' },
    { inquiry_id: 'b', status: 'replied', listing_id: '0106002' },
  ];

  it('narrows to one listing', () => {
    const out = filterThreads(rows, { listingId: '0106001' });
    expect(out.map((r) => r.inquiry_id)).toEqual(['a']);
  });

  it('compares ids as strings so zero-padding survives', () => {
    // '0106001' must not be coerced to 106001 and matched loosely.
    expect(filterThreads(rows, { listingId: 106001 })).toEqual([]);
  });

  it('combines with the status ladder', () => {
    expect(filterThreads(rows, { filter: 'replied', listingId: '0106001' })).toEqual([]);
    expect(
      filterThreads(rows, { filter: 'pending' in {} ? 'x' : 'unread', listingId: '0106001' }),
    ).toHaveLength(1);
  });

  it('an empty listingId means no listing filter', () => {
    expect(filterThreads(rows, { listingId: '' })).toHaveLength(2);
  });
});

describe('threadListings (#206)', () => {
  it('dedupes, labels by address, and sorts by label', () => {
    const out = threadListings([
      { listing_id: '0106002', listings: { location: { address: 'Zeta 2' } } },
      { listing_id: '0106001', listings: { location: { address: 'Alpha 1' } } },
      { listing_id: '0106002', listings: { location: { address: 'Zeta 2' } } },
    ]);
    expect(out).toEqual([
      { listing_id: '0106001', label: 'Alpha 1' },
      { listing_id: '0106002', label: 'Zeta 2' },
    ]);
  });

  it('falls back to title, then to the id', () => {
    const out = threadListings([
      { listing_id: '0106003', listings: { title: 'Studio in Ano Poli' } },
      { listing_id: '0106004' },
    ]);
    // Sorted by LABEL, so the id-fallback row sorts first — digits before
    // letters. Asserting the order rather than just membership keeps the
    // "stable between renders" promise honest.
    expect(out).toEqual([
      { listing_id: '0106004', label: '0106004' },
      { listing_id: '0106003', label: 'Studio in Ano Poli' },
    ]);
  });

  it('only offers listings that actually have threads', () => {
    // The filter must not list a property with no conversations — every such
    // choice would return an empty list and read as a broken filter.
    expect(threadListings([])).toEqual([]);
  });

  it('tolerates junk rows', () => {
    expect(threadListings([null, {}, { listing_id: null }])).toEqual([]);
  });
});
