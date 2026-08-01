import { NextResponse } from 'next/server';
import { isCronAuthorized } from '../auth';
import { runRecomputeDistances } from '../jobs/recomputeDistances';

// Thin wrapper: preserved so manual-trigger curl commands in CLAUDE.md
// still work. The master tick registry invokes the same handler.
// Triggered by /api/cron/tick (cadence daily@09:15).

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runRecomputeDistances();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
