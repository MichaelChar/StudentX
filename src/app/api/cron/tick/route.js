import { NextResponse } from 'next/server';
import { isCronAuthorized } from '../auth';
import { isJobDue } from '../cadence';
import { runRecomputeDistances } from '../jobs/recomputeDistances';
import { runMessageDigest } from '../jobs/messageDigest';
import { runSyntheticEnListing } from '../synthetic-en-listing/route';
import { runBookingExpiry } from '../jobs/bookingExpiry';
import { runBookingReminder } from '../jobs/bookingReminder';
import { runRefreshResponseTimes } from '../jobs/refreshResponseTimes';

// Per-job wall-clock cap inside the shared ~25s master-tick budget.
// Jobs run concurrently via Promise.allSettled, so wall time is
// max(job durations), not the sum. Digests finish in <2s; synthetic
// may burn most of this budget on heavy page SSR canaries.
const PER_JOB_TIMEOUT_MS = 20_000;

/**
 * Master-tick job registry.
 *
 * Each entry declares its own cadence; the single Cloudflare cron
 * (every 5 minutes → this route) runs whatever is due against the
 * wall clock. Adding a job is a one-line entry here — no wrangler
 * trigger change, no Free-plan cap slot.
 *
 * Cadences: '5m' | '15m' | 'daily@HH:MM' (see cadence.js).
 */
export const CRON_JOBS = [
  {
    name: 'recompute-distances',
    cadence: 'daily@09:15',
    handler: runRecomputeDistances,
  },
  {
    name: 'message-digest',
    cadence: '5m',
    handler: runMessageDigest,
  },
  {
    name: 'synthetic-en-listing',
    cadence: '15m',
    handler: runSyntheticEnListing,
  },
  // Booking MVP: rolling inactivity (2d expiry + one 24h landlord reminder).
  // No new Cloudflare triggers — Free plan caps at 5; master tick owns these.
  {
    name: 'booking-expiry',
    cadence: '5m',
    handler: runBookingExpiry,
  },
  {
    name: 'booking-reminder',
    cadence: '5m',
    handler: runBookingReminder,
  },
  // T4b: denormalise landlord first-response latency for /api/listings ranking.
  // No new Cloudflare trigger — Free plan caps at 5; master tick owns this.
  {
    name: 'refresh-response-times',
    cadence: 'daily@03:05',
    handler: runRefreshResponseTimes,
  },
];

/**
 * Race a job handler against a per-job timeout. The timeout rejects so
 * Promise.allSettled records it as a failure without aborting siblings.
 */
function runWithTimeout(handler, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`job timed out after ${ms}ms`));
    }, ms);

    Promise.resolve()
      .then(() => handler())
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
  });
}

/**
 * Run every registry job that is due at `now`. Exported for tests.
 *
 * @param {Date} [now]
 * @returns {Promise<{ due: string[], results: Array<object> }>}
 */
export async function runDueJobs(now = new Date()) {
  const due = CRON_JOBS.filter((job) => isJobDue(job.cadence, now));

  if (due.length === 0) {
    return { due: [], results: [] };
  }

  const settled = await Promise.allSettled(
    due.map(async (job) => {
      const startedAt = Date.now();
      try {
        const value = await runWithTimeout(job.handler, PER_JOB_TIMEOUT_MS);
        const durationMs = Date.now() - startedAt;
        // Handlers that return { ok: false } / { error } still count as
        // a completed run with a non-ok outcome for logging.
        const handlerFailed =
          value &&
          typeof value === 'object' &&
          (value.ok === false || (value.error && value.ok !== true));
        const outcome = handlerFailed ? 'failed' : 'ok';
        console.log(
          `[cron/tick] job=${job.name} outcome=${outcome} durationMs=${durationMs}`,
        );
        return {
          name: job.name,
          outcome,
          durationMs,
          result: value,
        };
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        const message = err?.message || String(err);
        console.error(
          `[cron/tick] job=${job.name} outcome=error durationMs=${durationMs} error=${message}`,
        );
        return {
          name: job.name,
          outcome: 'error',
          durationMs,
          error: message,
        };
      }
    }),
  );

  // allSettled never rejects the outer promise; map each slot to a
  // result object. The inner try/catch already converts throws into
  // outcome:'error', so rejected slots here would only be programmer
  // bugs in the wrapper — still surface them.
  const results = settled.map((slot, i) => {
    if (slot.status === 'fulfilled') return slot.value;
    const message = slot.reason?.message || String(slot.reason);
    const name = due[i]?.name ?? `job-${i}`;
    console.error(
      `[cron/tick] job=${name} outcome=error durationMs=? error=${message}`,
    );
    return { name, outcome: 'error', durationMs: null, error: message };
  });

  return {
    due: due.map((j) => j.name),
    results,
  };
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const { due, results } = await runDueJobs(now);

  const anyFailed = results.some(
    (r) => r.outcome === 'failed' || r.outcome === 'error',
  );

  console.log(
    `[cron/tick] tick complete at=${now.toISOString()} due=${due.join(',') || '(none)'} failed=${anyFailed}`,
  );

  return NextResponse.json({
    ok: !anyFailed,
    at: now.toISOString(),
    due,
    results: results.map(({ name, outcome, durationMs, error }) => ({
      name,
      outcome,
      durationMs,
      ...(error ? { error } : {}),
    })),
  });
}
