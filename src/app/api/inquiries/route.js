import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getResend } from "@/lib/resend";
import { inquiryEmailHtml, inquiryEmailSubject } from "@/templates/email/inquiry";

// Match the verified sender used by src/app/api/cron/saved-searches-digest/route.js
// so we don't silently fail at Resend due to an unverified domain identity.
const FROM_ADDRESS = "StudentX <alerts@studentx.gr>";

// Defense-in-depth caps. The downstream email template escapes HTML, so XSS
// is already mitigated, but unbounded input is a DoS / oversized-payload
// vector and pollutes the landlord inbox. Caps are generous to avoid false
// rejections on legitimate inquiries.
const MAX_NAME_LEN = 200;
const MAX_EMAIL_LEN = 320; // RFC 5321 max
const MAX_PHONE_LEN = 30;
const MAX_MESSAGE_LEN = 4000;
const MAX_LISTING_ID_LEN = 64;
const MAX_FACULTY_ID_LEN = 64;

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") || null;
}

// The inquiry email is landlord-facing, so we render in the landlord's
// preferred_locale (added to `landlords` in migration 023). For legacy rows
// or any oddity that returns null, fall back to the inquirer's Accept-Language
// (still better than English-only), then to 'el' since Thessaloniki is the
// primary market.
function resolveLandlordEmailLocale(request, landlord) {
  if (landlord?.preferred_locale === "el" || landlord?.preferred_locale === "en") {
    return landlord.preferred_locale;
  }
  const header = request.headers.get("accept-language") || "";
  const tags = header
    .split(",")
    .map((t) => t.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag === "el" || tag.startsWith("el-")) return "el";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return "el";
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { listing_id, student_name, student_email, student_phone, message, faculty_id, website } = body;

    // Honeypot: bots tend to fill every field. Real users never see `website`.
    // Pretend success so bots don't learn to bypass.
    if (typeof website === "string" && website.trim().length > 0) {
      return NextResponse.json({ inquiry_id: "blocked" }, { status: 201 });
    }

    if (!listing_id || typeof listing_id !== "string" || listing_id.length > MAX_LISTING_ID_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "listing_id is required" },
        { status: 400 }
      );
    }
    if (!student_name || typeof student_name !== "string" || student_name.trim().length === 0) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "student_name is required" },
        { status: 400 }
      );
    }
    if (student_name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: `student_name must be at most ${MAX_NAME_LEN} characters` },
        { status: 400 }
      );
    }
    if (!student_email || typeof student_email !== "string") {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "student_email is required" },
        { status: 400 }
      );
    }
    if (student_email.length > MAX_EMAIL_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: `student_email must be at most ${MAX_EMAIL_LEN} characters` },
        { status: 400 }
      );
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(student_email)) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "student_email is invalid" },
        { status: 400 }
      );
    }
    if (typeof student_phone === "string" && student_phone.length > MAX_PHONE_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: `student_phone must be at most ${MAX_PHONE_LEN} characters` },
        { status: 400 }
      );
    }
    if (typeof faculty_id === "string" && faculty_id.length > MAX_FACULTY_ID_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: `faculty_id must be at most ${MAX_FACULTY_ID_LEN} characters` },
        { status: 400 }
      );
    }
    if (!message || typeof message !== "string" || message.trim().length < 10) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: "message must be at least 10 characters" },
        { status: 400 }
      );
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { error_code: "INVALID_INPUT", error: `message must be at most ${MAX_MESSAGE_LEN} characters` },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const submitterIp = getClientIp(request);

    const cleanName = student_name.trim();
    const cleanEmail = student_email.trim().toLowerCase();
    const cleanPhone =
      typeof student_phone === "string" && student_phone.trim().length > 0
        ? student_phone.trim()
        : null;
    const cleanFacultyId =
      typeof faculty_id === "string" && faculty_id.trim().length > 0 ? faculty_id.trim() : null;
    const cleanListingId = listing_id.trim();

    // All inquiry writes go through the SECURITY DEFINER RPC. It enforces:
    //   - LISTING_NOT_FOUND   (P0002) → 404
    //   - RATE_LIMITED        (P0003) → 429  (5 inquiries / IP / hour)
    //   - CAP_EXCEEDED        (P0001) → 403  (free-tier 10 / listing)
    const { data: inquiryId, error: rpcError } = await supabase.rpc("submit_inquiry", {
      p_listing_id: cleanListingId,
      p_student_name: cleanName,
      p_student_email: cleanEmail,
      p_student_phone: cleanPhone,
      p_message: message.trim(),
      p_faculty_id: cleanFacultyId,
      p_submitter_ip: submitterIp,
    });

    if (rpcError) {
      switch (rpcError.code) {
        case "P0002":
          return NextResponse.json(
            { error_code: "LISTING_NOT_FOUND", error: "Listing not found" },
            { status: 404 }
          );
        case "P0003":
          return NextResponse.json(
            {
              error_code: "RATE_LIMITED",
              error: "Too many inquiries from this network. Try again in an hour.",
            },
            { status: 429 }
          );
        case "P0001":
          return NextResponse.json(
            {
              error_code: "CAP_EXCEEDED",
              error: "This listing has reached the maximum number of inquiries for the free tier.",
            },
            { status: 403 }
          );
        default:
          console.error("submit_inquiry RPC error:", rpcError);
          return NextResponse.json(
            { error_code: "INTERNAL", error: "Failed to submit inquiry" },
            { status: 500 }
          );
      }
    }

    // Notify the landlord. Never fail the request if email fails — the inquiry is in the DB,
    // and email_sent_at lets us retry/backfill later.
    try {
      const { data: listing } = await supabase
        .from("listings")
        .select(`
          listing_id,
          location ( address, neighborhood ),
          rent ( monthly_price ),
          landlords ( name, email, preferred_locale )
        `)
        .eq("listing_id", cleanListingId)
        .single();

      const landlord = Array.isArray(listing?.landlords) ? listing.landlords[0] : listing?.landlords;
      const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
      const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;

      if (landlord?.email) {
        let facultyName = null;
        if (cleanFacultyId) {
          const { data: faculty } = await supabase
            .from("faculties")
            .select("name")
            .eq("faculty_id", cleanFacultyId)
            .single();
          facultyName = faculty?.name ?? null;
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studentx.gr";
        const listingSummary = [location?.address, location?.neighborhood]
          .filter(Boolean)
          .join(" · ");
        const emailLocale = resolveLandlordEmailLocale(request, landlord);

        await getResend().emails.send({
          from: FROM_ADDRESS,
          to: landlord.email,
          replyTo: cleanEmail,
          subject: inquiryEmailSubject(cleanName, listingSummary, emailLocale),
          html: inquiryEmailHtml({
            landlordName: landlord.name,
            student: {
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              faculty: facultyName,
            },
            message: message.trim(),
            listing: {
              listing_id: cleanListingId,
              address: location?.address,
              neighborhood: location?.neighborhood,
              monthly_price: rent?.monthly_price,
            },
            appUrl,
            locale: emailLocale,
          }),
        });

        await supabase.rpc("mark_inquiry_email_sent", { p_inquiry_id: inquiryId });
      } else {
        console.warn(
          `Inquiry ${inquiryId}: no landlord email on file for listing ${cleanListingId}`
        );
      }
    } catch (emailError) {
      console.error("Failed to send landlord notification email:", emailError);
      // Swallow — inquiry persisted, retry can be done out-of-band.
    }

    return NextResponse.json({ inquiry_id: inquiryId }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/inquiries:", err);
    return NextResponse.json(
      { error_code: "INTERNAL", error: "Internal server error" },
      { status: 500 }
    );
  }
}
