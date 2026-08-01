import { NextResponse } from 'next/server';
import { isCronAuthorized } from '../auth';
import { runStudentMessageDigest } from '../jobs/studentMessageDigest';

// Thin wrapper: preserved so manual-trigger curl commands still work.
// Production scheduling goes through /api/cron/tick → message-digest
// (landlord + student merged). This path still runs the student half only.

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runStudentMessageDigest();
  if (result?.error && result.ok === false) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 },
    );
  }
  return NextResponse.json(result);
}
