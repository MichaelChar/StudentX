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

    const { listing_id, student_name, student_email, student_phone, message, faculty_id } = body;

    // Validate required fields
    if (!listing_id || typeof listing_id !== "string") {
      return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
    }
    if (!student_name || typeof student_name !== "string" || student_name.trim().length === 0) {
      return NextResponse.json({ error: "student_name is required" }, { status: 400 });
    }
    if (!student_email || typeof student_email !== "string") {
      return NextResponse.json({ error: "student_email is required" }, { status: 400 });
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(student_email)) {
      return NextResponse.json({ error: "student_email is invalid" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || message.trim().length < 10) {
      return NextResponse.json(
        { error: "message must be at least 10 characters" },
        { status: 400 }
      );
    }

    const insertData = {
      listing_id: listing_id.trim(),
      student_name: student_name.trim(),
      student_email: student_email.trim().toLowerCase(),
      message: message.trim(),
    };

    if (student_phone && typeof student_phone === "string" && student_phone.trim().length > 0) {
      insertData.student_phone = student_phone.trim();
    }

    if (faculty_id && typeof faculty_id === "string" && faculty_id.trim().length > 0) {
      insertData.faculty_id = faculty_id.trim();
    }

    const { data, error } = await getSupabase()
      .from("inquiries")
      .insert(insertData)
      .select("inquiry_id")
      .single();

    if (error) {
      if (error.code === "23503") {
        // Foreign key violation — listing_id doesn't exist
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Failed to submit inquiry" }, { status: 500 });
    }

    // TODO: trigger email notification to landlord via Resend/SendGrid/Supabase Edge Function

    return NextResponse.json({ inquiry_id: data.inquiry_id }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/inquiries:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
