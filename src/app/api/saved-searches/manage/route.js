import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

function getToken(request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get('token');
}

export async function GET(request) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, label, filters, frequency, created_at, is_active')
    .eq('unsubscribe_token', token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('saved_searches')
    .update({ is_active: false })
    .eq('unsubscribe_token', token);

  if (error) {
    console.error('Supabase update error:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Unsubscribed successfully' });
}
