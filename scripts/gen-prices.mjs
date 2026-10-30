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
 * Why a generator and not a runtime fetch: the price table has to be identical
 * on every host with no network, and a stale table has to be visible in review
 * rather than appearing live. The weekly workflow reruns this and opens a PR
 * when the output changes.
 *
 * The line that is easy to get wrong and is therefore asserted twice: Zen lists
 * DeepSeek at the PEAK rate. The DeepSeek provider block must therefore come
 * from the official page, and the Zen row for the same model may only be a
 * fallback.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { beijingYear, holidaySpan, mergeHolidayYear, sessionSpan } from './lib/holiday-years.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ZEN_URL = 'https://opencode.ai/v2/docs/console/models/';
const DEEPSEEK_URL = 'https://api-docs.deepseek.com/quick_start/pricing/';
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
  return { ...span, source: span.usedUsage ? 'session store (' + SESSIONS_ROOT + ')' : 'calendar default' };
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
  writeFileSync(cachePath, text);
  return { text, fetchedAt: new Date().toISOString(), cached: false };
}

/* -------------------------------------------------------------------------- *
 * opencode Zen
 *
 * Three tables on one page, located by their header cell rather than by
 * position: [Model|Model ID|Endpoint|AI SDK], [Model|Input|Output|Cached
 * Read|Cached Write], [Model|Deprecation date].
 * -------------------------------------------------------------------------- */

function parseTables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => {
    const rows = [];
    for (const tr of m[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []) {
      const cells = [];
      for (const td of tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []) {
        cells.push(
          td
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/\s+/g, ' ')
            .trim(),
        );
      }
      if (cells.length) rows.push(cells);
    }
    return rows;
  });
}

/** "$1.36 $0.68" → { list: 1.36, value: 0.68 }; "$3.00" → 3; "Free" → 0; "-" → null. */
function money(text) {
  const t = String(text ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  if (/^free$/i.test(t)) return { list: 0, value: 0 };
  const nums = [...t.matchAll(/[\d][\d,]*\.?\d*/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite);
  if (nums.length === 0) return null;
  if (nums.length >= 2) return { list: nums[0], value: nums[1] };
  return { list: nums[0], value: nums[0] };
}

/** Trailing "( ... )" qualifier of a Zen row label, plus the text inside it. */
function splitQualifier(label) {
  const m = /^([\s\S]*?)\s*[((]([^))]*)[))]\s*$/.exec(label);
  if (!m) return { base: label.trim(), inner: '' };
  return { base: m[1].trim(), inner: m[2].trim() };
}

function parseZen(html) {
  const tables = parseTables(html);
  const registry = tables.find((rows) => rows[0]?.some((c) => /^model id$/i.test(c)));
  const pricing = tables.find((rows) => rows[0]?.some((c) => /cached read/i.test(c)));
  const deprecation = tables.find((rows) => rows[0]?.some((c) => /deprecation/i.test(c)));
  if (registry === undefined) throw new Error('Zen page has no registry table (Model / Model ID)');
  if (pricing === undefined) throw new Error('Zen page has no pricing table (Model / Input / Output / Cached Read / Cached Write)');

  const idByName = new Map();
  for (const row of registry.slice(1)) {
    if (row[0] && row[1]) idByName.set(row[0].trim(), row[1].trim());
  }

  const models = {};
  const surcharges = {};
  const notes = [];
  for (const row of pricing.slice(1)) {
    const label = row[0];
    if (!label) continue;
    const { base, inner } = splitQualifier(label);
    const id = idByName.get(base) || idByName.get(label);
    if (id === undefined) {
      notes.push({ id: null, kind: 'unmatched-row', text: label });
      continue;
    }
    const price = {
      input: money(row[1]),
      output: money(row[2]),
      cacheRead: money(row[3]),
      cacheWrite: money(row[4]),
    };
    // Long-context surcharge rows ("(> 200K tokens)") are a different rate for a
    // different request size; they are kept aside, never merged into the base.
    const over = /^[>≥]/.test(inner);
    const under = /^[<≤]/.test(inner);
    if (over) {
      surcharges[id] = {
        input: price.input ? price.input.value : null,
        output: price.output ? price.output.value : null,
        cacheRead: price.cacheRead ? price.cacheRead.value : null,
        tier: inner,
      };
      continue;
    }
    if (models[id] !== undefined) continue; // "≤" row already took the slot
    if (price.input?.list !== undefined && price.input.list !== price.input.value) {
      notes.push({ id, kind: 'promo', text: `促销价生效（原价 ${price.input.list} → ${price.input.value}）` });
    }
    models[id] = {
      input: price.input ? price.input.value : null,
      output: price.output ? price.output.value : null,
      cacheRead: price.cacheRead ? price.cacheRead.value : null,
      cacheWrite: price.cacheWrite ? price.cacheWrite.value : null,
    };
    if (under) models[id].contextTier = inner;
  }

  const deprecated = [];
  if (deprecation !== undefined) {
    for (const row of deprecation.slice(1)) {
      if (row[0]) deprecated.push({ name: row[0].trim(), date: (row[1] || '').trim() });
    }
  }

  return { models, surcharges, notes, deprecated };
}

/* -------------------------------------------------------------------------- *
 * DeepSeek official pricing
 *
 * The page prints one labelled table per generation. The live layout is a
 * "MODEL | deepseek-flash | deepseek-v4-pro" header followed by label rows
 * ("PRICING", "1M INPUT TOKENS (CACHE HIT)", then OFF-PEAK / PEAK pairs).
 * -------------------------------------------------------------------------- */

