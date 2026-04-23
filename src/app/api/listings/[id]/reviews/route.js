import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id || !/^\d[\d-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid listing ID format" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("review_id, rating, review_text, created_at, user_email")
      .eq("listing_id", id)
      .eq("moderated", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase reviews query error:", error);
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }

    // Compute average rating
    let avg_rating = null;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      avg_rating = Math.round((sum / reviews.length) * 10) / 10;
    }

    // Anonymise emails — show only first character + domain
    const sanitised = reviews.map((r) => {
      const [local, domain] = r.user_email.split("@");
      const masked_email = local.charAt(0) + "***@" + (domain || "");
      return {
        review_id: r.review_id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
        masked_email,
      };
    });

    return NextResponse.json({ reviews: sanitised, avg_rating, review_count: reviews.length });
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/[id]/reviews:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
