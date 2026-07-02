// Calendar dates are passed around as "YYYY-MM-DD" strings. Internally we
// anchor to 12:00 UTC so day arithmetic can never slip across a DST boundary.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUTC(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const dt = toUTC(date);
  return !Number.isNaN(dt.getTime()) && fromUTC(dt) === date;
}

export function addDays(date: string, delta: number): string {
  const dt = toUTC(date);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return fromUTC(dt);
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Monday-based day index: Mon=0 … Sun=6 */
function mondayIndex(date: string): number {
  return (toUTC(date).getUTCDay() + 6) % 7;
}

export function isWeekday(date: string): boolean {
  return mondayIndex(date) < 5;
}

export function weekdayCount(from: string, to: string): number {
  return eachDate(from, to).filter(isWeekday).length;
}

export function mondayOf(date: string): string {
  return addDays(date, -mondayIndex(date));
}

/** ISO-8601 week key, e.g. "2026-W27". */
export function isoWeekKey(date: string): string {
  const thursday = toUTC(date);
  thursday.setUTCDate(thursday.getUTCDate() - mondayIndex(date) + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = `${isoYear}-01-04`;
  const week1Monday = toUTC(mondayOf(jan4));
  const week = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** "YYYY-MM" → [first day, last day] of that month. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12)); // day 0 of next month = last of this
  return [`${month}-01`, fromUTC(last)];
}

export function formatDate(date: string): string {
  return toUTC(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today's date in the server's local timezone. */
export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
