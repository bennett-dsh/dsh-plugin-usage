/**
 * The reference price table and the published peak rule, as one lookup with a
 * visible resolution ladder.
 *
 * The problem this file exists for: a model id stored in a session log is not
 * the key of any price table. The same model arrives as `deepseek-flash`,
 * `deepseek-v4.1-flash`, `deepseek/deepseek-v4.1-flash`,
 * `group/auto-deepseek-v4-1-flash`, or under a retired alias; the table is keyed
 * by whatever the vendor — or opencode Zen — called it on the day the row was
 * written. Guessing that mapping with string similarity silently prices a model
 * at someone else's rate (a 0.62 similarity threshold once billed
 * `deepseek-v4-flash` at 0.14/0.28 instead of 0.30/1.20), so every level below
 * is deterministic and every outcome is reported.
 *
 * Resolution order (first hit wins), in ONE function:
 *   1. the user's explicit `prices` entry        how: 'custom'
 *   2. a match the user confirmed in the dialog  how: 'confirmed'
 *   3. a normalized literal match on the table   how: 'normalized'
 *   4. the alias table                           how: 'alias'
 *   5. a variant suffix on a published model     how: 'variant'
 *   anything else                                how: 'unmatched'
 *
 * Literal beats everything inferred, which is what makes `-free` behave: an id
 * the table really publishes (`glm-5.3-flash-free`) is an EXACT match and keeps
 * its own published price (0 while the promotion runs); only a `-free` variant
 * the table does not carry falls through to the variant rung, and that one is
 * reported as fuzzy. The old order put the twin first, so every `-free` id —
 * including the ones the table publishes — read as 模糊 and was billed at its
 * paid sibling, i.e. the promo's real price of 0 was replaced by a guess.
 *
 * The variant rung is a closed list of rename suffixes (`-free`, `-exp`,
 * `-fast`, `-latest`, a four-digit date), each resolved against a literal table
 * row — never a similarity score. That is how `deepseek-v4.1-flash-fast` and
 * `deepseek-v4.1-flash-1017` land on `deepseek-v4.1-flash` as 模糊 instead of
 * 未匹配, while `deepseek-v4-flash-0731` (no such base row) stays unmatched.
 *
 * Every hit also carries `source`: where the answered price came from
 * ('deepseek', 'zen' or 'custom'), so the UI can say which of the three kinds of
 * reference id a row matched.
 *
 * Two vocabularies, and only these two, leave this file:
 *   - `how`  — which rung of the ladder answered (5 values, for the tooltip);
 *   - `state` — what the user sees (4 values: exact / fuzzy / none / custom).
 * `state` is derived HERE so no caller re-derives it: a client that mapped
 * `how` itself once shipped a `'literal'` branch the ladder never emits, and
 * every exact hit read as 未匹配 while the dashboard billed it.
 *
 * One rate shape, too. Whatever a row carries — a flat reference row, a DeepSeek
 * row with `peak`/`offPeak`, or a hand-entered `inputPerM` row — `ratesOf`
 * flattens it to `{ input, output, cacheRead, cacheWrite }` per tier. Nothing
 * else in the codebase reads a price field.
 */
import { REFERENCE_PRICES } from './prices.js';
import { holidayCoverage, holidayOf as holidayOfDefault, isPeak } from './peak.js';

/** Re-exported so callers keep one import site for "the calendar". */
export { holidayCoverage, holidayOfDefault };

/**
 * Aliases the table cannot derive on its own, each with the reason it exists.
 *
 * Only add an entry here when the mapping is a fact about the vendor's naming,
 * not when two ids merely look alike: everything else is handled by the
 * normalized match below.
 */
export const ALIASES = {
  // Legacy names the vendor retired but that still appear in older session logs.
  'deepseek-chat': { to: 'deepseek-v4.1-flash', why: '官方 2026-07-24 停用；历史会话按现役 Flash 价估算' },
  'deepseek-reasoner': { to: 'deepseek-v4.1-flash', why: '官方 2026-07-24 停用；历史会话按现役 Flash 价估算' },
  'deepseek-v4-flash': { to: 'deepseek-v4.1-flash', why: '官方已退役，请求被路由到 V4.1 Flash 并按 Flash 价计费' },
};

