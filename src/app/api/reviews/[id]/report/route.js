import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("reviews")
      .update({ reported: true })
      .eq("review_id", id);

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Review not found" }, { status: 404 });
      }
      console.error("Supabase update error:", error);
      return NextResponse.json({ error: "Failed to report review" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in POST /api/reviews/[id]/report:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
