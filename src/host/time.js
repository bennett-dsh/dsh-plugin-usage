/**
 * Time helpers for usage bucketing — pure, dependency-free.
 * Granularity keys: 'day' | 'hour' | 'minute'.
 *
 * User-facing buckets (dayKey / alignFloor / bucketKeyFor non-day cases) use
 * LOCAL calendar time. dayIndex is a local-midnight-based ordinal used to
 * align step-day blocks. DST-consistent handling is owned by this module.
 */

export const DAY_MS = 86400000;

export function dayKey(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ordinal day number (local-midnight based), for step alignment. */
export function dayIndex(t) {
  return Math.floor(alignFloor(t, 'day') / DAY_MS);
}

/** Local-midnight epoch of the day whose dayIndex ordinal is `block`. */
function localMidnightForOrdinal(block) {
  let epoch = alignFloor(block * DAY_MS, 'day');
  let idx = Math.floor(epoch / DAY_MS);
  while (idx < block) {
    epoch = alignFloor(epoch + DAY_MS, 'day');
    idx = Math.floor(epoch / DAY_MS);
  }
  while (idx > block) {
    epoch = alignFloor(epoch - DAY_MS, 'day');
    idx = Math.floor(epoch / DAY_MS);
  }
  return epoch;
}

/** Bucket key for one instant under a granularity (day buckets may span stepDays). */
export function bucketKeyFor(t, g, stepDays) {
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'day') {
    // Single-day buckets are the local calendar day itself (DST-safe by construction).
    if (stepDays === 1) return dayKey(t);
    const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
    return dayKey(localMidnightForOrdinal(block));
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

/** Floor an instant to its stepDays block start (local midnight of the block's anchor day). */
export function alignBlock(t, stepDays) {
  if (stepDays === 1) return alignFloor(t, 'day');
  const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
  return localMidnightForOrdinal(block);
}

/**
 * Bucket key under a day granularity with a range-anchored step grid:
 * blocks start at the range's first day, so a custom range reads naturally
 * (e.g. 90 days -> 18 x 5-day buckets starting on the range's first day).
 */
export function stepDayKey(r, dayStart, stepDays) {
  return stepDayKeyFromDay(alignFloor(r.time, 'day'), dayStart, stepDays);
}

/** The same block key from a day's own local-midnight epoch (rollup cells). */
export function stepDayKeyFromDay(dayStartOfRecord, dayStart, stepDays) {
  const k = Math.floor((dayStartOfRecord - dayStart) / (stepDays * DAY_MS));
  return dayKey(dayStart + k * stepDays * DAY_MS);
}

/** Cap on zero-filled output buckets; beyond it we emit present-only buckets. */
export const MAX_BUCKETS = 2000;
