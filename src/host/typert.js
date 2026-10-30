/**
 * The native client→host channel: a typert Remote contribution.
 *
 * Why this file exists (xshared-lib experience ⓪, "原生优先"): the plugin used to
 * invent its own envelope on top of `connection.fetch`. That registry is native,
 * but the typed Remote channel is the one the rest of the harness speaks, and a
 * third party can join it without compiling anything — `ctx.typert.register()`
 * is a runtime API ("any other owner calls ctx.typert.register(contribution)
 * directly", @deepseek-ai/dsh-typert-registry README).
 *
 * What the harness demands of a contribution (read from the shipped distribution,
 * @deepseek-ai/dsh-typert-loader `validateTypertManifest` / `requireInvocation` /
 * `requireStrictCodec`, and @deepseek-ai/dsh-typert-registry `register`):
 *
 *  · `package` names the owner; the manifest must be owned by the package that
 *    declares it;
 *  · every invocation carries `id/service/namespace/method`;
 *  · `namespace` MUST be the package name: the client-side service key is
 *    `remote.<namespace>` (@deepseek-ai/dsh-api-gateway client `remoteServiceKey`),
 *    so an endpoint name here means a service nobody can reach;
 *  · every parameter is `source: 'json'` or `'lookup'`, and each parameter and
 *    the result must be a STRICT codec (`mode: 'strict'`, non-empty
 *    `typeSymbol`, a `create()` factory; give `encode` on the result or the
 *    gateway skips its own result handling);
 *  · the gateway resolves `descriptor.service` on the receiver context and
 *    cross-checks the `typertRemote` binding, so the plugin must ALSO provide a
 *    service of that name whose binding says `service` (itself), `serviceKey`
 *    and `namespace` (both the package name).
 *
 * Everything here is feature-detected: a composition without `typert` (or
 * without a reflect `provide`) keeps using the Fetch routes in rpc.js. A
 * missing capability must never throw during activation.
 */

/** The service key, the wire namespace and the package name — one string. */
export const USAGE_SERVICE = 'dsh-plugin-usage';

/** Wire names the registry accepts for namespace/method (`validateWireName`). */
const WIRE_NAME = /^[A-Za-z0-9_$.-]+$/;

/** A schema projection: the gateway only calls `parse` on inputs. */
const ANY_SCHEMA = Object.freeze({
  parse(value) {
    return value;
  },
});

const argsCodec = (endpoint) => ({
  mode: 'strict',
  typeSymbol: `${USAGE_SERVICE}/args/${endpoint}`,
  create: () => ANY_SCHEMA,
});

const resultCodec = (endpoint) => ({
  mode: 'strict',
  typeSymbol: `${USAGE_SERVICE}/result/${endpoint}`,
  create: () => ANY_SCHEMA,
  encode: (value) => value,
});

/**
 * One InvocationDescriptor for an endpoint.
 *
 * One positional `args` field, because the gateway calls Remote methods with
 * positional arguments: the client passes exactly one JSON object.
 *
 * @param {string} endpoint - endpoint name such as `query`.
 * @returns {object} invocation descriptor.
 */
export function buildInvocation(endpoint) {
  return {
    id: `${USAGE_SERVICE}#${USAGE_SERVICE}/${endpoint}`,
    service: USAGE_SERVICE,
    namespace: USAGE_SERVICE,
    method: endpoint,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'args', wire: 'args', source: 'json', codec: argsCodec(endpoint) }],
    result: resultCodec(endpoint),
    sourceLocation: { file: 'src/host/typert.js', line: 1, column: 1 },
  };
}

/**
 * The contribution handed to `ctx.typert.register()`.
 *
 * @param {string[]} endpoints - endpoint names to expose.
 * @returns {object} typert contribution.
 */
export function typertContribution(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error('typert contribution needs at least one endpoint');
  }
  for (const endpoint of endpoints) {
    if (typeof endpoint !== 'string' || !WIRE_NAME.test(endpoint)) {
      throw new Error('endpoint name is not wire-safe: ' + String(endpoint));
    }
  }
  return {
    package: USAGE_SERVICE,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: endpoints.map(buildInvocation),
  };
}

