/**
 * Currency + the user's own price table + the in-memory price store.
 *
 * There is exactly one pricing policy in this plugin, and it lives in
 * pricing.js: the ladder. This file owns the two things around it that are not
 * policy —
 *
 *  - the display currency, converted once at the query boundary;
 *  - the user's explicit price rows, which are an *override*, never a catalogue.
 *
 * That last point is the whole reason this file lost its `DEFAULT_PRICES`: a
 * hard-coded copy of a vendor price is a second source of truth that outranks
 * the generated table (the ladder checks the user table first), so it silently
 * wins even when it is stale. It was: one row carried a cached-input price 13.3×
 * the official list, and seven of ten rows named ids the vendor had retired. A
 * price the reference table can answer belongs in the generation script; a price
 * only the user knows (an odd relay id) belongs here.
 *
 * Spelling: the config form persists `inputPerM`-style fields because that is
 * what older profiles already contain, and renaming them would zero every saved
 * price on the next save. `normalizePrices` / `configPrices` are the only two
 * places that know this, and the store works in the canonical
 * `{ input, output, cacheRead, cacheWrite }` shape that `ratesOf` reads.
 *
 * Persistence stays the official plugin-config path: `index.js` exports a
 * schemastery `Config`, so DSH materializes a form under the plugin entry's id
 * (`usage`) in the Plugins settings tab. There is deliberately no private
 * `settings.yaml` / settings-service registration here — DSH 0.2.x
 * `ctx.settings` (SettingsForms) only offers `describe/update/replace/mutate/
 * configure`, and hand-rolled namespaces are not reachable from the client
 * config surface.
 */
import { costOf, resolvePrice } from './pricing.js';

export const DEFAULT_CURRENCY = '¥';

/** Display currencies; `perUsd` is how many units of it one USD buys. */
export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', perUsd: 1 },
  CNY: { code: 'CNY', symbol: '¥', perUsd: 7 },
};

function currencyCodeOf(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (raw === 'USD' || raw === '$' || raw === 'US$') return 'USD';
  if (raw === 'CNY' || raw === '¥' || raw === 'RMB' || raw === 'CN¥') return 'CNY';
  return '';
}

/**
 * Resolve a configured currency (ISO code or the bare symbol the store has
 * always held) to a CURRENCIES entry. Unknown values fall back to `fallback`,
 * then to the default display currency — never throw on user input.
 *
 * @param {unknown} value
 * @param {unknown} [fallback]
 */
export function currencyOf(value, fallback) {
  const hit = CURRENCIES[currencyCodeOf(value)];
  if (hit) return hit;
  const fb = CURRENCIES[currencyCodeOf(fallback)];
  if (fb) return fb;
  return CURRENCIES[currencyCodeOf(DEFAULT_CURRENCY)] || CURRENCIES.CNY;
}

/** Rate field on the canonical row, and the name the config form persists. */
const RATE_FIELDS = [
  ['input', 'inputPerM'],
  ['output', 'outputPerM'],
  ['cacheRead', 'cacheReadPerM'],
  ['cacheWrite', 'cacheWritePerM'],
];

/**
 * Turn configured rows into the canonical rate shape the ladder reads.
 *
 * Accepts both spellings, drops entries that are not objects, and coerces every
 * rate to a number (a form field saved as a string must not become NaN and then
 * a zero cost). Unknown keys are dropped: a typo must not become a price.
 *
 * @param {unknown} incoming - rows from the plugin config or the `prices` RPC.
 * @returns {Record<string, { input: number, output: number, cacheRead: number, cacheWrite: number }>}
 */
export function normalizePrices(incoming) {
  const out = {};
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return out;
  for (const [key, row] of Object.entries(incoming)) {
    if (!row || typeof row !== 'object') continue;
    const rate = {};
    for (const [canonical, legacy] of RATE_FIELDS) {
      const v = row[canonical] !== undefined ? row[canonical] : row[legacy];
      rate[canonical] = Number(v) || 0;
    }
    out[key] = rate;
  }
  return out;
}

/**
 * The inverse of `normalizePrices`, for the config form.
 *
 * Only needed because the persisted schema still spells `inputPerM`; keeping the
 * mapper here means the rest of the codebase never sees that spelling.
 *
 * @param {Record<string, object>} prices - canonical rows.
 * @returns {Record<string, object>} rows the Config schema accepts.
 */
export function configPrices(prices) {
  const out = {};
  for (const [key, row] of Object.entries(prices || {})) {
    const rate = {};
    for (const [canonical, legacy] of RATE_FIELDS) rate[legacy] = Number(row[canonical]) || 0;
    out[key] = rate;
  }
  return out;
}

/**
 * The in-memory pricing view the aggregation code reads.
 *
 * It owns no policy: every answer comes from `resolvePrice` / `costOf`, so the
 * dashboard, the dialog and the settings form cannot disagree about what a model
 * costs.
 *
 * @param {unknown} defaultPrices - configured price rows (any spelling).
 * @param {string} [defaultCurrency] - display currency.
 * @param {{ matches?: Record<string,string>|(() => Record<string,string>) }} [options]
 *   confirmed matches, or a getter for the live map (a commit replaces the map,
 *   so a store closing over a snapshot would price from the pre-commit state).
 */
export function createPriceStore(defaultPrices, defaultCurrency, options = {}) {
  const prices = normalizePrices(defaultPrices);
  let currency = defaultCurrency || DEFAULT_CURRENCY;
  const matchesOf = typeof options.matches === 'function'
    ? options.matches
    : () => (options.matches && typeof options.matches === 'object' ? options.matches : null);
  const isRecord = (r) => r !== null && typeof r === 'object';
  const store = {
    prices,
    get currency() { return currency; },
    /** Merge incoming rows over the current ones (both normalized). */
    setPrices(incoming) {
      Object.assign(prices, normalizePrices(incoming));
    },
    setCurrency(v) {
      if (typeof v === 'string' && v.length > 0) currency = v;
    },
    /**
     * Resolve one record to a price.
     *
     * @param {{ provider?: string, model?: string }} r - a usage record.
     * @returns {{ price: object|null, how: string, state: string, target: string|null, why: string }}
     */
    lookup(r) {
      if (!isRecord(r)) return { price: null, how: 'unmatched', state: 'none', target: null, why: '' };
      return resolvePrice({
        model: typeof r.model === 'string' ? r.model : '',
        provider: typeof r.provider === 'string' ? r.provider : '',
        custom: prices,
        matches: matchesOf(),
      });
    },
    /** The first hit of the ladder, keeping the old `undefined when absent` contract. */
    priceOf(r) {
      const hit = store.lookup(r);
      return hit.price === null ? undefined : hit.price;
    },
    /** Whether the ladder found a price at all. */
    hasPrice(r) {
      return store.lookup(r).price !== null;
    },
    costOf(r) {
      const hit = store.lookup(r);
      return hit.price === null ? 0 : costOf(r, hit.price);
    },
    snapshot() {
      return { prices: Object.assign({}, prices), currency };
    },
  };
  return store;
}
