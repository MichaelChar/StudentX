import { getSupabase } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.gr";

export default async function sitemap() {
  // Static pages
  const staticRoutes = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/results`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  // Dynamic listing pages
  try {
    const { data, error } = await getSupabase()
      .from("listings")
      .select("listing_id, updated_at")
      .order("listing_id");

    if (error || !data) return staticRoutes;

    const listingRoutes = data.map((row) => ({
      url: `${SITE_URL}/listing/${row.listing_id}`,
      lastModified: new Date(row.updated_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...listingRoutes];
  } catch {
    return staticRoutes;
  }
}
