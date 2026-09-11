import { NextResponse } from "next/server";
import { fetchFaculties } from "@/lib/referenceData";

// Thin HTTP wrapper. The query lives in lib/referenceData.js because the
// results server component calls it directly too — see the header there.
export async function GET() {
  const { status, body } = await fetchFaculties();
  const response = NextResponse.json(body, { status });
  if (status === 200) {
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );
  }
  return response;
}
