/**
 * ONE parser and ONE table builder for the reference prices — shared by the
 * build-time generator and the runtime refresh.
 *
 * Two callers, one source of truth:
 *
 *  - `scripts/gen-prices.mjs` (build time) writes `src/host/prices.js`, which is
 *    what a plugin with no network ships;
 *  - `reference-refresh.js` (runtime, user-initiated) fetches the same pages and
 *    feeds them through the exact same code, so "the table I fetched in the UI"
 *    and "the table the maintainer shipped" can never disagree about how a page
 *    is read. When this lived only in the generator, a runtime fetch would have
 *    needed a second parser — the classic way two answers to one question appear.
 *
 * The pages are HTML and the layout is the vendor's, so everything here is
 * defensive: locate tables by their header cell, never by position; a missing
 * table throws with the reason; `validateReferenceTable` is the gate that keeps
 * a half-parsed page out of the user's dashboard.
 */

/** The opencode Zen model catalogue: registry, pricing and deprecation tables. */
export const ZEN_URL = 'https://opencode.ai/v2/docs/console/models/';

/** DeepSeek's official list price: peak / off-peak per generation. */
export const DEEPSEEK_URL = 'https://api-docs.deepseek.com/quick_start/pricing/';

/** Chinese public holidays, one JSON per year (the peak rule's other input). */
export const HOLIDAY_URL = (year) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;

/** Sent on every fetch. A plain UA gets 403 from more than one CDN. */
export const USER_AGENT = 'dsh-plugin-usage (+https://github.com/bennett-dsh/dsh-plugin-usage)';

import { mergeHolidayYear } from './holiday-years.js';

/**
 * Fewest Zen rows a page must yield before it is believed.
 *
 * The page carried 88 rows when this was written and 91 three weeks later. A
 * layout change that makes the parser find one table of twenty rows must fail
 * loudly instead of silently pricing 68 models at 0.
 */
export const MIN_ZEN_MODELS = 80;

/** The unit a table is expressed in; the UI's conversion assumes it. */
export const PRICE_UNIT = 'USD per 1M tokens';

