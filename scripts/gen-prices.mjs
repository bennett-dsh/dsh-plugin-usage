/**
 * Generate the reference price table and the holiday calendar from their
 * public sources.
 *
 *   node scripts/gen-prices.mjs            # fetch all three sources
 *   node scripts/gen-prices.mjs --offline  # rebuild from the cached snapshots
 *
 * Outputs (both are data modules, NOT JSON: `tsconfig.json` sets
 * `rootDir: src` / `outDir: lib` and only `src/**` is copied, so a `.json` file
 * would never reach the published package):
 *
 *   src/host/prices.js    price table: Zen for everything, DeepSeek official
 *                         (peak + off-peak) overriding the DeepSeek rows
 *   src/host/holidays.js  public-holiday calendar for the peak rule
 *
 * Why a generator at all: the shipped table has to be identical on every host,
 * including the ones with no network, and a price change has to be visible in
 * review instead of appearing live. The weekly workflow reruns this and opens a
 * PR when the output changes.
 *
 * A user can also pull the pages themselves from the pricing dialog
 * (`src/host/reference-refresh.js`). That path shares this file's parser
 * (`src/host/reference-parse.js`) and the same validation, so "what I fetched" and
 * "what a release ships" are read the same way; this generator stays the source
 * of the DEFAULT table every host starts from.
 *
 * The line that is easy to get wrong and is therefore asserted twice: Zen lists
 * DeepSeek at the PEAK rate. The DeepSeek provider block must therefore come
 * from the official page, and the Zen row for the same model may only be a
 * fallback.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { beijingYear, holidaySpan, mergeHolidayYear, sessionSpan } from '../src/host/holiday-years.js';
import {
  DEEPSEEK_URL,
  MIN_ZEN_MODELS,
  ZEN_URL,
  buildReferenceTable,
  parseDeepSeek,
  parseZen,
  validateReferenceTable,
} from '../src/host/reference-parse.js';


const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const HOLIDAY_URL = (year) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;

/** Snapshot cache, so `--offline` works and a flaky run is reproducible. */
const CACHE_DIR = join(ROOT, '.cache');

const OFFLINE = process.argv.includes('--offline');
const TIMEOUT_MS = 45_000;

/** Session store the usage statistics read: the cheapest bound on their dates. */
const SESSIONS_ROOT = process.env.DSH_SESSIONS_DIR || join(homedir(), '.dsh', 'sessions');

/** Optional explicit overrides: `--holiday-years 2024-2027`, `--usage-from`, `--usage-to`. */
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

/**
 * Years of holiday data to embed.
 *
 * Covers every year the usage statistics can contain, plus one year forward —
 * an explicit `--holiday-years A-B` wins, otherwise the session store's dates
 * decide (a dashboard with 2024 usage must ship 2024 holidays, or that year's
 * holidays get billed at the peak rate).
 */
const HOLIDAY_SPAN = (() => {
  const explicit = argValue('--holiday-years');
  if (explicit !== undefined) {
    const [from, to] = explicit.split('-').map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      throw new Error('--holiday-years needs a range like 2024-2027');
    }
    return { from, to, usedUsage: false, source: 'argument' };
  }
  const fromArg = argValue('--usage-from');
  const toArg = argValue('--usage-to');
  const usage = fromArg !== undefined || toArg !== undefined
    ? { fromMs: Date.parse(fromArg || ''), toMs: Date.parse(toArg || '') }
    : sessionSpan(SESSIONS_ROOT) || {};
  const span = holidaySpan({
    usageFromMs: Number.isFinite(usage.fromMs) ? usage.fromMs : undefined,
    usageToMs: Number.isFinite(usage.toMs) ? usage.toMs : undefined,
  });
  // Deliberately NOT the directory it was read from: this string ships inside the
  // package, and a maintainer's home path is both a privacy leak and a source of
  // churn (the weekly CI run, which has no session store, would rewrite it and
  // flip the file back and forth on every regeneration).
  return { ...span, source: span.usedUsage ? 'session store' : 'calendar default' };
})();

const HOLIDAY_YEARS = (() => {
  const years = [];
  for (let year = HOLIDAY_SPAN.from; year <= HOLIDAY_SPAN.to; year += 1) years.push(year);
  return years;
})();

const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.warn('WARN ' + message);
};

/* -------------------------------------------------------------------------- *
 * Fetch + cache
 * -------------------------------------------------------------------------- */

/**
 * Snapshot one response into the cache, for `--offline` and reproducibility.
 *
 * The cache is an optimisation and therefore may never decide whether a run
 * succeeds: a fresh CI checkout has no `.cache/` at all (it is gitignored), and
 * a read-only working tree cannot create it. Writing nothing costs a later
 * `--offline` run; throwing here costs the whole refresh, which is how the
 * scheduled workflow failed three weeks in a row (`ENOENT … .cache/zen.html`).
 */
function writeCache(cachePath, text) {
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, text);
  } catch (error) {
    warn(`快照写入失败 ${cachePath}：${error.message}（本次运行继续，--offline 快照未更新）`);
  }
}

