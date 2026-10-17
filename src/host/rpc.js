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
 * @param {string} message - human-readable failure.
 * @param {string} [code] - stable error code.
 * @returns {{ ok: false, error: { code: string, message: string, details: object } }} failure result.
 */
export function errorResult(message, code = 'internal') {
  return { ok: false, error: { code, message, details: {} } };
}

/**
 * Run one endpoint through the handler map, converting throws into results.
 *
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @param {string} endpoint - endpoint name.
 * @param {unknown} args - decoded endpoint arguments.
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: object }>} RPC result.
 */
export async function dispatch(handlers, endpoint, args) {
  const fn = handlers.get(endpoint);
  if (fn === undefined) return errorResult(`unknown endpoint: ${endpoint}`, 'bad-request');
  try {
    return { ok: true, value: await fn(args) };
  } catch (error) {
    return errorResult(String((error && error.message) || error));
  }
}

/**
 * Build the Fetch-shaped handler for one exact route.
 *
 * @param {Map<string, (args: any) => any>} handlers - endpoint handlers.
 * @param {string} endpoint - endpoint name.
 * @returns {(request: Request) => Promise<Response>} route handler.
 */
export function createFetchRoute(handlers, endpoint) {
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
    return Response.json(await dispatch(handlers, endpoint, args));
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

  // P0-3 official Typert gateway path.
  //
  // Target API: @deepseek-ai/dsh-api-gateway host service, exposed on the host
  // Read the gateway only via `ctx.get('typertGateway')` — cordis ctx is a
  // property). The installed v0.1.0-rc.7 `TypertGateway` interface exposes
  // only invoke() (see the package's lib/types/types.d.ts); the documented
  // contribution path (@Remote/@RemoteScope + TypertRemoteService or
  // bindTypertRemote from @deepseek-ai/dsh-typert-protocol) needs a runtime
  // dependency this plugin must not add, so we only claim endpoints through a
  // registration surface that already exists on the detected object:
  // `typert.register(channel, endpoints)`, a forward-compatible contribution
  // hook for host compositions that expose the gateway with registration.
  //
  // Precondition for this path to activate: the resolved typert gateway is
  // non-null AND `typert.register` is a function. Endpoint functions receive
  // (args) and return the raw value; the gateway/connection side owns the
  // RPC envelope. Otherwise we fall back silently to the connection bridge
  // below. All guards are typeof-based: nothing is imported, zero deps.
  // cordis ctx is a strict proxy: direct property access to an un-injected
  // service throws — always use ctx.get (returns undefined when absent).
  const typert = typeof ctx.get === 'function' ? ctx.get('typertGateway') : undefined;
  if (typert && typeof typert.register === 'function') {
    const endpoints = {};
    for (const [endpoint, fn] of handlers) {
      endpoints[endpoint] = fn;
    }
    typert.register('usage', endpoints);
    return;
  }

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
            fetch: createFetchRoute(handlers, endpoint),
          });
          mountedFetchRoutes += 1;
        } catch (error) {
          console.warn(`[usage] failed to mount shared Fetch route ${path}: ${String((error && error.message) || error)}`);
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
        rpcRegistry.handle(USAGE_RPC_CHANNEL, async (endpoint, args) => dispatch(handlers, endpoint, args), { authority: 'loopback' });
      } catch (error) {
        if (mountedFetchRoutes === 0) {
          console.warn(`[usage] failed to mount ${USAGE_RPC_CHANNEL} RPC channel: ${String((error && error.message) || error)}`);
        }
      }
    }
  });
}