/**
 * Suffixes that mark a variant of a model the table DOES publish.
 *
 * The list is closed and deterministic on purpose: `-free` / `-exp` (promo and
 * experimental twins), `-fast` (the speed tier several providers resell), and a
 * four-digit publish date (`-1017`, Zen's dated ids). The base id has to be a
 * table row, so a suffix on an unknown model still lands in 未匹配 — this is a
 * rename rule, not a similarity score. Two ids that merely look alike
 * (`deepseek-v4-flash-0731`) never collapse into each other unless the rules
 * below say so and the base exists.
 */
const VARIANT_SUFFIX = /-(?:free|exp|fast|latest|\d{4})$/;

/** Rate field on a price row, and the older spelling a saved config may still use. */
const RATE_FIELDS = [
  ['input', 'inputPerM'],
  ['output', 'outputPerM'],
  ['cacheRead', 'cacheReadPerM'],
  ['cacheWrite', 'cacheWritePerM'],
];

/**
 * Literal normalization: case, provider prefix, separator style, router prefix.
 *
 * The provider prefix is everything up to the LAST '/', because an id may itself
 * contain one (`deepseek/deepseek-v4.1-flash`). Version suffixes are deliberately
 * NOT stripped: `gpt-5.4` and `gpt-5` are different products, and a trailing
 * date (`-1017`) is part of the id Zen publishes.
 *
 * `.` and `-` are unified because the two tables spell one model differently
 * (`deepseek-v4.1-flash` vs `deepseek-v4-1-flash`), and a leading `auto-` is
 * dropped because DSH's router reports `group/auto-<model>`. Both rules are only
 * safe while no two table ids collide into one key, which `price-data.test.js`
 * enforces rather than trusting.
 *
 * @param {string} raw - model id as stored by the harness.
 * @returns {string} the comparable form, never null.
 */
export function normalizeId(raw) {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (text === '') return '';
  const bare = text.includes('/') ? text.slice(text.lastIndexOf('/') + 1) : text;
  return bare.replace(/^auto-/, '').replace(/_/g, '-').replace(/\./g, '-');
}

/** Lazily built `normalizeId(table id) -> table id` index. */
let index = null;
function tableIndex() {
  if (index !== null) return index;
  index = new Map();
  for (const id of Object.keys(REFERENCE_PRICES.models)) {
    const key = normalizeId(id);
    // First writer wins: a later duplicate would otherwise shadow the canonical
    // id depending on object order. The collision itself is a test failure.
    if (!index.has(key)) index.set(key, id);
  }
  return index;
}

/** Which tier an instant bills at. Beijing time, weekend and holiday aware. */
export function tierAt(atMs, holidayOf = holidayOfDefault) {
  return isPeak(atMs, holidayOf) ? 'peak' : 'off';
}

/**
 * Flatten any price row to the four rates one tier bills.
 *
 * This is the only place that knows a price can be shaped three ways. Callers
 * ask for a tier and get numbers or null; a missing field is 0, never NaN.
 *
 * @param {object|null} price - a ladder hit, a hand-entered price, or null.
 * @param {'peak'|'off'} [tier] - which tier of a two-tier row to read.
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number } | null}
 */
