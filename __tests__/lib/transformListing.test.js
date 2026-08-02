import { describe, it, expect } from 'vitest';
import { transformListing, listingCompleteness } from '@/lib/transformListing';

const fullRow = {
  listing_id: '0100006',
  title: 'Sunny studio near Medical School',
  description: 'Sunny studio',
  floor: 3,
  sqm: 45,
  photos: ['a.jpg', 'b.jpg'],
  min_duration_months: 9,
  rent: { monthly_price: 450, currency: 'EUR', bills_included: true, deposit: 900 },
  location: { address: '12 Egnatias', neighborhood: 'Center', lat: 40.63, lng: 22.94 },
  property_types: { name: 'Studio' },
  landlords: {
    name: 'Alice',
    contact_info: 'a@example.com',
    is_verified: true,
    profile_photo_url: 'https://cdn.example/landlord-photos/uid/alice.webp',
    avg_response_ms: 3_600_000,
  },
  listing_amenities: [
    { amenities: { name: 'wifi' } },
    { amenities: { name: 'heating' } },
  ],
  faculty_distances: [
    {
      faculty_id: 'auth-cs',
      walk_minutes: 8,
      transit_minutes: 5,
      faculties: { name: 'CS', university: 'AUTH' },
    },
  ],
  // Deliberately out of order — transformListing sorts nearest-first.
  listing_university_distances: [
    {
      university_id: 'uom',
      distance_meters: 1900,
      universities: { name: 'University of Macedonia', short_name: 'UoM' },
    },
    {
      university_id: 'auth',
      distance_meters: 750,
      universities: { name: 'Aristotle University of Thessaloniki', short_name: 'AUTH' },
    },
  ],
};

describe('transformListing', () => {
  it('flattens a fully-populated row to the API shape', () => {
    expect(transformListing(fullRow)).toEqual({
      listing_id: '0100006',
      is_verified: true,
      property_verified: false,
      property_verification: null,
      avg_response_ms: 3_600_000,
      response_stats_at: null,
      title: 'Sunny studio near Medical School',
      address: '12 Egnatias',
      neighborhood: 'Center',
      lat: 40.63,
      lng: 22.94,
      monthly_price: 450,
      currency: 'EUR',
      bills_included: true,
      deposit: 900,
      property_type: 'Studio',
      amenities: ['wifi', 'heating'],
      description: 'Sunny studio',
      floor: 3,
      sqm: 45,
      bedrooms: null,
      bathrooms: null,
      agency_fee: null,
      available_from: null,
      available_to: null,
      max_duration_months: null,
      smoking_allowed: null,
      pets_allowed: null,
      additional_rules: null,
      photos: ['a.jpg', 'b.jpg'],
      min_duration_months: 9,
      landlord: {
        name: 'Alice',
        profile_photo_url: 'https://cdn.example/landlord-photos/uid/alice.webp',
      },
      university_distances: [
        {
          university_id: 'auth',
          short_name: 'AUTH',
          name: 'Aristotle University of Thessaloniki',
          distance_meters: 750,
        },
        {
          university_id: 'uom',
          short_name: 'UoM',
          name: 'University of Macedonia',
          distance_meters: 1900,
        },
      ],
      faculty_distances: [
        {
          faculty_id: 'auth-cs',
          faculty_name: 'CS',
          university: 'AUTH',
          walk_minutes: 8,
          transit_minutes: 5,
        },
      ],
    });
  });

  it('sorts university distances nearest-first', () => {
    const out = transformListing(fullRow);
    expect(out.university_distances.map((u) => u.university_id)).toEqual(['auth', 'uom']);
  });

  it('returns an empty array when the listing has no university distances', () => {
    // The common case at launch: the field is optional and nothing backfills it.
    const row = { ...fullRow, listing_university_distances: null };
    expect(transformListing(row).university_distances).toEqual([]);
  });

  it('never exposes landlord contact_info, even when present on the row', () => {
    // Regression guard for security audit #1: contact_info is owner-only PII
    // and must never leak into the public listing API / SSR shape.
    const out = transformListing(fullRow);
    expect(out.landlord).toEqual({
      name: 'Alice',
      profile_photo_url: 'https://cdn.example/landlord-photos/uid/alice.webp',
    });
    expect(out.landlord).not.toHaveProperty('contact_info');
  });

  it('defaults title to null when the row lacks one', () => {
    const row = { ...fullRow };
    delete row.title;
    expect(transformListing(row).title).toBeNull();
  });

  it('falls back to defaults when the rent join is missing', () => {
    const row = { ...fullRow, rent: null };
    const out = transformListing(row);
    expect(out.monthly_price).toBeNull();
    expect(out.currency).toBe('EUR');
    expect(out.bills_included).toBe(false);
    expect(out.deposit).toBe(0);
  });

  it('falls back to nulls when the location join is missing', () => {
    const row = { ...fullRow, location: null };
    const out = transformListing(row);
    expect(out.address).toBeNull();
    expect(out.neighborhood).toBeNull();
    expect(out.lat).toBeNull();
    expect(out.lng).toBeNull();
  });

  it('defaults is_verified to false when landlord row lacks it', () => {
    const row = { ...fullRow, landlords: { name: 'Bob', contact_info: null } };
    expect(transformListing(row).is_verified).toBe(false);
  });

  it('is property-verified only when a property_verifications row has verified_at set', () => {
    const pendingOnly = {
      ...fullRow,
      property_verifications: [
        {
          verification_id: 'v1',
          method: 'video_call',
          verified_at: null,
          checklist_json: {},
        },
      ],
    };
    expect(transformListing(pendingOnly).property_verified).toBe(false);
    expect(transformListing(pendingOnly).property_verification).toBeNull();

    const rejectedOnly = {
      ...fullRow,
      property_verifications: [
        {
          verification_id: 'v2',
          method: 'video_call',
          verified_at: null,
          status: 'rejected',
          checklist_json: {},
        },
      ],
    };
    expect(transformListing(rejectedOnly).property_verified).toBe(false);

    const completed = {
      ...fullRow,
      property_verifications: [
        {
          verification_id: 'v3',
          method: 'video_call',
          verified_at: '2026-08-12T10:00:00.000Z',
        },
      ],
    };
    const out = transformListing(completed);
    expect(out.property_verified).toBe(true);
    expect(out.property_verification).toEqual({
      verification_id: 'v3',
      method: 'video_call',
      verified_at: '2026-08-12T10:00:00.000Z',
    });
    // Landlord ID check remains independent of property verification.
    expect(out.is_verified).toBe(true);
  });

  it('returns empty arrays when amenities and faculty_distances are missing', () => {
    const row = { ...fullRow, listing_amenities: null, faculty_distances: null };
    const out = transformListing(row);
    expect(out.amenities).toEqual([]);
    expect(out.faculty_distances).toEqual([]);
  });

  it('does not expose paid-tier fields', () => {
    const out = transformListing(fullRow);
    expect(out).not.toHaveProperty('is_featured');
    expect(out).not.toHaveProperty('verified_tier');
    expect(out).not.toHaveProperty('is_superlandlord');
  });
});

describe('listingCompleteness', () => {
  it('counts populated optional fields', () => {
    const full = transformListing(fullRow);
    expect(listingCompleteness(full)).toBe(5);
  });

  it('counts zero for an empty listing', () => {
    expect(
      listingCompleteness({
        photos: [],
        description: null,
        amenities: [],
        sqm: null,
        floor: null,
      }),
    ).toBe(0);
  });
});
