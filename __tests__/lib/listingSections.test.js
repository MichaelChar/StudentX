import { describe, it, expect } from 'vitest';
import {
  LISTING_SECTIONS,
  SECTION_KEYS,
  firstIncompleteSection,
  sectionCompleteness,
  sectionProgress,
  sectionSummary,
} from '@/lib/listingSections';
import { MIN_PHOTOS } from '@/lib/listingWizardRules';

const photos = (n) => Array.from({ length: n }, (_, i) => `https://x/p${i}.jpg`);

const complete = () => ({
  photos: photos(MIN_PHOTOS),
  title: 'Sunny room',
  description: 'A room.',
  property_type: 'apartment',
  monthly_price: 500,
  address: 'Polygyrou 5',
  neighborhood: 'Center',
  lat: 40.64,
  lng: 22.94,
  university_distances: [
    { university_id: 'a', distance_meters: 900 },
    { university_id: 'b', distance_meters: 1200 },
  ],
  available_from: '2026-10-01',
  min_duration_months: 6,
  max_duration_months: 12,
});

describe('the section list itself', () => {
  it('has six sections and every one maps to a wizard step', () => {
    expect(LISTING_SECTIONS).toHaveLength(6);
    for (const s of LISTING_SECTIONS) {
      expect(typeof s.key).toBe('string');
      expect(typeof s.step).toBe('string');
    }
  });

  /*
    The order is the banner's routing order — firstIncompleteSection walks it.
    Photos leads because it is both the most-revisited section and the most
    common go-live blocker.
  */
  it('leads with photos', () => {
    expect(SECTION_KEYS[0]).toBe('photos');
  });

  it('keeps keys unique', () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length);
  });
});

describe('sectionCompleteness', () => {
  it('reports every section complete for a finished listing', () => {
    const done = sectionCompleteness(complete());
    expect(Object.values(done).every(Boolean)).toBe(true);
  });

  it('reports everything incomplete for an empty form', () => {
    const done = sectionCompleteness({});
    expect(Object.values(done).some(Boolean)).toBe(false);
  });

  /*
    Delegated to listingWizardRules rather than re-derived, so the editor and
    the wizard can never disagree about the same listing.
  */
  it('uses the shared photo minimum, not a local number', () => {
    expect(sectionCompleteness({ ...complete(), photos: photos(MIN_PHOTOS - 1) }).photos).toBe(false);
    expect(sectionCompleteness({ ...complete(), photos: photos(MIN_PHOTOS) }).photos).toBe(true);
  });

  /*
    Over the cap is NOT an incomplete section. A live listing was found
    carrying 23 photos against a limit of 20; labelling that "Needs details"
    tells the landlord to add more, which is the opposite of the problem.
    Exceeding the cap is a save-time error with its own message.
  */
  it('does not call a section incomplete for having too many photos', () => {
    const over = { ...complete(), photos: photos(23) };
    expect(sectionCompleteness(over).photos).toBe(true);
  });

  it('counts external photo URLs toward the minimum', () => {
    const form = { ...complete(), photos: photos(2), external_photo_urls: photos(MIN_PHOTOS - 2) };
    expect(sectionCompleteness(form).photos).toBe(true);
  });

  it('requires coordinates, not just an address string', () => {
    const noCoords = { ...complete(), lat: null, lng: null };
    expect(sectionCompleteness(noCoords).address).toBe(false);
  });

  /*
    Null Island (0,0) is a real failure mode for a geocoder that returns
    nothing — validateRequiredCoords rejects it and so must this.
  */
  it('rejects Null Island as an address', () => {
    expect(sectionCompleteness({ ...complete(), lat: 0, lng: 0 }).address).toBe(false);
  });

  it('requires a title AND a description AND a type', () => {
    expect(sectionCompleteness({ ...complete(), title: '   ' }).property).toBe(false);
    expect(sectionCompleteness({ ...complete(), description: '' }).property).toBe(false);
    expect(sectionCompleteness({ ...complete(), property_type: null }).property).toBe(false);
  });

  it('treats a zero or missing rent as incomplete', () => {
    expect(sectionCompleteness({ ...complete(), monthly_price: 0 }).price).toBe(false);
    expect(sectionCompleteness({ ...complete(), monthly_price: null }).price).toBe(false);
  });

  it('requires the mandatory university distances', () => {
    expect(sectionCompleteness({ ...complete(), university_distances: [] }).universities).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(() => sectionCompleteness(null)).not.toThrow();
    expect(sectionCompleteness(null).photos).toBe(false);
  });
});

describe('firstIncompleteSection — the banner target', () => {
  it('is null when nothing is outstanding', () => {
    expect(firstIncompleteSection(complete())).toBeNull();
  });

  /*
    Sending a landlord to the third missing thing when the first is also
    missing wastes the click. Display order IS routing order.
  */
  it('returns the earliest incomplete section, not any incomplete one', () => {
    const form = { ...complete(), photos: [], monthly_price: 0 };
    expect(firstIncompleteSection(form)).toBe('photos');
  });

  it('moves to the next one once the first is satisfied', () => {
    const form = { ...complete(), monthly_price: 0 };
    expect(firstIncompleteSection(form)).toBe('price');
  });

  it('points at photos for a brand-new empty listing', () => {
    expect(firstIncompleteSection({})).toBe('photos');
  });
});

describe('sectionProgress', () => {
  it('counts complete against total', () => {
    expect(sectionProgress(complete())).toEqual({ total: 6, complete: 6, incomplete: 0 });
    expect(sectionProgress({})).toEqual({ total: 6, complete: 0, incomplete: 6 });
  });
});

describe('sectionSummary', () => {
  it('returns a message key and params, never rendered copy', () => {
    const s = sectionSummary(complete(), 'photos');
    expect(s.key).toBe('summaryPhotos');
    expect(s.params).toEqual({ count: MIN_PHOTOS });
  });

  it('is null when a section has nothing set yet', () => {
    expect(sectionSummary({}, 'photos')).toBeNull();
    expect(sectionSummary({}, 'price')).toBeNull();
    expect(sectionSummary({}, 'address')).toBeNull();
  });

  it('echoes free text through a single shared key', () => {
    expect(sectionSummary({ title: 'Sunny room' }, 'property'))
      .toEqual({ key: 'summaryText', params: { text: 'Sunny room' } });
  });

  it('returns null for a key it does not know', () => {
    expect(sectionSummary(complete(), 'not-a-section')).toBeNull();
  });
});
