import { notFound } from "next/navigation";
import { getListingForRender } from "@/lib/listingForRender";
import { requireStudent } from "@/lib/requireStudent";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.gr";

export async function generateMetadata({ params }) {
  const { id, locale } = await params;
  const [listing, auth] = await Promise.all([
    getListingForRender(id),
    requireStudent(),
  ]);

  if (!listing) {
    return {
      title: "Listing not found",
      description: "This student housing listing could not be found.",
    };
  }

  // SEO cloaking guard: when the page body will render the auth gate
  // instead of the listing, also strip the rich preview metadata down
  // to a noindex stub. Otherwise Google sees structured data + OG
  // images for content the user is gated out of, which trips the
  // cloaking heuristic. requireStudent is React.cache()'d so the
  // page-level call below shares this round-trip.
  if (!auth) {
    return {
      title: "Sign in to view listing — StudentX",
      description:
        "StudentX listings are visible to verified student accounts. Create a free account to view this listing.",
      robots: { index: false, follow: false },
      alternates: undefined,
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

  const title = `${propertyType} in ${neighborhood}, ${priceStr}`;
  const description =
    (listing.description
      ? listing.description.slice(0, 140)
      : `${propertyType} available in ${neighborhood}, Thessaloniki${facultyHint}.`) +
    (listing.description && listing.description.length > 140 ? "…" : "");

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
  const [listing, auth] = await Promise.all([
    getListingForRender(id),
    requireStudent(),
  ]);

  // Surface a real 404 when the listing doesn't exist instead of letting the
  // client-side page render a soft "Listing not found" body with HTTP 200.
  if (!listing) {
    notFound();
  }

  // Skip JSON-LD when the page body is the auth gate. We already set
  // robots:noindex above for the same reason, so emitting structured
  // data here would actively contradict the directive and expose the
  // listing to crawlers under a sign-in wall.
  let jsonLd = null;
  if (listing && auth) {
    const address = listing.address ?? "";
    const neighborhood = listing.neighborhood ?? "Thessaloniki";
    const price = listing.monthly_price;
    const propertyType = listing.property_type ?? "Apartment";
    const photo = (listing.photos ?? []).find(
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