/**
 * The live layout is a three-column pricing block whose first column carries
 * two pieces of information at once:
 *
 *   ["PRICING (2)", "1M INPUT TOKENS (CACHE HIT)", "OFF-PEAK", "$0.003", "$0.022"]
 *   ["PEAK",                                    "$0.006", "$0.044"]
 *
 * so "1M INPUT TOKENS (CACHE HIT)" both names the metric and opens the
 * OFF-PEAK tier, while the follow-up row carries only "PEAK". Earlier layouts
 * printed the numbers directly in the label row; both are handled.
 */
function parseDeepSeek(html) {
  const tables = parseTables(html);
  const table = tables.find((rows) => rows[0]?.[0] && /^model$/i.test(rows[0][0]) && rows[0].length >= 2);
  if (table === undefined) throw new Error('DeepSeek page has no pricing table');

  const header = table[0];
  // "deepseek-flash (1)" → "deepseek-flash"; the "(n)" is a footnote marker.
  const ids = header.slice(1).map((name) => name.replace(/\s*[((]\d+[))]\s*$/, '').trim()).filter(Boolean);
  const result = {};

  const METRICS = [
    [/INPUT TOKENS \(CACHE HIT\)/, 'cacheRead'],
    [/INPUT TOKENS \(CACHE MISS\)/, 'input'],
    [/OUTPUT TOKENS/, 'output'],
  ];
  const TIER = /^(OFF[\s-]?PEAK|PEAK)\b/;

  let metric = null;
  for (const row of table.slice(1)) {
    const cells = row.map((c) => String(c || '').trim());
    // Find the metric named anywhere in the row (first column of the live
    // layout, but legacy tables put it in the label row's own cell).
    let named = null;
    let namedAt = -1;
    for (let i = 0; i < cells.length; i++) {
      for (const [re, name] of METRICS) {
        if (re.test(cells[i].toUpperCase())) {
          named = name;
          namedAt = i;
          break;
        }
      }
      if (named !== null) break;
    }
    if (named !== null) metric = named;

    let tier = null;
    let firstValue = 1;
    for (let i = 0; i < cells.length; i++) {
      const hit = TIER.exec(cells[i].toUpperCase());
      if (hit) {
        tier = hit[1].replace(/\s+/g, '').toUpperCase() === 'PEAK' ? 'peak' : 'offPeak';
        firstValue = i + 1;
        break;
      }
    }

    if (metric === null) continue;
    if (named !== null && tier === null) {
      // Legacy inline layout: the label row itself carries the numbers.
      tier = 'peak';
      firstValue = namedAt + 1;
    }
    if (tier === null) continue;

    for (let i = 0; i < ids.length; i++) {
      const cell = cells[firstValue + i];
      if (cell === undefined) break;
      const value = money(cell);
      if (value === null) continue;
      result[ids[i]] = result[ids[i]] || {};
      result[ids[i]][tier] = result[ids[i]][tier] || {};
      result[ids[i]][tier][metric] = value.value;
    }
  }
  return { models: result, header: header.slice(1) };
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

/**
 * Official DeepSeek ids whose row must also land on Zen's id for the same model.
 *
 * The two tables name one model differently (`deepseek-flash` vs
 * `deepseek-v4.1-flash`), and Zen's single price for it happens to equal
 * DeepSeek's PEAK price. Writing the tiered row under both ids is what keeps the
 * peak / off-peak split reachable: a session that says either id must get the
 * half-price off-peak rate, not Zen's flat peak number.
 */
const DEEPSEEK_ZEN_TWIN = {
  'deepseek-flash': 'deepseek-v4.1-flash',
};

function renderPrices({ zen, deepseek, zenFetchedAt, deepseekFetchedAt }) {
  // DeepSeek: merge official peak/off-peak onto the model entry. Zen's row, when
  // present, is kept as `fallback` so `pricing.js` can still price a model the
  // official page dropped.
  const models = {};
  for (const [id, price] of Object.entries(zen.models)) {
    models[id] = { source: 'zen', ...price };
  }
  for (const [id, tiers] of Object.entries(deepseek.models)) {
    const entry = { source: 'deepseek' };
    entry.peak = {
      input: tiers.peak?.input ?? null,
      output: tiers.peak?.output ?? null,
      cacheRead: tiers.peak?.cacheRead ?? null,
      cacheWrite: null,
    };
    entry.offPeak = {
      input: tiers.offPeak?.input ?? entry.peak.input,
      output: tiers.offPeak?.output ?? entry.peak.output,
      cacheRead: tiers.offPeak?.cacheRead ?? entry.peak.cacheRead,
      cacheWrite: null,
    };
    const twin = DEEPSEEK_ZEN_TWIN[id];
    for (const key of twin === undefined ? [id] : [id, twin]) {
      const zenRow = models[key] ? { ...models[key] } : null;
      const copy = { ...entry, peak: { ...entry.peak }, offPeak: { ...entry.offPeak } };
      if (zenRow !== null) copy.fallback = zenRow;
      models[key] = copy;
    }
  }
  const payload = {
    capturedAt: new Date().toISOString(),
    unit: 'USD per 1M tokens',
    sources: [
      { name: 'opencode Zen', url: ZEN_URL, fetchedAt: zenFetchedAt, models: Object.keys(zen.models).length },
      { name: 'DeepSeek', url: DEEPSEEK_URL, fetchedAt: deepseekFetchedAt, models: Object.keys(deepseek.models).length },
    ],
    note: 'Zen 每个模型单一价；DeepSeek 条目来自官网，峰谷两套价，参考成本按成交时刻判定（见 peak.js）。',
    models,
    surcharges: zen.surcharges,
    deprecated: zen.deprecated,
    notes: zen.notes,
  };
  return HEADER + 'export const REFERENCE_PRICES = ' + JSON.stringify(payload, null, 2) + ';\n';
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
  if (modelCount < 80) throw new Error(`Zen table only has ${modelCount} models — page layout probably changed`);
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
