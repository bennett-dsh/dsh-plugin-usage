/**
 * Price table + cost computation.
 *
 * P0-1: createPriceStore() keeps the process-memory table. The optimization
 * adds a durable settings-namespace backend via `ctx.settings` (official
 * dsh-settings) with the in-memory store as fallback — implemented by the
 * settings workstream inside this file only.
 */
export const DEFAULT_CURRENCY = '¥';
export const DEFAULT_PRICES = {
  'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v3': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v3.1': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v4': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
  'deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
  'deepseek-r1': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
};

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
    setCurrency(v) { if (typeof v === 'string' && v.length > 0) currency = v; },
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

/**
 * P0-1 seam: wire the price store to the official \`ctx.settings\` namespace
 * (durable, shown in the official Plugins config tab) when available.
 * Baseline: no-op (in-memory store only). The settings workstream implements
 * registration, initial load, and write-through inside this file.
 */
export function initSettings(ctx, store) {
  // implemented by the P0-1 workstream
}
