import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getListingForRender } from "@/lib/listingForRender";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.uk";

export async function generateMetadata({ params }) {
  const { id, locale } = await params;
  const listing = await getListingForRender(id);

  if (!listing) {
    const t = await getTranslations({ locale, namespace: 'propylaea.listing.notFound' });
    return {
      title: t('title'),
      description: t('description'),
    };
  }

  const address = listing.address ?? "";
  const neighborhood = listing.neighborhood ?? "Thessaloniki";
  const propertyType = listing.property_type ?? "Property";
  const price = listing.monthly_price;
  const priceStr = price != null ? `€${price}/month` : "price on request";
  const photo = (listing.photos ?? []).find(
    (url) => typeof url === "string" && url.startsWith("http")
  );

  // Faculties with short walk times make compelling meta copy
  const nearbyFaculty = (listing.faculty_distances ?? [])
    .filter((fd) => fd.walk_minutes <= 20)
    .sort((a, b) => a.walk_minutes - b.walk_minutes)[0];

  const facultyHint = nearbyFaculty
    ? ` — ${nearbyFaculty.walk_minutes} min walk to ${nearbyFaculty.faculty_name}`
    : "";

  // Prefer the landlord-chosen title for social/share cards. Fall back to the
  // generated `${propertyType} in ${neighborhood}, ${priceStr}` when the title
  // would just duplicate the address (true for the 13 backfilled rows from
  // migration 038 until landlords edit) — that template is more compelling
  // than a bare street address as a share-card headline.
  const generatedTitle = `${propertyType} in ${neighborhood}, ${priceStr}`;
  const titleIsDistinctFromAddress =
    listing.title && listing.title !== listing.address;
  const title = titleIsDistinctFromAddress
    ? `${listing.title} — ${neighborhood}, ${priceStr}`
    : generatedTitle;
  const description =
    (listing.description
      ? listing.description.slice(0, 140)
      : `${propertyType} available in ${neighborhood}, Thessaloniki${facultyHint}.`) +
    (listing.description && listing.description.length > 140 ? "…" : "");

  // Single-locale (Step B, #158): one canonical URL, no language
  // alternates. og:locale stays en_GB.
  const { city } = await params;
  const url = `${SITE_URL}/property/${city}/listing/${id}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${title} — StudentX`,
      description,
      url,
      siteName: "StudentX",
      type: "website",
      // Photos hotlink third-party CDNs (e.g. Wix); when no usable photo is
      // present we fall back to a self-hosted SVG so og:image is never empty
      // and never relies on a host we don't control.
      images: photo
        ? [{ url: photo, alt: `${propertyType} at ${address}` }]
        : [
            {
              url: `${SITE_URL}/og-default.png`,
              alt: "StudentX — student housing in Thessaloniki",
            },
          ],
      locale: "en_GB",
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
  const listing = await getListingForRender(id);

  if (!listing) {
    notFound();
  }

  let jsonLd = null;
  if (listing) {
    const address = listing.address ?? "";
    const neighborhood = listing.neighborhood ?? "Thessaloniki";
    const price = listing.monthly_price;
    const propertyType = listing.property_type ?? "Apartment";
    const photo = (listing.photos ?? []).find(
      (url) => typeof url === "string" && url.startsWith("http")
    );
    const { city } = await params;
    const localizedUrl = `${SITE_URL}/property/${city}/listing/${id}`;

    // Same title-vs-generated logic as generateMetadata above. Schema.org
    // RealEstateListing.name is the primary surface a search engine cards
    // off, so prefer the landlord-chosen title when it's distinct from the
    // backfilled-from-address default.
    const jsonLdName =
      listing.title && listing.title !== listing.address
        ? listing.title
        : `${propertyType} in ${neighborhood}`;

    jsonLd = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: jsonLdName,
      description: listing.description ?? `${propertyType} available in ${neighborhood}, Thessaloniki.`,
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
          priceCurrency: listing.currency ?? "EUR",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: price.toString(),
            priceCurrency: listing.currency ?? "EUR",
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
