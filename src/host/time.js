/**
 * Time helpers for usage bucketing — pure, dependency-free.
 * Granularity keys: 'day' | 'hour' | 'minute'.
 *
 * User-facing buckets (dayKey / alignFloor / bucketKeyFor non-day cases) use
 * LOCAL calendar time. dayIndex (UTC-day ordinal) is used only to align
 * step-day blocks. DST-consistent handling is owned by this module.
 */

export const DAY_MS = 86400000;

export function dayKey(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ordinal day number (local calendar day -> UTC-day index), for step alignment. */
export function dayIndex(t) {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Bucket key for one instant under a granularity (day buckets may span stepDays). */
export function bucketKeyFor(t, g, stepDays) {
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'day') {
    const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
    const d = new Date(block * DAY_MS); // UTC midnight; UTC components == local calendar day
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const d = new Date(t);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = pad(d.getHours()) + ':' + (g === 'hour' ? '00' : pad(d.getMinutes()));
  return date + ' ' + hm;
}

export function stepMs(g) {
  return g === 'day' ? DAY_MS : g === 'hour' ? 3600000 : 60000;
}

/** Floor an instant to its granularity boundary. */
export function alignFloor(t, g) {
  const d = new Date(t);
  if (g === 'day') { d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (g === 'hour') { d.setMinutes(0, 0, 0); return d.getTime(); }
  d.setSeconds(0, 0);
  return d.getTime();
}

/** Floor an instant to its stepDays block start (UTC midnight of the block). */
export function alignBlock(t, stepDays) {
  const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
  return block * DAY_MS;
}

/**
 * Bucket key under a day granularity with a range-anchored step grid:
 * blocks start at the range's first day, so a custom range reads naturally
 * (e.g. 90 days -> 18 x 5-day buckets starting on the range's first day).
 */
export function stepDayKey(r, dayStart, stepDays) {
  const k = Math.floor((alignFloor(r.time, 'day') - dayStart) / (stepDays * DAY_MS));
  return dayKey(dayStart + k * stepDays * DAY_MS);
}

/** Cap on zero-filled output buckets; beyond it we emit present-only buckets. */
export const MAX_BUCKETS = 2000;
