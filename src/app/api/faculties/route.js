import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("faculties")
      .select("faculty_id, name, university")
      .order("university")
      .order("name");

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch faculties" },
        { status: 500 }
      );
    }

    const faculties = data.map((row) => ({
      id: row.faculty_id,
      name: row.name,
      university: row.university,
    }));

    const response = NextResponse.json({ faculties });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/faculties:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
