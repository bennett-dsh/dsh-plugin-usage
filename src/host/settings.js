/**
 * Price table + cost computation.
 *
 * Persistence is the official plugin-config path: `index.js` exports a
 * schemastery `Config`, so DSH materializes a form under the plugin entry's
 * id (`usage`) in the Plugins settings tab and stores values in the profile
 * patch. There is deliberately no private `settings.yaml` / settings-service
 * registration here — DSH 0.2.x `ctx.settings` (SettingsForms) only offers
 * `describe/update/replace/mutate/configure`, and hand-rolled namespaces are
 * not reachable from the client config surface.
 *
 * The store below stays the in-memory view the aggregation code reads.
 */
export const DEFAULT_CURRENCY = '¥';
/**
 * Currency the price table is denominated in.
 *
 * DEFAULT_PRICES carries DeepSeek's USD list price per 1M tokens (0.27 input /
 * 1.10 output / 0.07 cache-read for `deepseek-chat`, which is exactly 2 / 8 /
 * 0.5 CNY at the fixed 7:1). The table is never rewritten at runtime: a display
 * switch converts on the way out, so a query can never pollute the next one.
 */
export const PRICE_UNIT_CURRENCY = 'USD';
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
export const DEFAULT_PRICES = {
  'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v3': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v3.1': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v4': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
  'deepseek-v4.1-flash': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
  'deepseek-v4.1-flash-1017': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
  // DSH's routed default model id (`magpie` provider) aliases the same route;
  // without this entry every session bills as "unpriced" on a stock install.
  'group/auto-deepseek-v4-1-flash': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
  'deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
  'deepseek-r1': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
};

/**
 * Shallow-merge configured prices over the defaults.
 *
 * @param {unknown} incoming - configured per-model prices.
 * @returns {Record<string, object>} complete price table.
 */
export function mergePrices(incoming) {
  const merged = Object.assign({}, DEFAULT_PRICES);
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [model, price] of Object.entries(incoming)) {
      if (price && typeof price === 'object') {
        merged[model] = {
          inputPerM: Number(price.inputPerM) || 0,
          outputPerM: Number(price.outputPerM) || 0,
          cacheReadPerM: Number(price.cacheReadPerM) || 0,
          cacheWritePerM: Number(price.cacheWritePerM) || 0,
        };
      }
    }
  }
  return merged;
}

export function createPriceStore(defaultPrices, defaultCurrency) {
  const prices = Object.assign({}, defaultPrices);
  let currency = defaultCurrency || DEFAULT_CURRENCY;
  const store = {
    prices,
    get currency() { return currency; },
    /** Merge incoming per-model prices (each field coerced to a number). */
    setPrices(incoming) {
      if (!incoming || typeof incoming !== 'object') return;
      for (const [model, p] of Object.entries(incoming)) {
        if (p && typeof p === 'object') {
          prices[model] = {
            inputPerM: Number(p.inputPerM) || 0,
            outputPerM: Number(p.outputPerM) || 0,
            cacheReadPerM: Number(p.cacheReadPerM) || 0,
            cacheWritePerM: Number(p.cacheWritePerM) || 0,
          };
        }
      }
    },
    setCurrency(v) {
      if (typeof v === 'string' && v.length > 0) currency = v;
    },
    /** Look up a price by `provider/model` composite first, then bare model. */
    priceOf(r) {
      const composite = r.provider ? r.provider + '/' + r.model : '';
      return prices[composite] || prices[r.model];
    },
    /** Whether an explicit price entry exists (composite first, then bare model). */
    hasPrice(r) {
      const composite = r.provider ? r.provider + '/' + r.model : '';
      return composite in prices || r.model in prices;
    },
    costOf(r) {
      const p = store.priceOf(r);
      if (!p) return 0;
      return (
        r.inputTokens * p.inputPerM +
        r.outputTokens * p.outputPerM +
        r.cacheReadTokens * (p.cacheReadPerM || 0) +
        r.cacheWriteTokens * (p.cacheWritePerM || 0)
      ) / 1e6;
    },
    snapshot() {
      return { prices: Object.assign({}, prices), currency };
    },
  };
  return store;
}
