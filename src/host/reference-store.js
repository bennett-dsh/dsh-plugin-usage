/**
 * Where a user-fetched reference table is kept between runs.
 *
 * Not in the plugin config: the table is ~120 KB of generated data, and the
 * settings form is a form — writing a catalogue into it would put a 120 KB value
 * through `settings.update` on every save and render it in the plugin's config
 * row. The folded-records cache next door (fold-cache.js) set the precedent:
 * machine-local derived data belongs under `<dsh home>/cache/dsh-plugin-usage/`.
 *
 * The bundle stays the source of truth for a fresh install: a missing or broken
 * file is simply "no fetched table", and the plugin prices from `prices.js`.
 *
 * Safety, in the same order fold-cache uses:
 *  - a stored table is re-validated on read (`validateReferenceTable`), so a
 *    truncated write or an older shape degrades to the bundled table;
 *  - every failure is `null`, never a throw: this runs during activation, where
 *    an exception would take the whole plugin down;
 *  - writes are atomic (temp + rename), so an interrupted save cannot leave half
 *    a table behind.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { validateHolidayCalendar, validateReferenceTable } from './reference-parse.js';

/**
 * Bump when the stored payload shape changes (not when prices change — the
 * table's own `capturedAt` covers that). A stored payload of another version is
 * discarded rather than migrated.
 *
 * v2 (2026-11-19): the price table and the holiday calendar are stored together,
 * in one atomic write. They are fetched in one pass and the peak rule needs both,
 * so a file that carried a new table with an old calendar would be a wrong answer
 * that looks fresh.
 */
export const REFERENCE_STORE_VERSION = 2;

/** `<dsh home>/cache/dsh-plugin-usage/reference`; `DSH_HOME` wins for tests. */
export function referenceCacheDir(home) {
  const root = home || process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(root, 'cache', 'dsh-plugin-usage', 'reference');
}

function tablePath(dir) {
  return join(dir, 'table.json');
}

/**
 * Read the stored reference data.
 *
 * @param {string} [home] - DSH home override (tests).
 * @returns {Promise<{ table: object, calendar: object|null, savedAt: string|null } | null>}
 *   the stored payload, or null when nothing usable is stored.
 */
export async function readFetchedTable(home) {
  let text;
  try {
    text = await readFile(tablePath(referenceCacheDir(home)), 'utf8');
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.version !== REFERENCE_STORE_VERSION) return null;
  const table = payload.table;
  if (!table || typeof table !== 'object') return null;
  if (validateReferenceTable(table).length > 0) return null;
  // A calendar that fails its gate is dropped, not fatal: the table is still worth
  // keeping, and the bundled calendar keeps the peak rule honest.
  const calendar = payload.calendar && validateHolidayCalendar(payload.calendar).length === 0 ? payload.calendar : null;
  return { table, calendar, savedAt: typeof payload.savedAt === 'string' ? payload.savedAt : null };
}

/**
 * Store the data a refresh just produced (one atomic write for both halves).
 *
 * @param {{ table: object, calendar?: object|null }} data - already validated.
 * @param {string} [home] - DSH home override (tests).
 * @returns {Promise<boolean>} whether it landed on disk.
 */
export async function writeFetchedTable(data, home) {
  const table = data && data.table;
  if (!table || validateReferenceTable(table).length > 0) return false;
  const calendar = data.calendar && validateHolidayCalendar(data.calendar).length === 0 ? data.calendar : null;
  const dir = referenceCacheDir(home);
  try {
    await mkdir(dir, { recursive: true });
    const path = tablePath(dir);
    const temp = path + '.tmp';
    await writeFile(temp, JSON.stringify({
      version: REFERENCE_STORE_VERSION,
      savedAt: new Date().toISOString(),
      table,
      calendar,
    }));
    await rename(temp, path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget the stored table (「恢复内置价目表」).
 *
 * @param {string} [home] - DSH home override (tests).
 * @returns {Promise<boolean>} whether anything was removed.
 */
export async function clearFetchedTable(home) {
  try {
    await unlink(tablePath(referenceCacheDir(home)));
    return true;
  } catch {
    return false;
  }
}
