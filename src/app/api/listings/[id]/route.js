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

    let { data, error } = await getSupabase()
      .from("listings")
      .select(
        `
        listing_id,
        description,
        photos,
        rent ( monthly_price, currency, bills_included, deposit ),
        location ( address, neighborhood, lat, lng ),
        property_types ( name ),
        landlords ( name, contact_info, verified_tier ),
        listing_amenities ( amenities ( amenity_id, name ) ),
        faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
      `
      )
      .eq("listing_id", id)
      .single();

    // Retry without verified_tier if column doesn't exist yet
    if (error && error.code !== "PGRST116") {
      const fallback = await getSupabase()
        .from("listings")
        .select(
          `
          listing_id,
          description,
          photos,
          rent ( monthly_price, currency, bills_included, deposit ),
          location ( address, neighborhood, lat, lng ),
          property_types ( name ),
          landlords ( name, contact_info ),
          listing_amenities ( amenities ( amenity_id, name ) ),
          faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
        `
        )
        .eq("listing_id", id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

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
