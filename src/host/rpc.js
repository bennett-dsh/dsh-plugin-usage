/**
 * RPC registration.
 *
 * Dynamic-plugin runs expose `harness` directly; static (bundle) installs
 * expose the Connection service. Support both from one file, plus the
 * official Typert gateway path (P0-3).
 *
 * Host side, preference order:
 *   1. dynamic-plugin run      -> `harness.handle(endpoint, fn)`
 *   2. Typert gateway present  -> `typert.register(channel, endpoints)`
 *   3. static (bundle) install -> Connection
 *
 * Connection has two registries and they are NOT interchangeable:
 *
 *   - `connection.fetch.register(route)` adds one exact route to the shared
 *     `/api` dispatch table. It only touches the service's own map, so it
 *     works from any fiber.
 *   - `connection.rpc.handle(channel, handler)` mounts a physical prefix route
 *     through `owner.webServer.register(route)`, where `owner` is the fiber
 *     that READ the service. On 0.2.x every plugin fiber is a strict proxy: a
 *     plugin whose `inject` is `['timer']` throws `cannot get property
 *     "webServer" without inject` inside that registration, `effect()`
 *     rethrows it, and the channel silently never mounts — observed as HTTP
 *     405 on `/usage/*` with no host-side message. Adding `webServer` to the
 *     plugin's static `inject` would "fix" it only for compositions that own a
 *     web server, and would gate dynamic-plugin loads on a service they never
 *     get, so the fetch registry is the correct seam for a bundle install.
 *
 * Therefore: register exact Fetch routes on the shared `/api` channel when
 * that registry exists, and keep the legacy `/usage` prefix channel as a
 * best-effort fallback for older hosts. The browser half calls the Fetch route
 * first and falls back to the legacy channel on "route missing".
 *
 * Wire format of one Fetch route (POST `/api/usage/<endpoint>`):
 *   request body  = JSON of the endpoint args (or empty for no args)
 *   response body = `{ ok: true, value }` | `{ ok: false, error: { code, message } }`
 * i.e. the same result shape the legacy RPC channel wraps, minus its envelope.
 */

import { registerTypert } from './typert.js';

/** Absolute logical channel owned by this plugin on pre-0.2 hosts. */
export const USAGE_RPC_CHANNEL = '/usage';

/** Shared-channel path prefix owned by this plugin (`/api` is Connection's mount). */
export const USAGE_API_PREFIX = '/api/usage';

/**
 * Exact Fetch route path for one endpoint.
 *
 * @param {string} endpoint - endpoint name such as `query`.
 * @returns {string} absolute path below `/api`, as `connection.fetch.register` requires.
 */
export function fetchRoutePath(endpoint) {
  return USAGE_API_PREFIX + '/' + endpoint;
}

/**
 * Failure result in the Connection RPC result shape.
 *
 * The message here is for the CALLER and must be safe to render: raw error text
 * belongs in the host log (see `dispatch`), never on the page.
 *
 * @param {string} message - human-readable failure.
 * @param {string} [code] - stable error code.
 * @returns {{ ok: false, error: { code: string, message: string, details: object } }} failure result.
 */
export function errorResult(message, code = 'internal') {
  return { ok: false, error: { code, message, details: {} } };
}

/** What the page is told when a handler throws: the detail goes to the log. */
export const INTERNAL_MESSAGE = 'internal error';

/**
 * Log sink for one host context.
 *
 * `ctx.logger` is the native channel (official plugins log through it); the
 * console is only a fallback for a composition that has no logger. Wrapped
 * because ctx is a strict proxy and a bare `ctx.logger` can throw.
 *
 * @param {any} ctx - host plugin context.
 * @returns {(message: string, level?: 'warn' | 'error') => void} sink.
 */
export function logSink(ctx) {
  let logger = null;
  try {
    logger = ctx && typeof ctx.get === 'function' ? ctx.get('logger') : null;
  } catch {
    logger = null;
  }
  if (!logger) {
    try {
      if (ctx && ctx.logger && typeof ctx.logger.error === 'function') logger = ctx.logger;
    } catch {
      logger = null;
    }
  }
  if (logger && typeof logger.error === 'function') {
    return (message, level = 'warn') => {
      const fn = level === 'error' ? logger.error : (typeof logger.warn === 'function' ? logger.warn : logger.error);
      fn.call(logger, message);
    };
  }
  return (message, level = 'warn') => (level === 'error' ? console.error(message) : console.warn(message));
}