async function fetchText(url, cacheName) {
  const cachePath = join(CACHE_DIR, cacheName);
  if (OFFLINE) {
    if (!existsSync(cachePath)) throw new Error(`--offline but ${cacheName} is not cached`);
    return { text: readFileSync(cachePath, 'utf8'), fetchedAt: new Date().toISOString(), cached: true };
  }
  const res = await fetch(url, {
    headers: { 'user-agent': 'dsh-plugin-usage price generator (+https://github.com/bennett-dsh/dsh-plugin-usage)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  const text = await res.text();
  writeCache(cachePath, text);
  return { text, fetchedAt: new Date().toISOString(), cached: false };
}

/* -------------------------------------------------------------------------- *
 * Holidays
 * -------------------------------------------------------------------------- */

async function collectHolidays() {
  const dates = {};
  const years = {};
  for (const year of HOLIDAY_YEARS) {
    let payload;
    try {
      const { text } = await fetchText(HOLIDAY_URL(year), `holiday-${year}.json`);
      payload = JSON.parse(text);
    } catch (error) {
      warn(`节假日数据 ${year} 不可用：${error.message}`);
      continue;
    }
    const days = Array.isArray(payload.days) ? payload.days : [];
    const off = days.filter((d) => d && d.isOffDay === true && typeof d.date === 'string');
    if (off.length === 0) {
      // The State Council publishes next year's arrangement in November, so an
      // empty year is expected rather than broken. It is RECORDED as
      // unpublished (not dropped): the UI has to be able to say "2027 is not
      // published yet" instead of implying the year has no holidays.
      warn(`${year} 节假日安排尚未公布（holiday-cn 无数据），该年按周末规则判定`);
    }
    mergeHolidayYear({ dates, years }, year, payload);
    if (off.length === 0) continue;
    const covered = off.map((d) => d.date).sort();
    // A published year always contains 国庆 (Oct 1-7) and never has public
    // holidays after early October, so "ends in October" is normal. The real
    // truncation signal is a file that stops BEFORE this year's 国庆 — that is a
    // half-published year, and its missing days would fall back to the weekend
    // rule. (The old check compared against Dec 31 and warned on every year.)
    const nationalDay = `${year}-10-01`;
    if (covered[covered.length - 1] < nationalDay) {
      warn(`${year} 节假日数据只到 ${covered[covered.length - 1]}（缺 ${nationalDay} 起的国庆安排），该段按周末规则判定`);
    }
  }
  return { dates, years };
}

/* -------------------------------------------------------------------------- *
 * Emit
 * -------------------------------------------------------------------------- */

const HEADER = '// GENERATED by scripts/gen-prices.mjs — do not edit by hand.\n';

function renderPrices({ zen, deepseek, zenFetchedAt, deepseekFetchedAt }) {
  const table = buildReferenceTable({
    zen,
    deepseek,
    fetchedAt: { zen: zenFetchedAt, deepseek: deepseekFetchedAt },
  });
  // A build is the last place a broken table may be caught: the file it writes is
  // what every offline host ships.
  const problems = validateReferenceTable(table);
  if (problems.length > 0) throw new Error('价目表不合格：' + problems.join('; '));
  return HEADER + 'export const REFERENCE_PRICES = ' + JSON.stringify(table, null, 2) + ';\n';
}

function renderHolidays({ dates, years }) {
  const payload = {
    capturedAt: new Date().toISOString(),
    source: 'https://github.com/NateScarlet/holiday-cn',
    note: '中国法定节假日（isOffDay=true 的日期）。峰谷判定中这些日期全天按空闲时段计。',
    // The span the calendar was fetched for: every year the usage statistics can
    // reach, plus one year forward (arrangements appear in November).
    coverage: {
      fromYear: HOLIDAY_SPAN.from,
      toYear: HOLIDAY_SPAN.to,
      basis: HOLIDAY_SPAN.source,
      years: HOLIDAY_YEARS,
    },
    years,
    dates,
  };
  return HEADER + 'export const PUBLIC_HOLIDAYS = ' + JSON.stringify(payload, null, 2) + ';\n';
}

/* -------------------------------------------------------------------------- *
 * Main
 * -------------------------------------------------------------------------- */

async function main() {
  const zenFetch = await fetchText(ZEN_URL, 'zen.html');
  const deepseekFetch = await fetchText(DEEPSEEK_URL, 'deepseek.html');
  const zen = parseZen(zenFetch.text);
  const deepseek = parseDeepSeek(deepseekFetch.text);
  const holidays = await collectHolidays();

  const modelCount = Object.keys(zen.models).length;
  if (modelCount < MIN_ZEN_MODELS) {
    throw new Error(`Zen table only has ${modelCount} models — page layout probably changed`);
  }
  const flash = deepseek.models['deepseek-flash'];
  if (!flash || !flash.peak || !flash.offPeak) {
    throw new Error('DeepSeek table has no peak/off-peak pair for deepseek-flash — page layout probably changed');
  }

  writeFileSync(join(ROOT, 'src/host/prices.js'), renderPrices({
    zen,
    deepseek,
    zenFetchedAt: zenFetch.fetchedAt,
    deepseekFetchedAt: deepseekFetch.fetchedAt,
  }));
  writeFileSync(join(ROOT, 'src/host/holidays.js'), renderHolidays(holidays));

  console.log(`prices.js  : ${modelCount} Zen models, ${Object.keys(deepseek.models).length} DeepSeek models with peak/off-peak`);
  console.log(`holidays.js: ${Object.keys(holidays.dates).length} dates across ${Object.keys(holidays.years).join(', ') || '(none)'}`);
  console.log(`warnings   : ${warnings.length}`);
}

main().catch((error) => {
  console.error('FAILED ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
