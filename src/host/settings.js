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
    /** Write-through slot wired by initSettings(); null without a settings service. */
    persist: null,
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
      if (typeof store.persist === 'function') store.persist({ prices: Object.assign({}, prices) });
    },
    setCurrency(v) {
      if (typeof v === 'string' && v.length > 0) {
        currency = v;
        if (typeof store.persist === 'function') store.persist({ currency });
      }
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

const USAGE_PRICES_NS = 'usage.prices';

/** JSON-schema-shaped descriptor for the usage.prices settings section. */
const PRICE_SECTION_DESCRIPTOR = {
  type: 'object',
  properties: {
    prices: {
      type: 'object',
      description: 'Per-model prices (cost per 1M tokens, in `currency`).',
      additionalProperties: {
        type: 'object',
        properties: {
          inputPerM: { type: 'number' },
          outputPerM: { type: 'number' },
          cacheReadPerM: { type: 'number' },
          cacheWritePerM: { type: 'number' },
        },
        required: ['inputPerM', 'outputPerM', 'cacheReadPerM', 'cacheWritePerM'],
      },
    },
    currency: { type: 'string' },
  },
  required: ['prices', 'currency'],
};

/** Apply a resolved settings section onto the in-memory price store. */
function applySection(store, section) {
  if (!section || typeof section !== 'object') return;
  if (typeof store.setPrices === 'function' && section.prices && typeof section.prices === 'object' && !Array.isArray(section.prices)) {
    store.setPrices(section.prices);
  }
  if (typeof store.setCurrency === 'function' && typeof section.currency === 'string') store.setCurrency(section.currency);
}

/**
 * P0-1: wire the price store to the official `ctx.settings` namespace
 * (durable, shown in the official Plugins config tab) when available.
 * Registers `usage.prices`, seeds the store from the resolved section, and
 * writes every setPrices/setCurrency mutation through. Falls back to the
 * in-memory store whenever the settings service is missing or unavailable.
 */
export function initSettings(ctx, store) {
  if (!ctx || typeof ctx.get !== 'function' || !store || typeof store !== 'object') return;
  let settings;
  try {
    settings = ctx.get('settings');
  } catch {
    return;
  }
  if (!settings || typeof settings.register !== 'function') return;

  let scope;
  try {
    scope = settings.register(
      USAGE_PRICES_NS,
      PRICE_SECTION_DESCRIPTOR,
      { base: { prices: DEFAULT_PRICES, currency: DEFAULT_CURRENCY }, applies: 'live' },
    );
  } catch {
    return; // registration failed — keep the current in-memory behavior
  }

  store.persist = (patch) => {
    try {
      if (scope && typeof scope.update === 'function') return scope.update(USAGE_PRICES_NS, patch);
      if (settings && typeof settings.update === 'function') return settings.update(USAGE_PRICES_NS, patch);
    } catch {
      // Never throw when the settings scope is unavailable.
    }
  };

  let section;
  try {
    if (scope && typeof scope.get === 'function') section = scope.get();
    else if (settings && typeof settings.get === 'function') section = settings.get(USAGE_PRICES_NS);
  } catch {
    section = undefined;
  }
  if (section && typeof section.then === 'function') {
    section.then((resolved) => applySection(store, resolved)).catch(() => {});
  } else {
    applySection(store, section);
  }
}
