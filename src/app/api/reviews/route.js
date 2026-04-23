import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { listing_id, user_email, rating, review_text } = body;

    if (!listing_id || typeof listing_id !== "string" || listing_id.trim().length === 0) {
      return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
    }
    if (!user_email || typeof user_email !== "string") {
      return NextResponse.json({ error: "user_email is required" }, { status: 400 });
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(user_email)) {
      return NextResponse.json({ error: "user_email is invalid" }, { status: 400 });
    }
    if (rating == null || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be an integer between 1 and 5" }, { status: 400 });
    }
    if (!review_text || typeof review_text !== "string" || review_text.trim().length < 10) {
      return NextResponse.json({ error: "review_text must be at least 10 characters" }, { status: 400 });
    }
    if (review_text.trim().length > 2000) {
      return NextResponse.json({ error: "review_text must be at most 2000 characters" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Verify listing exists
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("listing_id")
      .eq("listing_id", listing_id.trim())
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("reviews")
      .insert({
        listing_id: listing_id.trim(),
        user_email: user_email.trim().toLowerCase(),
        rating,
        review_text: review_text.trim(),
      })
      .select("review_id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
    }

    return NextResponse.json({ review_id: data.review_id }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/reviews:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
