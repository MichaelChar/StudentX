import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.gr";

async function fetchListingForMeta(id) {
  try {
    const { data } = await getSupabase()
      .from("listings")
      .select(
        `
        listing_id,
        description,
        photos,
        rent ( monthly_price, currency, bills_included ),
        location ( address, neighborhood ),
        property_types ( name ),
        landlords ( name ),
        faculty_distances ( walk_minutes, transit_minutes, faculties ( name, university ) )
      `
      )
      .eq("listing_id", id)
      .single();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id, locale } = await params;
  const data = await fetchListingForMeta(id);

  if (!data) {
    return {
      title: "Listing not found",
      description: "This student housing listing could not be found.",
    };
  }

  const address = data.location?.address ?? "";
  const neighborhood = data.location?.neighborhood ?? "Thessaloniki";
  const propertyType = data.property_types?.name ?? "Property";
  const price = data.rent?.monthly_price;
  const priceStr = price != null ? `€${price}/month` : "price on request";
  const photo = (data.photos ?? []).find(
    (url) => typeof url === "string" && url.startsWith("http")
  );

  // Faculties with short walk times make compelling meta copy
  const nearbyFaculty = (data.faculty_distances ?? [])
    .filter((fd) => fd.walk_minutes <= 20)
    .sort((a, b) => a.walk_minutes - b.walk_minutes)[0];

  const facultyHint = nearbyFaculty
    ? ` — ${nearbyFaculty.walk_minutes} min walk to ${nearbyFaculty.faculties?.name}`
    : "";

  const title = `${propertyType} in ${neighborhood}, ${priceStr}`;
  const description =
    (data.description
      ? data.description.slice(0, 140)
      : `${propertyType} available in ${neighborhood}, Thessaloniki${facultyHint}.`) +
    (data.description && data.description.length > 140 ? "…" : "");

  // Greek is default (no prefix); English lives under /en. Mirror the
  // routing in src/i18n/routing.js (defaultLocale: 'el', as-needed prefix).
  const elUrl = `${SITE_URL}/listing/${id}`;
  const enUrl = `${SITE_URL}/en/listing/${id}`;
  const url = locale === 'el' ? elUrl : enUrl;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        el: elUrl,
        en: enUrl,
        'x-default': elUrl,
      },
    },
    openGraph: {
      title: `${title} — StudentX`,
      description,
      url,
      siteName: "StudentX",
      type: "website",
      images: photo
        ? [{ url: photo, alt: `${propertyType} at ${address}` }]
        : [],
      locale: locale === 'el' ? "el_GR" : "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — StudentX`,
      description,
      images: photo ? [photo] : [],
    },
  };
}

export default async function ListingLayout({ children, params }) {
  const { id, locale } = await params;
  const data = await fetchListingForMeta(id);

  // Surface a real 404 when the listing doesn't exist instead of letting the
  // client-side page render a soft "Listing not found" body with HTTP 200.
  if (!data) {
    notFound();
  }

  let jsonLd = null;
  if (data) {
    const address = data.location?.address ?? "";
    const neighborhood = data.location?.neighborhood ?? "Thessaloniki";
    const price = data.rent?.monthly_price;
    const propertyType = data.property_types?.name ?? "Apartment";
    const photo = (data.photos ?? []).find(
      (url) => typeof url === "string" && url.startsWith("http")
    );
    const localizedUrl =
      locale === 'en'
        ? `${SITE_URL}/en/listing/${id}`
        : `${SITE_URL}/listing/${id}`;

    jsonLd = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: `${propertyType} in ${neighborhood}`,
      description: data.description ?? `${propertyType} available in ${neighborhood}, Thessaloniki.`,
      url: localizedUrl,
      ...(photo && { image: photo }),
      address: {
        "@type": "PostalAddress",
        streetAddress: address,
        addressLocality: neighborhood,
        addressRegion: "Thessaloniki",
        addressCountry: "GR",
      },
      ...(price != null && {
        offers: {
          "@type": "Offer",
          price: price.toString(),
          priceCurrency: data.rent?.currency ?? "EUR",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: price.toString(),
            priceCurrency: data.rent?.currency ?? "EUR",
            referenceQuantity: {
              "@type": "QuantitativeValue",
              value: 1,
              unitCode: "MON",
            },
          },
        },
      }),
    };
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd)
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e"),
          }}
        />
      )}
      {children}
    </>
  );
}
