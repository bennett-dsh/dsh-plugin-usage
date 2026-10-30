/**
 * The holiday calendar's year span.
 *
 * The peak/off-peak rule needs a holiday for every date the usage statistics can
 * contain, plus one year forward (the next arrangement appears in November). The
 * span therefore comes from the usage data, not from "today ± 1": a dashboard
 * with 2024 sessions must ship 2024 holidays, or those holidays get billed at
 * the peak rate. These tests pin the span rules and the "unpublished year must be
 * recorded, not dropped" contract.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  beijingYear,
  holidaySpan,
  mergeHolidayYear,
  sessionSpan,
  unpublishedYears,
} from '../scripts/lib/holiday-years.mjs'

const at = (iso) => Date.parse(iso)

test('beijingYear reads the calendar year in Beijing, not UTC', () => {
  // 2026-12-31T16:00Z is already 2027-01-01 in Beijing.
  assert.equal(beijingYear(at('2026-12-31T16:00:00Z')), 2027)
  assert.equal(beijingYear(at('2026-12-31T15:59:59Z')), 2026)
})

test('with usage data the span covers every usage year and one year forward', () => {
  const span = holidaySpan({
    usageFromMs: at('2024-03-01T00:00:00Z'),
    usageToMs: at('2026-08-01T00:00:00Z'),
    nowMs: at('2026-10-29T00:00:00Z'),
  })
  assert.equal(span.usedUsage, true)
  // 2024 sessions: the file mtime is the last write, so the past side gets a
  // year of slack — 2023 is fetched even though no file says 2023.
  assert.equal(span.from, 2023)
  assert.equal(span.to, 2027, 'latest usage 2026 + 1')
})

test('a stale dashboard still covers next year', () => {
  // Usage ends in 2024, but "now" is 2026: the coming year must still be known.
  const span = holidaySpan({
    usageFromMs: at('2024-01-05T00:00:00Z'),
    usageToMs: at('2024-06-01T00:00:00Z'),
    nowMs: at('2026-10-29T00:00:00Z'),
  })
  assert.equal(span.from, 2023)
  assert.equal(span.to, 2027)
})

test('without usage data the span is last year through next year', () => {
  const span = holidaySpan({ nowMs: at('2026-10-29T00:00:00Z') })
  assert.equal(span.usedUsage, false)
  assert.deepEqual([span.from, span.to], [2025, 2027])
})

test('sessionSpan finds the oldest and newest session files', () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-sessions-'))
  try {
    mkdirSync(join(root, '--E-FXS-Data--', 'session-a'), { recursive: true })
    mkdirSync(join(root, '--E-FXS-Data--', 'session-b'), { recursive: true })
    const oldFile = join(root, '--E-FXS-Data--', 'session-a', 'session.v4.jsonl.zstd')
    const newFile = join(root, '--E-FXS-Data--', 'session-b', 'session.v4.jsonl.zstd')
    writeFileSync(oldFile, 'x')
    writeFileSync(newFile, 'x')
    utimesSync(oldFile, new Date('2024-03-02T00:00:00Z'), new Date('2024-03-02T00:00:00Z'))
    utimesSync(newFile, new Date('2026-08-09T00:00:00Z'), new Date('2026-08-09T00:00:00Z'))
    // A non-session file must not count.
    writeFileSync(join(root, 'notes.txt'), 'x')
    utimesSync(join(root, 'notes.txt'), new Date('2019-01-01T00:00:00Z'), new Date('2019-01-01T00:00:00Z'))

    const span = sessionSpan(root)
    assert.ok(span, 'two session files were found');
    assert.equal(span.files, 2);
    assert.equal(new Date(span.fromMs).toISOString(), '2024-03-02T00:00:00.000Z')
    assert.equal(new Date(span.toMs).toISOString(), '2026-08-09T00:00:00.000Z')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('sessionSpan returns null when there is nothing to scan', () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-sessions-empty-'))
  try {
    assert.equal(sessionSpan(root), null)
    assert.equal(sessionSpan(join(root, 'missing')), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unpublished year is recorded, not dropped', () => {
  const acc = { dates: {}, years: {} }
  mergeHolidayYear(acc, 2026, {
    days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }],
    papers: ['p1'],
  })
  mergeHolidayYear(acc, 2027, { days: [], papers: [] })
  assert.deepEqual(acc.dates, { '2026-01-01': '元旦' })
  assert.equal(acc.years[2026].offDays, 1)
  assert.equal(acc.years[2027].unpublished, true);
  assert.deepEqual(unpublishedYears(acc.years), [2027])
})

test('a published year clears nothing it should keep', () => {
  const acc = { dates: {}, years: {} }
  mergeHolidayYear(acc, 2025, { days: [{ date: '2025-10-01', name: '国庆节', isOffDay: true }] })
  mergeHolidayYear(acc, 2025, { days: [] }) // a later empty payload must not invent holidays
  assert.deepEqual(acc.dates, { '2025-10-01': '国庆节' })
  assert.equal(acc.years[2025].unpublished, true, 'the year is re-labelled unpublished')
})
