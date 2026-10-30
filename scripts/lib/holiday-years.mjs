/**
 * Which years of Chinese public holidays the plugin ships.
 *
 * The peak rule needs every year the usage statistics can reach, plus one year
 * forward (the State Council publishes the next arrangement in November, so the
 * coming year is exactly the one a dashboard must already answer for). Getting
 * the span from the data instead of from "today ± 1" is what keeps an old
 * session — 2024 usage, say — from being billed at the peak rate on a holiday
 * simply because its year was never fetched.
 *
 * Pure functions only: the generator imports them, tests import them, and the
 * filesystem walk is injected so a test can hand in a fake tree.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Beijing wall-clock year of an instant (the calendar is published per Beijing date). */
export function beijingYear(atMs) {
  return new Date(atMs + 8 * 3_600_000).getUTCFullYear()
}

/**
 * The year span to fetch.
 *
 * @param {{ usageFromMs?: number, usageToMs?: number, nowMs?: number }} input
 *   `usageFromMs`/`usageToMs` bound the dates the usage statistics can contain
 *   (absent when no session store was found).
 * @returns {{ from: number, to: number, usedUsage: boolean }} inclusive year span.
 */
export function holidaySpan(input = {}) {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now()
  const nowYear = beijingYear(nowMs)
  const hasUsage = Number.isFinite(input.usageFromMs) && Number.isFinite(input.usageToMs)
  if (!hasUsage) return { from: nowYear - 1, to: nowYear + 1, usedUsage: false }
  // A session file's mtime is its LAST write, so the oldest session may have
  // started up to a year before it: the past side gets a year of slack.
  const from = Math.min(beijingYear(input.usageFromMs) - 1, nowYear - 1)
  // Forward is exact: cover the latest usage year and always one year beyond it.
  const to = Math.max(beijingYear(input.usageToMs), nowYear) + 1
  return { from, to, usedUsage: true }
}

/**
 * Earliest/latest mtime of the session files below `root`.
 *
 * Session logs are the usage statistics' own source, so their dates are the
 * cheapest honest bound on "every date the dashboard can show".
 *
 * @param {string} root - sessions directory.
 * @param {{ readdir?: Function, stat?: Function, isSessionFile?: (name: string) => boolean }} [io]
 * @returns {{ fromMs: number, toMs: number, files: number } | null} null when nothing matched.
 */
export function sessionSpan(root, io = {}) {
  const readdir = io.readdir ?? readdirSync
  const stat = io.stat ?? statSync
  const isSessionFile = io.isSessionFile ?? ((name) => name.startsWith('session') && name.includes('.jsonl'))
  let fromMs = Infinity
  let toMs = -Infinity
  let files = 0
  const walk = (dir) => {
    let entries
    try {
      entries = readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory && entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.isFile || !entry.isFile() || !isSessionFile(entry.name)) continue
      let info
      try {
        info = stat(path)
      } catch {
        continue
      }
      if (!info || !Number.isFinite(info.mtimeMs)) continue
      files += 1
      if (info.mtimeMs < fromMs) fromMs = info.mtimeMs
      if (info.mtimeMs > toMs) toMs = info.mtimeMs
    }
  }
  walk(root)
  return files === 0 ? null : { fromMs, toMs, files }
}

/**
 * Fold one year of holiday-cn data into the accumulated calendar.
 *
 * A year whose `days` array is empty is RECORDED as `unpublished` rather than
 * dropped: the runtime must be able to say "2027 is not published yet" instead
 * of silently treating it as a year with no holidays (which would bill a
 * holiday at the peak rate and never mention why).
 *
 * @param {{ dates: Record<string, string>, years: Record<string, object> }} acc - accumulator.
 * @param {number} year - calendar year.
 * @param {unknown} payload - parsed `holiday-cn/<year>.json`.
 * @returns {{ dates: Record<string, string>, years: Record<string, object> }} the same accumulator.
 */
export function mergeHolidayYear(acc, year, payload) {
  const days = payload && Array.isArray(payload.days) ? payload.days : []
  const off = days.filter((d) => d && d.isOffDay === true && typeof d.date === 'string')
  if (off.length === 0) {
    acc.years[year] = {
      unpublished: true,
      offDays: 0,
      first: null,
      last: null,
      papers: payload && Array.isArray(payload.papers) ? payload.papers : [],
    }
    return acc
  }
  for (const day of off) acc.dates[day.date] = day.name || 'holiday'
  const covered = off.map((d) => d.date).sort()
  acc.years[year] = {
    offDays: off.length,
    first: covered[0] || null,
    last: covered[covered.length - 1] || null,
    papers: payload && Array.isArray(payload.papers) ? payload.papers : [],
  }
  return acc
}

/**
 * Years whose arrangement is not published yet, in ascending order.
 *
 * @param {Record<string, { unpublished?: boolean }>} years - the generated metadata.
 * @returns {number[]} unpublished years.
 */
export function unpublishedYears(years) {
  return Object.entries(years || {})
    .filter(([, info]) => info && info.unpublished === true)
    .map(([year]) => Number(year))
    .sort((a, b) => a - b)
}
