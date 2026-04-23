import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { transformListing } from "@/lib/transformListing";

const LISTING_SELECT = `
  listing_id,
  is_featured,
  description,
  photos,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, contact_info, verified_tier ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

// Fallback SELECT without is_featured/verified_tier for pre-migration compatibility
const LISTING_SELECT_FALLBACK = `
  listing_id,
  description,
  photos,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, contact_info ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const faculty = searchParams.get("faculty");
    const maxBudget = searchParams.get("max_budget");
    const minBudget = searchParams.get("min_budget");
    const types = searchParams.get("types");
    const neighborhoods = searchParams.get("neighborhoods");
    const amenities = searchParams.get("amenities");
    const excludeAmenities = searchParams.get("exclude_amenities");
    const sortBy = searchParams.get("sort_by") || "price";
    const sortOrder = searchParams.get("sort_order") || "asc";

    // Validate sort params
    const validSortBy = ["price", "walk_minutes", "transit_minutes"];
    if (!validSortBy.includes(sortBy)) {
      return NextResponse.json(
        { error: `sort_by must be one of: ${validSortBy.join(", ")}` },
        { status: 400 }
      );
    }
    if (sortOrder !== "asc" && sortOrder !== "desc") {
      return NextResponse.json(
        { error: "sort_order must be 'asc' or 'desc'" },
        { status: 400 }
      );
    }

    // Validate: sorting by walk/transit requires a faculty param
    if ((sortBy === "walk_minutes" || sortBy === "transit_minutes") && !faculty) {
      return NextResponse.json(
        { error: `sort_by '${sortBy}' requires a faculty param` },
        { status: 400 }
      );
    }

    // Validate: faculty ID format (lowercase alphanumeric with dashes)
    if (faculty && !/^[a-z0-9-]+$/.test(faculty)) {
      return NextResponse.json(
        { error: "faculty must be a valid faculty ID (e.g. 'auth-main')" },
        { status: 400 }
      );
    }

    // Validate: types — non-empty items
    if (types !== null && types.trim() === "") {
      return NextResponse.json(
        { error: "types must be a non-empty comma-separated list of property type names" },
        { status: 400 }
      );
    }

    // Validate: exclude_amenities — non-empty items
    if (excludeAmenities !== null && excludeAmenities.trim() === "") {
      return NextResponse.json(
        { error: "exclude_amenities must be a non-empty comma-separated list" },
        { status: 400 }
      );
    }

    // Build query
    let query = getSupabase().from("listings").select(LISTING_SELECT);

    // Filter: min budget
    if (minBudget) {
      const budget = Number(minBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "min_budget must be a positive number" },
          { status: 400 }
        );
      }
      query = query.gte("rent.monthly_price", budget);
    }

    // Filter: max budget
    if (maxBudget) {
      const budget = Number(maxBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "max_budget must be a positive number" },
          { status: 400 }
        );
      }
      query = query.lte("rent.monthly_price", budget);
    }

    // Filter: neighborhoods (comma-separated)
    if (neighborhoods) {
      const neighborhoodList = neighborhoods.split(",").map((n) => n.trim()).filter(Boolean);
      if (neighborhoodList.length > 0) {
        query = query.in("location.neighborhood", neighborhoodList);
      }
    }

    // Filter: property types (comma-separated)
    if (types) {
      const typeList = types.split(",").map((t) => t.trim());
      query = query.in("property_types.name", typeList);
    }

    // Filter: faculty distances to selected faculty only
    if (faculty) {
      query = query.eq("faculty_distances.faculty_id", faculty);
    }

    let { data, error } = await query;

    // If query fails (e.g. verified_tier column not yet migrated), retry without it
    if (error) {
      console.warn("Listings query failed, retrying without verified_tier:", error.message);
      let fallbackQuery = getSupabase().from("listings").select(LISTING_SELECT_FALLBACK);

      if (minBudget) fallbackQuery = fallbackQuery.gte("rent.monthly_price", Number(minBudget));
      if (maxBudget) fallbackQuery = fallbackQuery.lte("rent.monthly_price", Number(maxBudget));
      if (neighborhoods) {
        const neighborhoodList = neighborhoods.split(",").map((n) => n.trim()).filter(Boolean);
        if (neighborhoodList.length > 0) fallbackQuery = fallbackQuery.in("location.neighborhood", neighborhoodList);
      }
      if (types) fallbackQuery = fallbackQuery.in("property_types.name", types.split(",").map((t) => t.trim()));
      if (faculty) fallbackQuery = fallbackQuery.eq("faculty_distances.faculty_id", faculty);

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        console.error("Supabase fallback query error:", fallbackResult.error);
        return NextResponse.json(
          { error: "Failed to fetch listings" },
          { status: 500 }
        );
      }
      data = fallbackResult.data;
    }

    // Transform rows to API shape
    let results = data.map(transformListing);

    // Merge avg ratings from listing_rating_summary view
    try {
      const listingIds = results.map((l) => l.listing_id);
      if (listingIds.length > 0) {
        const { data: ratings } = await getSupabase()
          .from("listing_rating_summary")
          .select("listing_id, avg_rating, review_count")
          .in("listing_id", listingIds);

        if (ratings) {
          const ratingMap = Object.fromEntries(ratings.map((r) => [r.listing_id, r]));
          results = results.map((l) => ({
            ...l,
            avg_rating: ratingMap[l.listing_id]?.avg_rating ?? null,
            review_count: ratingMap[l.listing_id]?.review_count ?? 0,
          }));
        }
      }
    } catch {
      // Ratings are non-critical — continue without them if view doesn't exist yet
    }

    // Post-query filter: exclude listings missing required amenities (dealbreakers)
    // e.g. exclude_amenities=AC,Elevator → only keep listings that have ALL of these
    if (excludeAmenities) {
      const required = excludeAmenities.split(",").map((a) => a.trim().toLowerCase());
      results = results.filter((listing) => {
        const has = listing.amenities.map((a) => a.toLowerCase());
        return required.every((r) => has.includes(r));
      });
    }

    // Sort: verified_pro first, then verified, then free; within each tier by chosen sort field
    const tierRank = { verified_pro: 0, verified: 1, none: 2 };
    results.sort((a, b) => {
      // Verified tier takes priority
      const rankA = tierRank[a.verified_tier] ?? 2;
      const rankB = tierRank[b.verified_tier] ?? 2;
      if (rankA !== rankB) return rankA - rankB;

      // Featured listings next
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;

      let valA, valB;

      if (sortBy === "price") {
        valA = a.monthly_price;
        valB = b.monthly_price;
      } else if (sortBy === "walk_minutes") {
        valA = a.faculty_distances[0]?.walk_minutes ?? null;
        valB = b.faculty_distances[0]?.walk_minutes ?? null;
      } else if (sortBy === "transit_minutes") {
        valA = a.faculty_distances[0]?.transit_minutes ?? null;
        valB = b.faculty_distances[0]?.transit_minutes ?? null;
      }

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      return sortOrder === "desc" ? valB - valA : valA - valB;
    });

    const response = NextResponse.json({ listings: results });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
