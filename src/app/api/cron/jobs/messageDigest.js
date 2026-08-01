import { runLandlordMessageDigest } from './landlordMessageDigest';
import { runStudentMessageDigest } from './studentMessageDigest';

/**
 * Merged message digest: landlord + student audiences in one registry job.
 * The old 2-minute offset between the two is dropped; both run on every
 * 5-minute tick that the master dispatcher selects this job for.
 *
 * Audiences run concurrently — one side's failure must not block the other.
 */
export async function runMessageDigest() {
  const [landlord, student] = await Promise.allSettled([
    runLandlordMessageDigest(),
    runStudentMessageDigest(),
  ]);

  const landlordResult =
    landlord.status === 'fulfilled'
      ? landlord.value
      : { ok: false, error: landlord.reason?.message || String(landlord.reason) };
  const studentResult =
    student.status === 'fulfilled'
      ? student.value
      : { ok: false, error: student.reason?.message || String(student.reason) };

  const anyFailed =
    landlord.status === 'rejected' ||
    student.status === 'rejected' ||
    landlordResult?.ok === false ||
    studentResult?.ok === false ||
    Boolean(landlordResult?.error) ||
    Boolean(studentResult?.error);

  return {
    ok: !anyFailed,
    landlord: landlordResult,
    student: studentResult,
  };
}