/**
 * The receiver service: the gateway resolves `descriptor.service` on it and
 * checks the binding before calling a method.
 *
 * Methods are keyed by the endpoint name verbatim (hyphens are fine as keys);
 * the browser half also tries the camelCase spelling, so both work.
 *
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @returns {object} service instance with a frozen `typertRemote` binding.
 */
export function createReceiver(handlers) {
  const receiver = {};
  for (const [endpoint, fn] of handlers) {
    receiver[endpoint] = (args) => fn(args === undefined || args === null ? {} : args);
  }
  receiver.typertRemote = Object.freeze({
    service: receiver,
    serviceKey: USAGE_SERVICE,
    namespace: USAGE_SERVICE,
  });
  return receiver;
}

/** Read a service without tripping the strict ctx proxy. */
function serviceOf(ctx, name) {
  if (!ctx) return null;
  try {
    if (typeof ctx.get === 'function') {
      const found = ctx.get(name);
      if (found) return found;
    }
  } catch {
    /* not injected */
  }
  try {
    return ctx[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * The service-providing entry point.
 *
 * `ctx.provide(name, value, check)` is Context's own API (cordis `Context.provide`,
 * "register a service implementation owned by the current fiber", returns a
 * disposer). `ctx.reflect.provide` is the same store reached through the reflect
 * facade, kept as a fallback for compositions that hide the direct method.
 */
function providerOf(ctx) {
  if (!ctx) return null;
  try {
    if (typeof ctx.provide === 'function') return (name, value) => ctx.provide(name, value);
  } catch {
    /* not exposed */
  }
  try {
    const reflect = ctx.reflect;
    if (reflect && typeof reflect.provide === 'function') return (name, value) => reflect.provide(name, value);
  } catch {
    /* not exposed */
  }
  return serviceOf(ctx, 'reflect');
}

/**
 * Join the native Remote channel, when this composition has one.
 *
 * Returns a small record rather than a boolean: the plugin reports which channel
 * it ended up on, and WHY when it could not take the native one. That record
 * travels to the browser with the dashboard response (`channel`), because a
 * plugin logger is not always wired into the harness log.
 *
 * @param {any} ctx - host plugin context.
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @param {(message: string, level?: string) => void} [log] - log sink.
 * @returns {{ ok: boolean, transport: 'remote' | 'fetch', reason: string }} decision.
 */
export function registerTypert(ctx, handlers, log) {
  const note = (message, level = 'warn') => { if (typeof log === 'function') log(message, level); };
  const failed = (reason) => {
    note('[usage] client→host channel: Fetch (' + reason + ')');
    return { ok: false, transport: 'fetch', reason };
  };
  const typert = serviceOf(ctx, 'typert');
  if (typert === null || typeof typert.register !== 'function') {
    return failed('no typert registry in this composition');
  }

  const provider = providerOf(ctx);
  if (provider === null || typeof provider !== 'function') {
    return failed('this ctx cannot provide a service (ctx.provide missing)');
  }

  let dispose = null;
  try {
    dispose = provider(USAGE_SERVICE, createReceiver(handlers));
  } catch (error) {
    return failed('providing the receiver failed: ' + String((error && error.message) || error));
  }
  try {
    typert.register(typertContribution([...handlers.keys()]));
    note('[usage] client→host channel: native typert Remote (' + handlers.size + ' endpoints)', 'info');
    return { ok: true, transport: 'remote', reason: 'registered ' + handlers.size + ' endpoints' };
  } catch (error) {
    // Registration is atomic: a rejected contribution means nothing is reachable,
    // so take the receiver back out and let the Fetch routes carry the plugin.
    if (typeof dispose === 'function') {
      try { dispose(); } catch { /* already gone */ }
    }
    return failed('typert rejected the contribution: ' + String((error && error.message) || error));
  }
}
