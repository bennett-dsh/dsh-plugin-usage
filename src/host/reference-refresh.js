/**
 * The user-initiated refresh: fetch both price pages, parse them with the SAME
 * code the build-time generator uses, validate the result, hand it back.
 *
 * This is deliberately the narrowest possible network surface:
 *
 *  - it runs only when someone asks (the button in the pricing dialog), never on
 *    a timer and never during activation;
 *  - it never writes anything itself — `index.js` owns persisting the table and
 *    swapping it in, so a failed fetch cannot leave the dashboard half-updated;
 *  - it never throws. Every failure is a value with a `code` the UI can explain
 *    («网络被拒», «页面结构变了», «表不完整»), because "internal error" in a
 *    dialog tells the user nothing about whether retrying will help.
 *
 * The bundled table stays authoritative until a fetched one passes
 * `validateReferenceTable`; publishing a table that fails the same gates
 * `tests/price-data.test.js` applies to the shipped one would be a way to lose
 * money quietly.
 */
import {
  DEEPSEEK_URL,
  HOLIDAY_URL,
  USER_AGENT,
  ZEN_URL,
  buildHolidayCalendar,
  buildReferenceTable,
  parseDeepSeek,
  parseZen,
  validateHolidayCalendar,
  validateReferenceTable,
} from './reference-parse.js';
import { unpublishedYears } from './holiday-years.js';

/** Default deadline for one page. Both pages are fetched in parallel. */
export const REFRESH_TIMEOUT_MS = 20_000;

/** Largest page accepted; the Zen catalogue is ~100 KB, so this is ~4× headroom. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Resolve the fetch implementation, preferring the caller's. */
function fetchOf(impl) {
  if (typeof impl === 'function') return impl;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  return null;
}

/**
 * Fetch one page as text, bounded in time and size.
 *
 * @param {Function} fetchImpl - WHATWG `fetch`.
 * @param {string} url - page to read.
 * @param {number} timeoutMs - per-page deadline.
 * @returns {Promise<{ ok: true, text: string } | { ok: false, code: string, message: string }>}
 */
async function fetchPage(fetchImpl, url, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error && error.name ? String(error.name) : '';
    const code = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, code, message: (error && error.message) || String(error) };
  }
  if (!response || !response.ok) {
    return { ok: false, code: 'http', message: `${url} 返回 HTTP ${response && response.status}` };
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, code: 'network', message: (error && error.message) || String(error) };
  }
  if (text.length > MAX_BYTES) {
    return { ok: false, code: 'too-large', message: `${url} 返回 ${text.length} 字节，超出上限` };
  }
  if (text.trim() === '') {
    return { ok: false, code: 'http', message: `${url} 返回了空页面` };
  }
  return { ok: true, text };
}

/**
 * Fetch, parse and validate a fresh reference table — and the holiday calendar
 * that the peak rule needs, in the same pass.
 *
 * The calendar is best-effort on purpose: prices are the primary content, and a
 * blocked `raw.githubusercontent.com` (common behind a corporate proxy) must not
 * turn a working price refresh into a failure. The answer says what happened to
 * the calendar (`holiday.status`) so the UI can mention it without a second
 * button.
 *
 * @param {{ fetchImpl?: Function, timeoutMs?: number, at?: number, holidayYears?: number[], holidayBasis?: string }} [options]
 * @returns {Promise<{ ok: true, table: object, calendar: object|null, holiday: object, summary: object }
 *   | { ok: false, code: string, message: string, details?: object }>}
 */