/**
 * Run one endpoint through the handler map, converting throws into results.
 *
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @param {string} endpoint - endpoint name.
 * @param {unknown} args - decoded endpoint arguments.
 * @param {(message: string, level?: 'warn' | 'error') => void} [log] - host log sink for the raw error.
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: object }>} RPC result.
 */
export async function dispatch(handlers, endpoint, args, log) {
  const fn = handlers.get(endpoint);
  if (fn === undefined) return errorResult(`unknown endpoint: ${endpoint}`, 'bad-request');
  try {
    return { ok: true, value: await fn(args) };
  } catch (error) {
    const detail = String((error && error.stack) || (error && error.message) || error);
    if (typeof log === 'function') log(`[usage] ${endpoint} failed: ${detail}`, 'error');
    return errorResult(INTERNAL_MESSAGE, 'internal');
  }
}

/**
 * Build the Fetch-shaped handler for one exact route.
 *
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @param {string} endpoint - endpoint name.
 * @param {(message: string, level?: 'warn' | 'error') => void} [log] - host log sink.
 * @returns {(request: Request) => Promise<Response>} route handler.
 */
export function createFetchRoute(handlers, endpoint, log) {
  return async function fetchRoute(request) {
    let args = null;
    const text = await request.text();
    if (text.length > 0) {
      try {
        args = JSON.parse(text);
      } catch {
        return Response.json(errorResult('request body is not JSON', 'bad-request'), { status: 400 });
      }
    }
    return Response.json(await dispatch(handlers, endpoint, args, log));
  };
}

/**
 * Register every endpoint on the best transport this host offers.
 *
 * @param {any} ctx - host plugin context.
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 */
export function registerRPC(ctx, handlers) {
  const dynamicHarness = (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') ? harness : null;
  if (dynamicHarness !== null) {
    for (const [endpoint, fn] of handlers) {
      dynamicHarness.handle('usage/' + endpoint, fn);
    }
    return;
  }

  // Native Remote channel (see ./typert.js for the contract and its evidence).
  // Registered in addition to the Fetch routes below, not instead of them: the
  // browser half prefers Remote and falls back to Fetch, so both must be real.
  //
  // ⚠️ Do not probe `ctx.get('typert')` at activation time: cordis `get` returns
  // only services whose providing fiber is ACTIVE (`_getImpl` checks
  // `impl.fiber.state === 2`), and sibling bundles in this composition can
  // activate after us. A one-shot probe reports "no typert registry" on a host
  // that has one. Declare the dependency instead — the same pattern used for
  // `connection` below — and record the decision when it lands.
  const log = logSink(ctx);
  const channel = { ok: false, transport: 'fetch', reason: 'typert not active yet (waiting for the dependency)' };
  ctx.inject(['typert'], (typertCtx) => {
    Object.assign(channel, registerTypert(typertCtx, handlers, log));
  });

  // Static (bundle) installs: the `connection` service is provided
  // asynchronously by the client-connection plugin, so wait for it before
  // registering (the official api-gateway pattern).
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection;
    if (connection === undefined || connection === null) return;

    // 0.2+: exact Fetch routes on the shared /api channel. This is the path
    // that actually mounts a route: it never reads `webServer`, so the strict
    // fiber proxy cannot reject it.
    const fetchRegistry = connection.fetch;
    let mountedFetchRoutes = 0;
    if (fetchRegistry !== undefined && typeof fetchRegistry.register === 'function') {
      for (const endpoint of handlers.keys()) {
        const path = fetchRoutePath(endpoint);
        try {
          fetchRegistry.register({
            path,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: createFetchRoute(handlers, endpoint, log),
          });
          mountedFetchRoutes += 1;
        } catch (error) {
          log(`[usage] failed to mount shared Fetch route ${path}: ${String((error && error.message) || error)}`);
        }
      }
    }

    // Pre-0.2 hosts (and any composition that still exposes the prefix
    // channel): the legacy /usage RPC bridge. On 0.2.x this throws inside
    // effect() because the reading fiber owns no `webServer`; that is expected
    // and already covered by the Fetch routes, so the failure stays local.
    const rpcRegistry = connection.rpc;
    if (rpcRegistry !== undefined && typeof rpcRegistry.handle === 'function') {
      try {
        rpcRegistry.handle(USAGE_RPC_CHANNEL, async (endpoint, args) => dispatch(handlers, endpoint, args, log), { authority: 'loopback' });
      } catch (error) {
        if (mountedFetchRoutes === 0) {
          log(`[usage] failed to mount ${USAGE_RPC_CHANNEL} RPC channel: ${String((error && error.message) || error)}`);
        }
      }
    }
  });
  return channel;
}
