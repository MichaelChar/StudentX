import { describe, it, expect } from 'vitest';
import { transformListing } from '@/lib/transformListing';

const fullRow = {
  listing_id: '0100006',
  is_featured: true,
  title: 'Sunny studio near Medical School',
  description: 'Sunny studio',
  floor: 3,
  photos: ['a.jpg', 'b.jpg'],
  min_duration_months: 9,
  rent: { monthly_price: 450, currency: 'EUR', bills_included: true, deposit: 900 },
  location: { address: '12 Egnatias', neighborhood: 'Center', lat: 40.63, lng: 22.94 },
  property_types: { name: 'Studio' },
  landlords: { name: 'Alice', contact_info: 'a@example.com', verified_tier: 'gold', is_verified: true },
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
};

describe('transformListing', () => {
  it('flattens a fully-populated row to the API shape', () => {
    expect(transformListing(fullRow)).toEqual({
      listing_id: '0100006',
      is_featured: true,
      verified_tier: 'gold',
      is_verified: true,
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
      photos: ['a.jpg', 'b.jpg'],
      min_duration_months: 9,
      landlord: { name: 'Alice', contact_info: 'a@example.com' },
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

  it('defaults verified_tier to "none" when landlord row lacks it', () => {
    const row = { ...fullRow, landlords: { name: 'Bob', contact_info: null } };
    expect(transformListing(row).verified_tier).toBe('none');
  });

  it('defaults is_verified to false when landlord row lacks it', () => {
    const row = { ...fullRow, landlords: { name: 'Bob', contact_info: null } };
    expect(transformListing(row).is_verified).toBe(false);
  });

  it('returns empty arrays when amenities and faculty_distances are missing', () => {
    const row = { ...fullRow, listing_amenities: null, faculty_distances: null };
    const out = transformListing(row);
    expect(out.amenities).toEqual([]);
    expect(out.faculty_distances).toEqual([]);
  });

  it('treats is_featured as false when not set', () => {
    const row = { ...fullRow };
    delete row.is_featured;
    expect(transformListing(row).is_featured).toBe(false);
  });
});
