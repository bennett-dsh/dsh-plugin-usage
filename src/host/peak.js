/**
 * Peak / off-peak classification for DeepSeek's two-tier list price.
 *
 * The rule is DeepSeek's own, restated in the base time zone so the
 * holiday table (which is published per Chinese calendar day) and the
 * weekday test agree on what "a day" means:
 *
 *   北京时间周一至周五（不含中国法定节假日）9:00-12:00、14:00-18:00 为高峰时段；
 *   其余时段，包括周末及中国法定节假日全天均为空闲时段。
 *
 * Equivalences worth knowing before touching this file:
 *  - `Asia/Shanghai` has been a fixed UTC+8 offset with no DST since 1991, so
 *    `atMs + 8h` read through `getUTC*()` *is* Beijing wall-clock time. No
 *    Intl/DateTimeFormat and no time-zone database are involved.
 *  - DeepSeek's own wording is "01:00-04:00 and 06:00-10:00 UTC, Monday through
 *    Friday": those UTC windows map one-to-one onto 09:00-12:00 and
 *    14:00-18:00 Beijing, and neither window crosses a UTC day boundary, so
 *    the weekday test is identical in both frames.
 *  - A 调休 workday (a Saturday/Sunday declared a working day) is still a
 *    weekend here: the rule above lists weekdays explicitly and carves out
 *    only public holidays, so a make-up Saturday stays off-peak.
 */

import { PUBLIC_HOLIDAYS } from './holidays.js';

/** Beijing-time hour windows that bill at the peak rate, `[start, end)`. */
export const PEAK_WINDOWS = [
  [9, 12],
  [14, 18],
];

/**
 * Whether a Beijing date is a Chinese public holiday (all day off-peak).
 *
 * Lives here, next to the rule that needs it, so the peak test and the price
 * display cannot disagree about what a holiday is — they did once: the fold
 * called `isPeak()` without a calendar while `priceRow` used the full one, so a
 * National Day call was billed at the peak rate and shown as off-peak.
 *
 * @param {string} date - `YYYY-MM-DD`, Beijing.
 * @returns {boolean} true when the generated calendar lists that date.
 */
export function holidayOf(date) {
  const dates = PUBLIC_HOLIDAYS.dates;
  return typeof date === 'string' && Object.prototype.hasOwnProperty.call(dates, date);
}

/** The calendar's coverage metadata (which years are known), for the UI note. */
export function holidayCoverage() {
  return PUBLIC_HOLIDAYS.years;
}

/** Milliseconds in one hour. */
const HOUR_MS = 3_600_000;

/** Beijing is UTC+8, always. */
const BEIJING_OFFSET_MS = 8 * HOUR_MS;

/**
 * Beijing wall-clock parts of an instant.
 *
 * @param {number} atMs - epoch milliseconds.
 * @returns {{ year: number, month: number, day: number, weekday: number, hour: number, minute: number, date: string }}
 *   `weekday` is 0=Sunday..6=Saturday; `month` is 1-based; `date` is `YYYY-MM-DD`.
 */
export function beijingParts(atMs) {
  const d = new Date(atMs + BEIJING_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return {
    year,
    month,
    day,
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    date: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/**
 * Whether an instant falls inside a peak window, ignoring the calendar.
 *
 * Exported separately so a test can compare the window arithmetic against the
 * calendar rules without needing a holiday table.
 *
 * @param {number} atMs - epoch milliseconds.
 * @returns {boolean} true inside `[start, end)` of any peak window.
 */
export function inPeakWindow(atMs) {
  const { hour, minute } = beijingParts(atMs);
  const t = hour + minute / 60;
  return PEAK_WINDOWS.some(([start, end]) => t >= start && t < end);
}

/**
 * Whether an instant bills at DeepSeek's peak rate.
 *
 * @param {number} atMs - epoch milliseconds of the billed settlement.
 * @param {(date: string) => boolean} [isHoliday] - holiday test; DEFAULTS to the
 *   generated calendar. It used to default to "no holidays known", which let a
 *   caller bill a public holiday at the peak rate by forgetting the argument.
 * @returns {boolean} true for peak.
 */
export function isPeak(atMs, isHoliday = holidayOf) {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
  const { weekday, date } = beijingParts(atMs);
  if (weekday === 0 || weekday === 6) return false;
  if (!inPeakWindow(atMs)) return false;
  return typeof isHoliday === 'function' ? !isHoliday(date) : true;
}
