'use client';

import { useEffect, useState } from 'react';

const NEIGHBORHOODS_FALLBACK = [
  'Ano Poli', 'Center', 'Faliro', 'Kalamaria', 'Kentro',
  'Ladadika', 'Neapoli', 'Toumba', 'Vardaris',
];

export default function ListingForm({ initialValues = {}, onSubmit, submitLabel = 'Save listing' }) {
  const [form, setForm] = useState({
    address: '',
    neighborhood: '',
    lat: '',
    lng: '',
    property_type: '',
    monthly_price: '',
    bills_included: false,
    deposit: '',
    description: '',
    sqm: '',
    floor: '',
    available_from: '',
    rental_duration: '',
    amenity_ids: [],
    ...initialValues,
  });

  const [propertyTypes, setPropertyTypes] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadOptions() {
      const [ptRes, amRes] = await Promise.all([
        fetch('/api/property-types'),
        fetch('/api/amenities'),
      ]);
      if (ptRes.ok) {
        const { propertyTypes: pts } = await ptRes.json();
        setPropertyTypes(pts || []);
      }
      if (amRes.ok) {
        const { amenities: ams } = await amRes.json();
        setAmenities(ams || []);
      }
    }
    loadOptions();
  }, []);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAmenity(amenityId) {
    setForm((prev) => ({
      ...prev,
      amenity_ids: prev.amenity_ids.includes(amenityId)
        ? prev.amenity_ids.filter((id) => id !== amenityId)
        : [...prev.amenity_ids, amenityId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold';
  const labelClass = 'block text-sm font-medium text-gray-dark mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Location */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          Location
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Street address *</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={inputClass}
              placeholder="e.g. Egnatia 23"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Neighborhood *</label>
              <input
                type="text"
                required
                list="neighborhoods-list"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={inputClass}
                placeholder="e.g. Toumba"
              />
              <datalist id="neighborhoods-list">
                {NEIGHBORHOODS_FALLBACK.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Latitude *</label>
              <input
                type="number"
                required
                step="any"
                value={form.lat}
                onChange={(e) => set('lat', e.target.value)}
                className={inputClass}
                placeholder="40.6301"
              />
            </div>
            <div>
              <label className={labelClass}>Longitude *</label>
              <input
                type="number"
                required
                step="any"
                value={form.lng}
                onChange={(e) => set('lng', e.target.value)}
                className={inputClass}
                placeholder="22.9563"
              />
            </div>
          </div>
          <p className="text-xs text-gray-dark/50">
            Find coordinates on{' '}
            <a
              href="https://www.google.com/maps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline"
            >
              Google Maps
            </a>{' '}
            by right-clicking your property.
          </p>
        </div>
      </section>

      {/* Property details */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          Property details
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Property type *</label>
            <select
              required
              value={form.property_type}
              onChange={(e) => set('property_type', e.target.value)}
              className={inputClass}
            >
              <option value="">Select type…</option>
              {propertyTypes.map((pt) => (
                <option key={pt.property_type_id} value={pt.name}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Size (m²)</label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => set('sqm', e.target.value)}
                className={inputClass}
                placeholder="e.g. 45"
              />
            </div>
            <div>
              <label className={labelClass}>Floor</label>
              <input
                type="number"
                value={form.floor}
                onChange={(e) => set('floor', e.target.value)}
                className={inputClass}
                placeholder="e.g. 2"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClass + ' resize-none'}
              placeholder="Describe the property…"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          Pricing
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Monthly rent (€)</label>
              <input
                type="number"
                min="1"
                value={form.monthly_price}
                onChange={(e) => set('monthly_price', e.target.value)}
                className={inputClass}
                placeholder="Leave blank if on request"
              />
            </div>
            <div>
              <label className={labelClass}>Deposit (€)</label>
              <input
                type="number"
                min="0"
                value={form.deposit}
                onChange={(e) => set('deposit', e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.bills_included}
              onChange={(e) => set('bills_included', e.target.checked)}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-sm text-gray-dark">Bills included in rent</span>
          </label>
        </div>
      </section>

      {/* Availability */}
      <section>
        <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
          Availability
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Available from</label>
            <input
              type="date"
              value={form.available_from}
              onChange={(e) => set('available_from', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rental duration</label>
            <input
              type="text"
              value={form.rental_duration}
              onChange={(e) => set('rental_duration', e.target.value)}
              className={inputClass}
              placeholder="e.g. 12 months, flexible"
            />
          </div>
        </div>
      </section>

      {/* Amenities */}
      {amenities.length > 0 && (
        <section>
          <h2 className="font-heading font-semibold text-navy mb-4 text-sm uppercase tracking-wider">
            Amenities
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {amenities.map((amenity) => (
              <label key={amenity.amenity_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.amenity_ids.includes(amenity.amenity_id)}
                  onChange={() => toggleAmenity(amenity.amenity_id)}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-sm text-gray-dark">{amenity.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full sm:w-auto bg-gold text-white font-heading font-semibold px-8 py-3 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50"
      >
        {loading ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
