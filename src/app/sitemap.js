import { getSupabase } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.uk";

export default async function sitemap() {
  // Single-locale English (issue #158 / Step B). /property is the
  // multi-city hub; /property/thessaloniki and below are city-scoped.
  // Pre-Step-B emitted /en/ duplicates of each; they 301 to unprefixed
  // now, so emitting them would just hand Googlebot a redirect map.
  const staticRoutes = [
    { url: `${SITE_URL}/property`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/property/thessaloniki`, lastModified: new Date(), changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE_URL}/property/thessaloniki/results`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/resources`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/admissions`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  ];

  // Dynamic listing pages.
  //
  // Only `active` listings belong in a sitemap, and the filter is the point
  // of this query rather than a detail of it. Without it every row was
  // emitted: drafts and submitted-awaiting-review listings, which 404 via
  // getListingForRender's "never public" branch, and landlord-paused ones,
  // which render `noindex` (#205). Handing Googlebot a URL we then refuse to
  // index — or 404 outright — spends crawl budget to teach it that our
  // sitemap is unreliable. `listing_status` defaults to `disabled`
  // (migration 104), so this was every listing ever created.
  try {
    const { data, error } = await getSupabase()
      .from("listings")
      .select("listing_id, updated_at")
      .eq("listing_status", "active")
      .order("listing_id");

    if (error || !data) return staticRoutes;

    const listingRoutes = data.map((row) => ({
      url: `${SITE_URL}/property/thessaloniki/listing/${row.listing_id}`,
      lastModified: new Date(row.updated_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...listingRoutes];
  } catch {
    return staticRoutes;
  }
}
