import { NextResponse } from "next/server";
import { fetchPriceDistribution } from "@/lib/priceDistribution";

// Thin HTTP wrapper. The query and its filter semantics live in
// lib/priceDistribution.js because the results server component calls it
// directly too — see the header there.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { status, body } = await fetchPriceDistribution(searchParams);
  const response = NextResponse.json(body, { status });
  if (status === 200) {
    // Cacheable per filter-combo at the edge — one cached response per distinct
    // query string (the #218 trade-off vs v1's one-for-everyone cache).
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );
  }
  return response;
}