export function ratesOf(price, tier = 'peak') {
  if (!price || typeof price !== 'object') return null;
  let row = price;
  if (price.peak !== undefined || price.offPeak !== undefined) {
    const sub = tier === 'off' ? price.offPeak : price.peak;
    // A tiered row with one side missing still answers: the present tier is the
    // best fact available, and rateOf(0) would invent a price nobody published.
    row = sub !== undefined && sub !== null ? sub : price;
  }
  const out = {};
  for (const [canonical, legacy] of RATE_FIELDS) {
    const v = row[canonical] !== undefined ? row[canonical] : row[legacy];
    out[canonical] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

/**
 * Resolve one model id to a price.
 *
 * Everything that can answer "what does this id cost" lives here — including the
 * user's confirmed matches — because a second function wrapping this one is how
 * `how` and the price diverged once already (`propose` reported 未匹配 on models
 * the query billed).
 *
 * @param {object} options - lookup inputs.
 * @param {string} options.model - model id from a usage record.
 * @param {string} [options.provider] - provider id from the same record.
 * @param {Record<string, object>} [options.custom] - the user's explicit price
 *   table, keyed by `provider/model` or by bare model id.
 * @param {Record<string, string>} [options.matches] - confirmed matches, same keys,
 *   whose value is a reference-table id.
 * @returns {{ price: object|null, how: string, state: string, target: string|null, why: string }}
 *   `price` is the row as published (flat, or with both tiers), never a
 *   pre-selected tier: the tier belongs to the billing site, which is the only
 *   place that knows an instant. `how` is the ladder rung, `state` the
 *   four-value verdict the UI shows.
 */
export function resolvePrice(options) {
  const model = typeof options?.model === 'string' ? options.model : '';
  const provider = typeof options?.provider === 'string' ? options.provider : '';
  const custom = options?.custom && typeof options.custom === 'object' ? options.custom : null;
  const matches = options?.matches && typeof options.matches === 'object' ? options.matches : null;
  const composite = provider === '' ? '' : provider + '/' + model;

  /** One table row, as published. */
  const rowOf = (id) => (Object.prototype.hasOwnProperty.call(REFERENCE_PRICES.models, id) ? REFERENCE_PRICES.models[id] : null);

  // 1. The user's own price always wins, composite key before bare id.
  if (custom !== null) {
    const own = (composite !== '' && custom[composite]) || custom[model];
    if (own && typeof own === 'object') {
      return { price: own, how: 'custom', state: 'custom', target: null, why: '用户自定义单价', source: 'custom' };
    }
  }

  // 2. A match the user confirmed. It outranks the automatic ladder — it is a
  //    fact the user established — but never the explicit price above. A target
  //    may be one of the user's own rows as well as a table row, because a
  //    "custom" reference is one of the three kinds of reference id.
  if (matches !== null) {
    const confirmed = (composite !== '' && matches[composite]) || matches[model];
    if (typeof confirmed === 'string' && confirmed !== '') {
      const own = custom !== null && Object.prototype.hasOwnProperty.call(custom, confirmed) ? custom[confirmed] : null;
      if (own !== null && typeof own === 'object') {
        return { price: own, how: 'confirmed', state: 'custom', target: confirmed, why: '用户确认的匹配（自定义价）', source: 'custom' };
      }
      const price = rowOf(confirmed);
      if (price !== null) {
        return { price, how: 'confirmed', state: 'custom', target: confirmed, why: '用户确认的匹配', source: price.source };
      }
      // The confirmed target left the table. Say so instead of falling through
      // silently: a stale confirmation is a fact the user should see, not a
      // price that quietly changed.
      return { price: null, how: 'unmatched', state: 'none', target: confirmed, why: '已确认的参考模型不在当前价目表中', source: null };
    }
  }

  const bare = normalizeId(model);

  // 3. A normalized literal match. This runs before the two inferred rungs: an
  //    id the table really publishes is a fact, and an inference may not
  //    override it. It is also the `-free` rule — a published `-free` row is
  //    exact and keeps its own price (0 during a promotion); a `-free` id the
  //    table does not carry is what the twin rung exists for.
  const direct = tableIndex().get(bare);
  if (direct !== undefined) {
    const row = rowOf(direct);
    return { price: row, how: 'normalized', state: 'exact', target: direct, why: '与价目表 id 字面一致', source: row.source };
  }

  // 4. The alias table.
  const alias = ALIASES[bare] ?? ALIASES[model];
  if (alias !== undefined) {
    const price = rowOf(alias.to);
    if (price !== null) {
      return { price, how: 'alias', state: 'fuzzy', target: alias.to, why: alias.why, source: price.source };
    }
  }

  // 5. A variant of a model the table publishes, under a name the table does not:
  //    `deepseek-v4.1-flash-fast`, `deepseek-v4.1-flash-1017`, or a `-free` /
  //    `-exp` twin. Bill it at the base row and report it as 模糊 — the id is
  //    inferred, not literal, so the user can still see and override it.
  //
  //    The base must exist in the table; otherwise this rung does nothing and the
  //    id stays 未匹配 (no guessing). A published `-free` row never reaches here:
  //    the literal rung above already answered it.
  const variantBase = bare.replace(VARIANT_SUFFIX, '');
  if (variantBase !== bare) {
    const baseId = tableIndex().get(variantBase);
    if (baseId !== undefined) {
      const baseRow = rowOf(baseId);
      return {
        price: baseRow,
        how: 'variant',
        state: 'fuzzy',
        target: baseId,
        why: '同一模型的变体名（' + bare.slice(variantBase.length) + ' 后缀），按 ' + baseId + ' 的价估算',
        source: baseRow.source,
      };
    }
  }

  return { price: null, how: 'unmatched', state: 'none', target: null, why: '价目表里没有可对应的模型', source: null };
}

/**
 * Reference cost of one folded record.
 *
 * The record supplies either `tokens` buckets (peak / off, computed while
 * folding, which is the only place an event's own timestamp is available) or a
 * flat token set, in which case the record's own instant picks the tier.
 *
 * @param {{ inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number,
 *   tokens?: { peak?: object, off?: object }, time?: number }} record - a usage record.
 * @param {object} price - any shape `ratesOf` accepts, USD per 1M tokens.
 * @returns {number} USD.
 */
export function costOf(record, price) {
  if (!record || !price) return 0;
  const bill = (bucket, tier) => {
    const rate = ratesOf(price, tier);
    if (rate === null) return 0;
    return (
      ((bucket && bucket.inputTokens) || 0) * rate.input
      + ((bucket && bucket.outputTokens) || 0) * rate.output
      + ((bucket && bucket.cacheReadTokens) || 0) * rate.cacheRead
      + ((bucket && bucket.cacheWriteTokens) || 0) * rate.cacheWrite
    ) / 1e6;
  };
  const buckets = record.tokens;
  if (buckets && (buckets.peak || buckets.off)) return bill(buckets.peak, 'peak') + bill(buckets.off, 'off');
  return bill(record, tierAt(typeof record.time === 'number' ? record.time : Date.now()));
}

/** The table, for the settings dialog's model picker. */
export function referenceTable() {
  return REFERENCE_PRICES;
}

/**
 * The wire shape of one priced model, shared by `query` and `propose`.
 *
 * Both endpoints describing the same model must describe it identically; the
 * one time they did not, the dialog showed 未匹配 on rows the dashboard billed.
 * `rates` carries BOTH tiers so the client never has to guess a tier itself —
 * it prints `rates[tier]`, where `tier` is the host's own answer for "now".
 *
 * `source` names the kind of reference id that answered: 'deepseek', 'zen' or
 * 'custom'. Those are the three kinds the UI groups by, so it travels with the
 * row instead of being looked up again on the other side.
 *
 * @param {{ price: object|null, how: string, state: string, target: string|null, why: string,
 *   source?: string|null }} hit - ladder output.
 * @param {number} [atMs] - instant whose tier the UI labels the price with.
 * @param {(date: string) => boolean} [holidayOf] - holiday test, for tests.
 * @returns {{ state: string, how: string, target: string|null, why: string,
 *   source: string|null, tier: 'peak'|'off', rates: { peak: object, offPeak: object } | null }}
 */
export function priceRow(hit, atMs = Date.now(), holidayOf = holidayOfDefault) {
  return {
    state: hit.state,
    how: hit.how,
    target: hit.target === undefined ? null : hit.target,
    why: hit.why === undefined ? null : hit.why,
    source: hit.source === undefined ? null : hit.source,
    tier: tierAt(atMs, holidayOf),
    rates: hit.price === null
      ? null
      : { peak: ratesOf(hit.price, 'peak'), offPeak: ratesOf(hit.price, 'off') },
  };
}

/**
 * The two generated reference tables, grouped, with the source each id came from.
 *
 * 'custom' is deliberately NOT a group here: in the dialog it is a single option
 * ("type your own price"), not a list of ids — a hand-entered price is three
 * numbers for one model key, not a reference model anyone could point another id
 * at. DeepSeek first, then Zen.
 *
 * @returns {{ source: string, ids: string[] }[]} two groups, each stable-sorted.
 */
export function referenceGroups() {
  const groups = [
    { source: 'deepseek', ids: [] },
    { source: 'zen', ids: [] },
  ];
  const bySource = new Map(groups.map((g) => [g.source, g]));
  for (const [id, entry] of Object.entries(REFERENCE_PRICES.models)) {
    const group = bySource.get(entry && entry.source);
    if (group !== undefined) group.ids.push(id);
  }
  for (const group of groups) group.ids.sort();
  return groups;
}

