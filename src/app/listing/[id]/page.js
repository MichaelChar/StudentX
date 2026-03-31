'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { isEstimatedPrice } from '@/lib/estimatedListings';
import InquiryForm from '@/components/InquiryForm';

export default function ListingPage() {
  const { id } = useParams();
  const router = useRouter();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Listing not found' : 'Something went wrong');
          return;
        }
        const data = await res.json();
        setListing(data.listing);
      } catch {
        setError('Failed to load listing');
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  if (loading) return <ListingSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-heading text-2xl font-bold text-navy mb-3">{error}</h1>
        <p className="text-gray-dark/60 mb-6">
          The listing you&#39;re looking for may have been removed or doesn&#39;t exist.
        </p>
        <Link
          href="/"
          className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors"
        >
          Back to search
        </Link>
      </div>
    );
  }

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http')
  );
  const hasMultiplePhotos = photos.length > 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-dark/60 hover:text-navy transition-colors mb-6 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to results
      </button>

      {/* Photo gallery */}
      {photos.length > 0 ? (
        <div className={`mb-8 ${hasMultiplePhotos ? 'grid grid-cols-2 md:grid-cols-3 gap-2' : ''}`}>
          {photos.map((photo, i) => (
            <div
              key={i}
              className={`relative rounded-xl overflow-hidden bg-gray-light ${
                hasMultiplePhotos && i === 0 ? 'col-span-2 row-span-2 aspect-[4/3]' : 'aspect-[4/3]'
              }`}
            >
              <Image
                src={photo}
                alt={`${listing.address} photo ${i + 1}`}
                fill
                className="object-cover"
                sizes={i === 0 ? '(max-width: 768px) 100vw, 66vw' : '33vw'}
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-8 aspect-[16/9] rounded-xl bg-gray-light flex items-center justify-center">
          <svg className="w-16 h-16 text-gray-dark/20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column — details */}
        <div className="md:col-span-2 space-y-6">
          {/* Price + bills badge */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <h1 className="font-heading text-3xl font-bold text-navy">
                {listing.monthly_price != null ? (
                  <>{isEstimatedPrice(listing.listing_id) && <span className="text-base font-normal text-gray-dark/50">est </span>}&euro;{listing.monthly_price}<span className="text-base font-normal text-gray-dark/50">/month</span></>
                ) : (
                  <span className="text-lg font-normal text-gray-dark/50">Price on request</span>
                )}
              </h1>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  listing.bills_included
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {listing.bills_included ? 'Bills included' : 'Bills not included'}
              </span>
            </div>
            {listing.deposit > 0 && (
              <p className="text-sm text-gray-dark/50">
                Deposit: &euro;{listing.deposit}
              </p>
            )}
          </div>

          {/* Property info */}
          <div className="bg-gray-light rounded-xl p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-dark/50 block text-xs mb-0.5">Type</span>
                <span className="text-gray-dark font-medium capitalize">
                  {listing.property_type?.replace(/-/g, ' ')}
                </span>
              </div>
              <div>
                <span className="text-gray-dark/50 block text-xs mb-0.5">Neighborhood</span>
                <span className="text-gray-dark font-medium">{listing.neighborhood}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-dark/50 block text-xs mb-0.5">Address</span>
                <span className="text-gray-dark font-medium">{listing.address}</span>
              </div>
            </div>
          </div>

          {/* Amenities */}
          {listing.amenities?.length > 0 && (
            <div>
              <h2 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map((amenity) => (
                  <span
                    key={amenity}
                    className="text-sm px-3 py-1.5 rounded-full bg-gray-light text-gray-dark/80 border border-gray-200"
                  >
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-3">Description</h2>
              <p className="text-gray-dark/80 leading-relaxed">{listing.description}</p>
            </div>
          )}
        </div>

        {/* Right column — distances + contact */}
        <div className="space-y-6">
          {/* Faculty distances */}
          {listing.faculty_distances?.length > 0 && (
            <div className="bg-gray-light rounded-xl p-5">
              <h2 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-3">
                Distance to faculties
              </h2>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />
                  <col className="w-16" />
                  <col className="w-16" />
                </colgroup>
                <thead>
                  <tr className="text-xs text-gray-dark/50">
                    <th className="text-left pb-2 font-normal">Faculty</th>
                    <th className="text-right pb-2 font-normal">Walk</th>
                    <th className="text-right pb-2 font-normal">Transit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {listing.faculty_distances.map((fd) => (
                    <tr key={fd.faculty_name}>
                      <td className="py-2 text-gray-dark/80 pr-2">{fd.faculty_name}</td>
                      <td className="py-2 text-right text-gray-dark/70 whitespace-nowrap">{fd.walk_minutes} min</td>
                      <td className="py-2 text-right text-gray-dark/70 whitespace-nowrap">{fd.transit_minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Contact form */}
          <InquiryForm listingId={listing.listing_id} />
        </div>
      </div>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12 animate-pulse">
      <div className="h-4 w-28 bg-gray-light rounded mb-6" />
      <div className="aspect-[16/9] rounded-xl bg-gray-light mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="h-9 w-40 bg-gray-light rounded" />
          <div className="h-32 bg-gray-light rounded-xl" />
          <div className="space-y-2">
            <div className="h-5 w-24 bg-gray-light rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-16 bg-gray-light rounded-full" />
              <div className="h-8 w-20 bg-gray-light rounded-full" />
              <div className="h-8 w-18 bg-gray-light rounded-full" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-5 w-28 bg-gray-light rounded" />
            <div className="h-20 bg-gray-light rounded" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-48 bg-gray-light rounded-xl" />
          <div className="h-12 bg-gray-light rounded-lg" />
        </div>
      </div>
    </div>
  );
}