export async function fetchReferenceTable(options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REFRESH_TIMEOUT_MS;
  const fetchImpl = fetchOf(options.fetchImpl);
  if (fetchImpl === null) {
    return { ok: false, code: 'unsupported', message: '当前运行环境没有 fetch，无法联网拉取' };
  }

  const holidayYears = Array.isArray(options.holidayYears)
    ? [...new Set(options.holidayYears.filter((y) => Number.isInteger(y)))].sort((a, b) => a - b)
    : [];

  const [zenPage, deepseekPage] = await Promise.all([
    fetchPage(fetchImpl, ZEN_URL, timeoutMs),
    fetchPage(fetchImpl, DEEPSEEK_URL, timeoutMs),
  ]);
  // Report the first failure with the page it belongs to: "拉取失败" alone makes
  // a blocked Zen page and a changed DeepSeek page look identical.
  if (!zenPage.ok) return { ...zenPage, details: { page: 'opencode Zen', url: ZEN_URL } };
  if (!deepseekPage.ok) return { ...deepseekPage, details: { page: 'DeepSeek', url: DEEPSEEK_URL } };

  let zen;
  let deepseek;
  try {
    zen = parseZen(zenPage.text);
  } catch (error) {
    return {
      ok: false,
      code: 'parse',
      message: (error && error.message) || String(error),
      details: { page: 'opencode Zen', url: ZEN_URL },
    };
  }
  try {
    deepseek = parseDeepSeek(deepseekPage.text);
  } catch (error) {
    return {
      ok: false,
      code: 'parse',
      message: (error && error.message) || String(error),
      details: { page: 'DeepSeek', url: DEEPSEEK_URL },
    };
  }

  const at = Number.isFinite(options.at) ? options.at : Date.now();
  const capturedAt = new Date(at).toISOString();
  const table = buildReferenceTable({ zen, deepseek, capturedAt, fetchedAt: { zen: capturedAt, deepseek: capturedAt } });

  const problems = validateReferenceTable(table);
  if (problems.length > 0) {
    return {
      ok: false,
      code: 'table-invalid',
      message: problems[0],
      details: { problems: problems.slice(0, 6) },
    };
  }

  // 节假日历：同一次点击里的另一半输入（峰谷判定要用它），所以同一批请求发出。
  // 它失败不算整体失败 —— 价格已经拿到了，用户不该因为 github raw 被墙就什么都拿不到；
  // 界面也只多一句提示，不新增按钮。
  let calendar = null;
  let holiday = { status: 'skipped', years: holidayYears, failed: [], unpublished: [], dates: 0 };
  if (holidayYears.length > 0) {
    const responses = await Promise.all(holidayYears.map(async (year) => ({
      year,
      page: await fetchPage(fetchImpl, HOLIDAY_URL(year), timeoutMs),
    })));
    const payloads = {};
    const failed = [];
    for (const { year, page } of responses) {
      if (!page.ok) {
        failed.push(year);
        continue;
      }
      try {
        payloads[year] = JSON.parse(page.text);
      } catch {
        failed.push(year);
      }
    }
    const candidate = buildHolidayCalendar({
      years: holidayYears,
      payloads,
      capturedAt,
      basis: options.holidayBasis,
    });
    const holidayProblems = validateHolidayCalendar(candidate);
    if (holidayProblems.length === 0) {
      calendar = candidate;
      holiday = {
        status: failed.length === 0 ? 'ok' : 'partial',
        years: holidayYears,
        failed,
        unpublished: unpublishedYears(candidate.years),
        dates: Object.keys(candidate.dates).length,
      };
    } else {
      holiday = {
        status: 'invalid',
        years: holidayYears,
        failed,
        unpublished: [],
        dates: 0,
        problems: holidayProblems.slice(0, 4),
      };
    }
  }

  return {
    ok: true,
    table,
    calendar,
    holiday,
    summary: {
      models: Object.keys(table.models).length,
      zen: Object.keys(zen.models).length,
      deepseek: Object.keys(deepseek.models).length,
      surcharges: Object.keys(table.surcharges || {}).length,
      deprecated: (table.deprecated || []).length,
      promos: (table.notes || []).filter((n) => n && n.kind === 'promo').length,
      unmatchedRows: (table.notes || []).filter((n) => n && n.kind === 'unmatched-row').length,
      capturedAt,
      holidays: holiday,
    },
  };
}
