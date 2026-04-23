import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import {
  confirmationEmailHtml,
  confirmationEmailSubject,
} from '@/templates/email/confirmation';

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { email, label, filters, frequency } = body;

    if (!email || typeof email !== 'string' || !/^[^@]+@[^@]+\.[^@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
      return NextResponse.json({ error: 'filters must be an object' }, { status: 400 });
    }

    const freq = frequency === 'weekly' ? 'weekly' : 'daily';

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        email: email.trim().toLowerCase(),
        label: label?.trim() || null,
        filters,
        frequency: freq,
      })
      .select('id, unsubscribe_token')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to save search' }, { status: 500 });
    }

    // Send confirmation email (best-effort — don't fail the request if email fails)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.gr';
    const manageUrl = `${appUrl}/alerts/manage?token=${data.unsubscribe_token}`;

    try {
      const resend = getResend();
      await resend.emails.send({
        from: 'StudentX Alerts <alerts@studentx.gr>',
        to: email.trim().toLowerCase(),
        subject: confirmationEmailSubject(label?.trim()),
        html: confirmationEmailHtml({
          label: label?.trim(),
          manageUrl,
          frequency: freq,
        }),
      });
    } catch (emailErr) {
      console.error('Confirmation email error (non-fatal):', emailErr);
    }

    return NextResponse.json(
      { id: data.id, message: 'Alert saved. Check your inbox for confirmation.' },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unexpected error in POST /api/saved-searches:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
