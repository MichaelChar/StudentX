import { describe, it, expect } from 'vitest';
import {
  parseListingPaste,
  parseEuropeanNumber,
  applyPasteSuggestions,
  PASTE_MAX_LENGTH,
} from '@/lib/pasteImport';

/** Seed-shaped amenity catalog (matches supabase/seed.sql names). */
const AMENITIES = [
  { amenity_id: 1, name: 'AC' },
  { amenity_id: 2, name: 'Furnished' },
  { amenity_id: 3, name: 'Balcony' },
  { amenity_id: 4, name: 'Elevator' },
  { amenity_id: 5, name: 'Parking' },
  { amenity_id: 6, name: 'Ground floor' },
  { amenity_id: 7, name: 'Washing machine' },
  { amenity_id: 8, name: 'Dishwasher' },
  { amenity_id: 9, name: 'Internet included' },
  { amenity_id: 10, name: 'Heating' },
];

function parse(text) {
  return parseListingPaste(text, { amenities: AMENITIES });
}

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------

describe('parseEuropeanNumber', () => {
  it('parses plain integers and decimals', () => {
    expect(parseEuropeanNumber('450')).toBe(450);
    expect(parseEuropeanNumber('450.50')).toBe(450.5);
  });

  it('parses EU format 1.234,56 and US 1,234.56', () => {
    expect(parseEuropeanNumber('1.234,56')).toBe(1234.56);
    expect(parseEuropeanNumber('1,234.56')).toBe(1234.56);
  });

  it('treats 1.234 as European thousands (1234)', () => {
    expect(parseEuropeanNumber('1.234')).toBe(1234);
  });

  it('returns null for garbage', () => {
    expect(parseEuropeanNumber('')).toBeNull();
    expect(parseEuropeanNumber('abc')).toBeNull();
    expect(parseEuropeanNumber(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Greek samples (realistic portal / Facebook copy)
// ---------------------------------------------------------------------------

describe('parseListingPaste — Greek samples', () => {
  it('extracts a full Θεσσαλονίκη dual listing', () => {
    const text = `
Προς ενοικίαση δυάρι 55 τ.μ. στην οδό Εγνατία 23, 2ος όροφος.
1 υπνοδωμάτιο, 1 μπάνιο.
Ενοίκιο: 450€ / μήνα
Εγγύηση: 450 ευρώ
Διαθέσιμο από 01/09/2026.
Κοινόχρηστα συμπεριλαμβάνονται.
Πλήρως επιπλωμένο, με κλιματισμό (A/C), ασανσέρ και πλυντήριο.
Θέρμανση αυτόνομη. WiFi.
    `.trim();

    const r = parse(text);
    expect(r.fields.monthly_price).toBe('450');
    expect(r.fields.deposit).toBe('450');
    expect(r.fields.sqm).toBe('55');
    expect(r.fields.floor).toBe('2');
    expect(r.fields.bedrooms).toBe('1'); // δυάρι → 1 bed
    expect(r.fields.bathrooms).toBe('1');
    expect(r.fields.available_from).toBe('2026-09-01');
    expect(r.fields.bills_included).toBe(true);
    expect(r.fields.address).toMatch(/Εγνατία\s*23/i);
    expect(r.fields.description).toContain('δυάρι');
    expect(r.fields.amenity_ids).toEqual(
      expect.arrayContaining([1, 2, 4, 7, 9, 10]),
    );
    expect(r.found).toEqual(
      expect.arrayContaining([
        'monthly_price',
        'deposit',
        'sqm',
        'floor',
        'bedrooms',
        'bathrooms',
        'available_from',
        'bills_included',
        'address',
        'description',
        'amenity_ids',
      ]),
    );
  });

  it('extracts ισόγειο studio with Greek date month name', () => {
    const text = `
Γκαρσονιέρα 32 τμ, ισόγειο, Καλαμαριά.
Τιμή 380 ευρώ τον μήνα. Εγγύηση 380€.
Διαθέσιμο από 15 Σεπτεμβρίου 2026.
Μπαλκόνι, πάρκινγκ.
    `.trim();

    const r = parse(text);
    expect(r.fields.monthly_price).toBe('380');
    expect(r.fields.deposit).toBe('380');
    expect(r.fields.sqm).toBe('32');
    expect(r.fields.floor).toBe('0');
    expect(r.fields.bedrooms).toBe('0'); // γκαρσονιέρα
    expect(r.fields.available_from).toBe('2026-09-15');
    expect(r.fields.amenity_ids).toEqual(expect.arrayContaining([3, 5]));
    // No bathroom stated → missing, not guessed
    expect(r.fields.bathrooms).toBeUndefined();
    expect(r.missing).toContain('bathrooms');
  });

  it('extracts τριάρι near campus with EU thousands price', () => {
    const text = `
Ενοικιάζεται τριάρι 78 τ.μ. 3ος όροφος.
3 υπνοδωμάτια · 2 μπάνια
Ενοίκιο 1.200€
Εγγύηση: 1.200
Διαθέσιμο από 1/10/2026
Πλυντήριο πιάτων, ανελκυστήρας, θέρμανση.
Χωρίς κοινόχρηστα — τα πληρώνει ο ενοικιαστής.
    `.trim();

    const r = parse(text);
    expect(r.fields.monthly_price).toBe('1200');
    expect(r.fields.deposit).toBe('1200');
    expect(r.fields.sqm).toBe('78');
    expect(r.fields.floor).toBe('3');
    // Explicit "3 υπνοδωμάτια" wins over τριάρι shorthand
    expect(r.fields.bedrooms).toBe('3');
    expect(r.fields.bathrooms).toBe('2');
    expect(r.fields.available_from).toBe('2026-10-01');
    expect(r.fields.bills_included).toBe(false);
    expect(r.fields.amenity_ids).toEqual(expect.arrayContaining([4, 8, 10]));
  });
});

// ---------------------------------------------------------------------------
// English samples
// ---------------------------------------------------------------------------

describe('parseListingPaste — English samples', () => {
  it('extracts a Thessaloniki Facebook-style post', () => {
    const text = `
2-bedroom apartment for rent near Aristotle University.
55 m², 2nd floor. Monthly rent €520. Deposit 520 EUR.
Available from 1 September 2026.
Bills included. Furnished, AC, elevator, washing machine.
Address: Egnatia 45
1 bathroom.
    `.trim();

    const r = parse(text);
    expect(r.fields.monthly_price).toBe('520');
    expect(r.fields.deposit).toBe('520');
    expect(r.fields.sqm).toBe('55');
    expect(r.fields.floor).toBe('2');
    expect(r.fields.bedrooms).toBe('2');
    expect(r.fields.bathrooms).toBe('1');
    expect(r.fields.available_from).toBe('2026-09-01');
    expect(r.fields.bills_included).toBe(true);
    expect(r.fields.address).toMatch(/Egnatia\s*45/i);
    expect(r.fields.amenity_ids).toEqual(
      expect.arrayContaining([1, 2, 4, 7]),
    );
  });

  it('extracts ground-floor studio with US date order', () => {
    const text = `
Studio apartment, ground floor, 28 sqm.
Rent: 350 per month. Security deposit: 350.
Available from September 15, 2026.
All bills included. WiFi, heating, balcony.
Parking available.
    `.trim();

    const r = parse(text);
    expect(r.fields.monthly_price).toBe('350');
    expect(r.fields.deposit).toBe('350');
    expect(r.fields.sqm).toBe('28');
    expect(r.fields.floor).toBe('0');
    expect(r.fields.bedrooms).toBe('0');
    expect(r.fields.available_from).toBe('2026-09-15');
    expect(r.fields.bills_included).toBe(true);
    expect(r.fields.amenity_ids).toEqual(
      expect.arrayContaining([3, 5, 9, 10]),
    );
  });
});

// ---------------------------------------------------------------------------
// Ambiguous / empty — must not invent values
// ---------------------------------------------------------------------------

describe('parseListingPaste — ambiguous input yields nothing wrong', () => {
  it('returns empty fields for blank / whitespace', () => {
    expect(parse('').found).toEqual([]);
    expect(parse('   \n\t  ').found).toEqual([]);
    expect(parse(null).found).toEqual([]);
  });

  it('does not invent rent from unrelated numbers', () => {
    const text =
      'Nice place close to campus. Built in 1985. Call 2310 123456 for viewing.';
    const r = parse(text);
    expect(r.fields.monthly_price).toBeUndefined();
    expect(r.fields.deposit).toBeUndefined();
    expect(r.fields.sqm).toBeUndefined();
    expect(r.fields.floor).toBeUndefined();
    expect(r.fields.bedrooms).toBeUndefined();
    expect(r.fields.available_from).toBeUndefined();
    // Phone numbers must not become money
    expect(r.found).not.toContain('monthly_price');
  });

  it('does not treat a random date without availability context as available_from', () => {
    const text = 'The building was renovated on 12/03/2024. Spacious flat.';
    const r = parse(text);
    expect(r.fields.available_from).toBeUndefined();
  });

  it('does not guess floor from "3 months" or similar', () => {
    const text = 'Minimum stay 3 months. Quiet neighbourhood.';
    const r = parse(text);
    expect(r.fields.floor).toBeUndefined();
    expect(r.fields.bedrooms).toBeUndefined();
  });

  it('does not match amenities that are not in the catalog', () => {
    const r = parseListingPaste('Has a swimming pool and sauna. Rent 400€ / month.', {
      amenities: AMENITIES,
    });
    expect(r.fields.monthly_price).toBe('400');
    expect(r.fields.amenity_ids || []).toEqual([]);
  });

  it('truncates over-long paste and still parses the head', () => {
    const head = 'Ενοίκιο: 400€\n';
    const text = head + 'x'.repeat(PASTE_MAX_LENGTH);
    const r = parse(text);
    expect(r.truncated).toBe(true);
    expect(r.fields.monthly_price).toBe('400');
  });
});

// ---------------------------------------------------------------------------
// applyPasteSuggestions — never clobber typed values
// ---------------------------------------------------------------------------

describe('applyPasteSuggestions', () => {
  it('fills empty fields and reports applied keys', () => {
    const form = {
      monthly_price: '',
      deposit: '',
      bedrooms: '',
      amenity_ids: [],
      bills_included: false,
    };
    const { nextForm, applied } = applyPasteSuggestions(form, {
      monthly_price: '450',
      bedrooms: '2',
      amenity_ids: [1, 2],
      bills_included: true,
    });
    expect(nextForm.monthly_price).toBe('450');
    expect(nextForm.bedrooms).toBe('2');
    expect(nextForm.amenity_ids).toEqual([1, 2]);
    expect(nextForm.bills_included).toBe(true);
    expect(applied).toEqual(
      expect.arrayContaining(['monthly_price', 'bedrooms', 'amenity_ids', 'bills_included']),
    );
  });

  it('never overrides a landlord-typed non-empty value', () => {
    const form = {
      monthly_price: '999',
      bedrooms: '1',
      amenity_ids: [7],
      bills_included: true,
    };
    const { nextForm, applied } = applyPasteSuggestions(form, {
      monthly_price: '450',
      bedrooms: '2',
      amenity_ids: [1],
      bills_included: false,
    });
    expect(nextForm.monthly_price).toBe('999');
    expect(nextForm.bedrooms).toBe('1');
    // Amenities merge, do not wipe landlord choices
    expect(nextForm.amenity_ids).toEqual(expect.arrayContaining([7, 1]));
    // bills already true — do not force false
    expect(nextForm.bills_included).toBe(true);
    expect(applied).not.toContain('monthly_price');
    expect(applied).not.toContain('bedrooms');
  });
});
