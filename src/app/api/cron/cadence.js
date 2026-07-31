/**
 * Pure wall-clock dueness for master-tick job cadences.
 *
 * No persistent scheduler state — a job is due when the current UTC
 * minute (and hour, for daily) matches its cadence. The master tick
 * fires every 5 minutes, so boundary minutes are exact.
 *
 * Supported cadences:
 *   '5m'           — every 5 minutes  (minute % 5 === 0)
 *   '15m'          — every 15 minutes (minute % 15 === 0)
 *   'daily@HH:MM'  — once daily at that UTC hour:minute
 *
 * @param {string} cadence
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isJobDue(cadence, now = new Date()) {
  if (typeof cadence !== 'string' || !cadence) return false;

  const minutes = now.getUTCMinutes();
  const hours = now.getUTCHours();

  if (cadence === '5m') {
    return minutes % 5 === 0;
  }

  if (cadence === '15m') {
    return minutes % 15 === 0;
  }

  const dailyMatch = /^daily@(\d{1,2}):(\d{2})$/.exec(cadence);
  if (dailyMatch) {
    const targetHour = Number(dailyMatch[1]);
    const targetMinute = Number(dailyMatch[2]);
    if (
      !Number.isInteger(targetHour) ||
      !Number.isInteger(targetMinute) ||
      targetHour < 0 ||
      targetHour > 23 ||
      targetMinute < 0 ||
      targetMinute > 59
    ) {
      return false;
    }
    return hours === targetHour && minutes === targetMinute;
  }

  return false;
}
