import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { transformListing } from "@/lib/transformListing";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    // Validate listing ID is a non-empty string of digits (with optional dash)
    if (!id || !/^\d[\d-]+$/.test(id)) {
      return NextResponse.json(
        { error: "Invalid listing ID format" },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabase()
      .from("listings")
      .select(
        `
        listing_id,
        title,
        description,
        photos,
        floor,
        sqm,
        bedrooms,
        bathrooms,
        agency_fee,
        available_from,
        available_to,
        min_duration_months,
        max_duration_months,
        smoking_allowed,
        pets_allowed,
        additional_rules,
        rent ( monthly_price, currency, bills_included, deposit ),
        location ( address, neighborhood, lat, lng ),
        property_types ( name ),
        landlords ( name, is_verified, profile_photo_url, avg_response_ms, response_stats_at ),
        listing_amenities ( amenities ( amenity_id, name ) ),
        faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
        listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) ),
        property_verifications ( verification_id, method, verified_at )
      `
      )
      .eq("listing_id", id)
      .eq("listing_status", "active")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 }
        );
      }
      console.error("Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch listing" },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ listing: transformListing(data) });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
