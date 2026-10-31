/**
 * Fold cache: the folded records of one session, kept on disk between runs.
 *
 * Why this exists: the plugin keeps its index in memory, so every restart folded
 * the whole persisted history again. Measured on this machine (2026-10-29):
 * 258 sessions, 404 MB compressed, 1.35 GB / 574k lines after inflation — 12.5 s
 * just to read and inflate, before parsing and folding. A cache turns an
 * unchanged session into a single JSON read.
 *
 * Layout: one file per session under `<dsh home>/cache/dsh-plugin-usage/fold/`.
 * One file per session, not one big file, because the slow scan rewrites only
 * the sessions that changed.
 *
 * Safety, in order of importance:
 *  - a cache entry is keyed by the backend's own change token (`revision`), so an
 *    appended log always misses and is re-folded;
 *  - the signature carries FOLD_CACHE_VERSION and the holiday calendar's
 *    `capturedAt` — a cached `tokens.peak`/`tokens.off` split is only valid for the
 *    calendar that produced it, and a fold-rule change must not be papered over;
 *  - every failure is a miss, never a throw: a broken cache degrades to the
 *    full scan it replaces.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { PUBLIC_HOLIDAYS } from './holidays.js'

/**
 * Bump when the shape of a folded record changes (fields added/removed, tokens
 * split differently). Not a nice-to-have: a stale entry would be served as if it
 * were freshly folded.
 */
export const FOLD_CACHE_VERSION = 1

/** Everything a cached record depends on beyond the session log itself. */
export function foldSignature() {
  return FOLD_CACHE_VERSION + ':' + (PUBLIC_HOLIDAYS.capturedAt || 'no-calendar')
}

/** Where the per-session files live; `DSH_HOME` wins so tests can redirect it. */
export function cacheDir(home) {
  const root = home || process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(root, 'cache', 'dsh-plugin-usage', 'fold')
}

/** File name for one session. Ids are opaque; encode so no separator can escape. */
function entryPath(dir, id) {
  return join(dir, encodeURIComponent(id) + '.json')
}

/**
 * Read one session's entry.
 *
 * Asynchronous on purpose: this runs for every session in a pass, on the host's
 * only thread, and a synchronous read of 258 entries blocked every other fiber
 * (agent loops included) for the duration.
 *
 * @param {string} dir - cache directory.
 * @param {string} id - session id.
 * @returns {Promise<{ revision?: string, watermark: number, records: unknown[] } | null>}
 *   the entry, or null when absent/unreadable/stale-shaped.
 */
export async function readEntry(dir, id) {
  let text
  try {
    text = await readFile(entryPath(dir, id), 'utf8')
  } catch {
    return null
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  if (payload.sig !== foldSignature()) return null;
  if (!Array.isArray(payload.records)) return null;
  if (typeof payload.watermark !== 'number' || !Number.isFinite(payload.watermark)) return null
  return { revision: payload.revision, watermark: payload.watermark, records: payload.records }
}

/**
 * Write one session's entry (atomic: temp file then rename).
 *
 * Asynchronous for the same reason as the read: a cold pass rewrote every session
 * (135 ms for 258 sessions on this machine) with the host thread blocked.
 *
 * @param {string} dir - cache directory.
 * @param {string} id - session id.
 * @param {{ revision?: string, watermark: number, records: unknown[] }} entry
 * @returns {Promise<boolean>} whether the file was written.
 */
export async function writeEntry(dir, id, entry) {
  if (!Array.isArray(entry && entry.records)) return false
  try {
    await mkdir(dir, { recursive: true })
    const path = entryPath(dir, id)
    const temp = path + '.tmp'
    await writeFile(temp, JSON.stringify({
      sig: foldSignature(),
      revision: entry.revision,
      watermark: entry.watermark,
      records: entry.records,
    }))
    await rename(temp, path)
    return true
  } catch {
    return false
  }
}

/**
/*
 * There is deliberately no prune().
 *
 * `sp.list()` returns a PARTIAL list while the session store warms up after a
 * start, so "absent from this listing" does not mean "gone". Pruning on it
 * deleted 257 of 258 valid entries on a live instance (2026-10-30 00:18) and
 * every following start had to fold the whole history again — the exact symptom
 * the cache exists to remove. A stale entry costs a few kilobytes and nothing
 * else; it is only ever read by id from a listing.
 */