/** Every `<table>` of one page, as rows of cell text. */
export function parseTables(html) {
  return [...String(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => {
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
export function money(text) {
  const t = String(text ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  if (/^free$/i.test(t)) return { list: 0, value: 0 };
  const nums = [...t.matchAll(/[\d][\d,]*\.?\d*/g)]
    .map((m) => Number(m[0].replace(/,/g, '')))
    .filter(Number.isFinite);
  if (nums.length === 0) return null;
  if (nums.length >= 2) return { list: nums[0], value: nums[1] };
  return { list: nums[0], value: nums[0] };
}

/** Trailing "( ... )" qualifier of a Zen row label, plus the text inside it. */
export function splitQualifier(label) {
  const m = /^([\s\S]*?)\s*[((]([^))]*)[))]\s*$/.exec(label);
  if (!m) return { base: label.trim(), inner: '' };
  return { base: m[1].trim(), inner: m[2].trim() };
}

/* -------------------------------------------------------------------------- *
 * opencode Zen
 *
 * Three tables on one page, located by their header cell rather than by
 * position: [Model|Model ID|Endpoint|AI SDK], [Model|Input|Output|Cached
 * Read|Cached Write], [Model|Deprecation date].
 * -------------------------------------------------------------------------- */

/**
 * @param {string} html - the Zen catalogue page.
 * @returns {{ models: Record<string, object>, surcharges: Record<string, object>,
 *   notes: object[], deprecated: object[] }}
 */
export function parseZen(html) {
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
 *
 * @param {string} html - the DeepSeek pricing page.
 * @returns {{ models: Record<string, { peak?: object, offPeak?: object }>, header: string[] }}
 */
export function parseDeepSeek(html) {
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

/**
 * Official DeepSeek ids whose row must also land on Zen's id for the same model.
 *
 * The two tables name one model differently (`deepseek-flash` vs
 * `deepseek-v4.1-flash`), and Zen's single price for it happens to equal
 * DeepSeek's PEAK price. Writing the tiered row under both ids is what keeps the
 * peak / off-peak split reachable: a session that says either id must get the
 * half-price off-peak rate, not Zen's flat peak number.
 */
export const DEEPSEEK_ZEN_TWIN = {
  'deepseek-flash': 'deepseek-v4.1-flash',
};

/**
 * Merge the two parsed pages into the table the plugin ships and reads.
 *
 * Zen supplies every row; the official page overrides its own ids with the
 * peak/off-peak pair and keeps the Zen row as `fallback`, so a model the
 * official page drops can still be priced.
 *
 * @param {{ zen: object, deepseek: object, capturedAt?: string,
 *   fetchedAt?: { zen?: string, deepseek?: string } }} input - parsed pages.
 * @returns {object} the reference table payload.
 */
export function buildReferenceTable(input) {
  const zen = input.zen;
  const deepseek = input.deepseek;
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
  return {
    capturedAt: input.capturedAt || new Date().toISOString(),
    unit: PRICE_UNIT,
    sources: [
      { name: 'opencode Zen', url: ZEN_URL, fetchedAt: input.fetchedAt?.zen, models: Object.keys(zen.models).length },
      { name: 'DeepSeek', url: DEEPSEEK_URL, fetchedAt: input.fetchedAt?.deepseek, models: Object.keys(deepseek.models).length },
    ],
    note: 'Zen 每个模型单一价；DeepSeek 条目来自官网，峰谷两套价，参考成本按成交时刻判定（见 peak.js）。',
    models,
    surcharges: zen.surcharges,
    deprecated: zen.deprecated,
    notes: zen.notes,
  };
}

/**
 * Everything a table must satisfy before the plugin will price from it.
 *
 * The runtime refresh replaces the table in a live process, and the numbers it
 * carries become money in the dashboard. `tests/price-data.test.js` guards the
 * SHIPPED table; this guards the one a user just fetched, at the moment it
 * arrives, so a layout change fails the fetch instead of the reporting.
 *
 * @param {unknown} table - a candidate reference table.
 * @param {{ minZenModels?: number }} [options] - override the floor (tests).
 * @returns {string[]} problems; empty means the table is usable.
 */
export function validateReferenceTable(table, options = {}) {
  const minZen = Number.isFinite(options.minZenModels) ? options.minZenModels : MIN_ZEN_MODELS;
  const problems = [];
  if (!table || typeof table !== 'object') return ['价目表不是一个对象'];
  const models = table.models;
  if (!models || typeof models !== 'object' || Array.isArray(models)) return ['价目表没有 models'];
  const ids = Object.keys(models);
  if (ids.length < minZen) problems.push(`只有 ${ids.length} 个模型（至少 ${minZen}）`);

  const zen = (table.sources || []).find((s) => s && /zen/i.test(String(s.name)));
  if (!zen) problems.push('缺少 opencode Zen 来源记录');
  else if (!Number.isInteger(zen.models) || zen.models < minZen) problems.push(`Zen 来源只报告了 ${zen.models} 个模型`);

  const flash = models['deepseek-flash'];
  if (!flash || flash.source !== 'deepseek') problems.push('deepseek-flash 没有官方峰谷行');
  else {
    if (!flash.peak || !flash.offPeak) problems.push('deepseek-flash 缺少峰谷两档');
    else {
      for (const field of ['input', 'output', 'cacheRead']) {
        const peak = flash.peak[field];
        const off = flash.offPeak[field];
        if (!(typeof peak === 'number' && peak > 0)) problems.push(`deepseek-flash.peak.${field} 不是正数`);
        if (!(typeof off === 'number' && off > 0)) problems.push(`deepseek-flash.offPeak.${field} 不是正数`);
        if (typeof peak === 'number' && typeof off === 'number' && off > peak) problems.push(`deepseek-flash.${field} 的空闲价高于高峰价`);
      }
    }
  }

  if (table.unit !== PRICE_UNIT) problems.push(`单位不是「${PRICE_UNIT}」`);

  // A row nobody could bill is a parsing hole: it would show as 未定价 while the
  // page claimed a price. `contextTier` rows and tiered rows count as priced.
  const rateFields = ['input', 'output', 'cacheRead', 'cacheWrite'];
  const usable = (row) => {
    if (!row || typeof row !== 'object') return false;
    for (const tier of [row, row.peak, row.offPeak]) {
      if (!tier || typeof tier !== 'object') continue;
      if (rateFields.some((f) => typeof tier[f] === 'number' && Number.isFinite(tier[f]))) return true;
    }
    return false;
  };
  const empty = ids.filter((id) => !usable(models[id]));
  if (empty.length > 0) problems.push(`${empty.length} 行没有任何可用价格（${empty.slice(0, 5).join(', ')}）`);

  return problems;
}

/* -------------------------------------------------------------------------- *
 * 节假日历 —— 峰谷判定的另一半输入
 *
 * 价目表和日历必须同时刷新：只换价不换历，国庆那天照样按高峰计价；只换历不换价，
 * 分桶对了价格还是旧的。所以两者走同一个端点、同一次点击、同一份落盘记录，界面上
 * 不新增任何按钮。
 * -------------------------------------------------------------------------- */

/**
 * Fold the fetched per-year JSONs into one calendar, shaped like `holidays.js`.
 *
 * A year whose arrangement is not published yet is RECORDED as `unpublished`
 * (see `mergeHolidayYear`) instead of being treated as a year without holidays:
 * the receipt has to be able to say "2028 还没公布" rather than silently billing
 * that year's holidays at the peak rate.
 *
 * @param {{ years: number[], payloads: Record<number, unknown>, capturedAt?: string, basis?: string }} input
 * @returns {object} a calendar payload.
 */
export function buildHolidayCalendar(input) {
  const years = Array.isArray(input.years)
    ? [...new Set(input.years.filter((y) => Number.isInteger(y)))].sort((a, b) => a - b)
    : [];
  const payloads = input.payloads || {};
  const acc = { dates: {}, years: {} };
  for (const year of years) mergeHolidayYear(acc, year, payloads[year]);
  return {
    capturedAt: input.capturedAt || new Date().toISOString(),
    source: 'https://github.com/NateScarlet/holiday-cn',
    note: '中国法定节假日（isOffDay=true 的日期）。峰谷判定中这些日期全天按空闲时段计。',
    coverage: {
      fromYear: years.length > 0 ? years[0] : null,
      toYear: years.length > 0 ? years[years.length - 1] : null,
      basis: input.basis || 'runtime refresh',
      years,
    },
    years: acc.years,
    dates: acc.dates,
  };
}

/**
 * Everything a calendar must satisfy before the peak rule may use it.
 *
 * @param {unknown} calendar - a candidate calendar.
 * @returns {string[]} problems; empty means the calendar is usable.
 */
export function validateHolidayCalendar(calendar) {
  if (!calendar || typeof calendar !== 'object') return ['节假日历不是一个对象'];
  const dates = calendar.dates;
  if (!dates || typeof dates !== 'object' || Array.isArray(dates)) return ['节假日历没有 dates'];
  const problems = [];
  const keys = Object.keys(dates);
  if (keys.length === 0) problems.push('节假日历是空的');
  const bad = keys.filter((key) => !/^\d{4}-\d{2}-\d{2}$/.test(key));
  if (bad.length > 0) problems.push(`${bad.length} 个日期不是 YYYY-MM-DD（${bad.slice(0, 3).join(', ')}）`);
  if (!calendar.years || typeof calendar.years !== 'object') problems.push('节假日历缺少年份元数据');
  return problems;
}
