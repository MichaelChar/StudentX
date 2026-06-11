import { describe, it, expect } from 'vitest';
import {
  propertyEnumToTypeName,
  typeNameToEnum,
  bedsFromTypeName,
  nextLandlordId,
  nextListingId,
  parseExtractionJson,
  resolvePhotoUrl,
  photoExtFromUrl,
  sourceTagFromUrl,
  toIntOrNull,
} from '@/lib/pendingMappers';

describe('property type mapping', () => {
  it('maps enum -> existing public type name, degrading 3-bed and other', () => {
    expect(propertyEnumToTypeName('studio')).toBe('Studio');
    expect(propertyEnumToTypeName('1-bed')).toBe('1-Bedroom');
    expect(propertyEnumToTypeName('2-bed')).toBe('2-Bedroom');
    expect(propertyEnumToTypeName('3-bed')).toBe('2-Bedroom'); // no 3-bedroom type exists
    expect(propertyEnumToTypeName('room')).toBe('Room in shared apartment');
    expect(propertyEnumToTypeName('other')).toBe('Studio'); // fallback
    expect(propertyEnumToTypeName('garbage')).toBe('Studio');
  });

  it('maps public type name -> enum, including the (x2) variant', () => {
    expect(typeNameToEnum('Studio')).toBe('studio');
    expect(typeNameToEnum('2-Bedroom (x2)')).toBe('2-bed');
    expect(typeNameToEnum('Room in shared apartment')).toBe('room');
    expect(typeNameToEnum('Something else')).toBe('other');
  });

  it('derives a best-effort bed count from a type name', () => {
    expect(bedsFromTypeName('Studio')).toBe(0);
    expect(bedsFromTypeName('2-Bedroom (x2)')).toBe(2);
    expect(bedsFromTypeName('mystery')).toBeNull();
  });
});

describe('id minting', () => {
  it('mints the next 4-digit landlord id', () => {
    expect(nextLandlordId('0106')).toBe('0107');
    expect(nextLandlordId(null)).toBe('0100');
    expect(() => nextLandlordId('9999')).toThrow();
  });

  it('mints the 7-digit listing id with the landlord prefix', () => {
    expect(nextListingId('0107', null)).toBe('0107001');
    expect(nextListingId('0107', '0107001')).toBe('0107002');
    expect(() => nextListingId('0107', '0107999')).toThrow();
  });
});

describe('parseExtractionJson', () => {
  it('parses bare JSON', () => {
    expect(parseExtractionJson('{"address":"A","beds":2}')).toEqual({ address: 'A', beds: 2 });
  });
  it('strips ```json fences', () => {
    expect(parseExtractionJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('recovers JSON wrapped in prose', () => {
    expect(parseExtractionJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  it('returns null on unparseable input', () => {
    expect(parseExtractionJson('not json at all')).toBeNull();
    expect(parseExtractionJson(null)).toBeNull();
  });
});

describe('photo helpers', () => {
  it('resolves relative urls and rejects junk', () => {
    expect(resolvePhotoUrl('/img/a.jpg', 'https://x.gr/listing/1')).toBe('https://x.gr/img/a.jpg');
    expect(resolvePhotoUrl('https://cdn/x.png', 'https://x.gr')).toBe('https://cdn/x.png');
    expect(resolvePhotoUrl('data:image/png;base64,xx', 'https://x.gr')).toBeNull();
    expect(resolvePhotoUrl('', 'https://x.gr')).toBeNull();
  });
  it('extracts a normalised extension', () => {
    expect(photoExtFromUrl('https://x/a.JPG')).toBe('jpg');
    expect(photoExtFromUrl('https://x/a.jpeg')).toBe('jpg');
    expect(photoExtFromUrl('https://x/a.webp')).toBe('webp');
    expect(photoExtFromUrl('https://x/image?id=3')).toBe('jpg');
  });
});

describe('misc coercion', () => {
  it('derives a source tag from the hostname', () => {
    expect(sourceTagFromUrl('https://www.spitogatos.gr/x/1')).toBe('spitogatos.gr');
    expect(sourceTagFromUrl('not a url')).toBe('scraped');
  });
  it('coerces number-ish values to a non-negative int or null', () => {
    expect(toIntOrNull('€480')).toBe(480);
    expect(toIntOrNull(30)).toBe(30);
    expect(toIntOrNull('')).toBeNull();
    expect(toIntOrNull(-5)).toBeNull();
  });
});
