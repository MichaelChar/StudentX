import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("location")
      .select("neighborhood")
      .order("neighborhood");

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json({ error: "Failed to fetch neighborhoods" }, { status: 500 });
    }

    // Deduplicate
    const unique = [...new Set(data.map((r) => r.neighborhood))].sort();

    const response = NextResponse.json({ neighborhoods: unique });
    response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/neighborhoods:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
