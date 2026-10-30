/**
 * Regression coverage for src/host/rpc.js — the transport seam that issue #1
 * reported as silently missing (HTTP 405 on `/usage/*` under DSH 0.2.x).
 *
 * The legacy `/usage` prefix channel mounts through `owner.webServer`, and the
 * owner is the *reading* fiber, so a plugin that only injects `timer` makes
 * `connection.rpc.handle()` throw inside `effect()`. The shared-channel Fetch
 * registry never reads `webServer`, so it must be the preferred transport.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERNAL_MESSAGE,
  USAGE_API_PREFIX,
  USAGE_RPC_CHANNEL,
  createFetchRoute,
  dispatch,
  errorResult,
  fetchRoutePath,
  registerRPC,
} from '../src/host/rpc.js';

const HANDLERS = new Map([
  ['query', async (args) => ({ echo: args, kind: 'query' })],
  ['prices', async () => ({ currency: 'CNY' })],
]);

/** Build a fake Connection worth registering against, recording what it saw. */
function fakeConnection(overrides = {}) {
  const routes = [];
  const channels = [];
  return {
    routes,
    channels,
    value: {
      fetch: {
        register(route) {
          routes.push(route);
          return async () => {};
        },
      },
      rpc: {
        handle(channel, handler) {
          channels.push({ channel, handler });
          return async () => {};
        },
      },
      ...overrides,
    },
  };
}

/** Fake host context: `inject` runs the callback immediately, like a live fiber. */
function fakeCtx(connection, { typert, logger = true, noProvide = false } = {}) {
  const seen = {};
  const logs = [];
  const recorder = logger === false ? undefined : {
    warn: (message) => logs.push({ level: 'warn', message }),
    error: (message) => logs.push({ level: 'error', message }),
  };
  const provided = [];
  const ctx = {
    seen,
    connection,
    logs,
    provided,
    get(name) {
      if (name === 'typert') return typert;
      if (name === 'logger') return recorder;
      return undefined;
    },
    provide: noProvide ? undefined : (name, value) => { provided.push({ name, value }); return () => {}; },
    inject(deps, callback) {
      // Declared dependencies fire synchronously in this fake; the child ctx
      // sees the same services as the parent (which is what cordis does for an
      // active service), so one recorder is enough.
      seen.deps = deps;
      seen.depsHistory = (seen.depsHistory || []).concat([deps]);
      seen.connectionCtx = { connection };
      callback(ctx);
    },
  };
  return ctx;
}

/** Capture console.warn while a block runs. */
async function captureWarnings(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test('fetchRoutePath keeps every route below Connection\'s /api mount', () => {
  assert.equal(fetchRoutePath('query'), USAGE_API_PREFIX + '/query');
  assert.equal(fetchRoutePath('query'), '/api/usage/query');
  // connection.fetch.register() rejects any route outside /api.
  assert.match(fetchRoutePath('pricing'), /^\/api\/usage\/[A-Za-z0-9_$.-]+$/);
});

test('registerRPC mounts one POST Fetch route per endpoint (0.2.x transport)', async () => {
  const connection = fakeConnection();
  const ctx = fakeCtx(connection.value);

  await captureWarnings(() => registerRPC(ctx, HANDLERS));

  assert.deepEqual(ctx.seen.deps, ['connection']);
  assert.deepEqual(connection.routes.map((route) => route.path), [
    '/api/usage/query',
    '/api/usage/prices',
  ]);
  for (const route of connection.routes) {
    assert.deepEqual(route.methods, ['POST']);
    assert.equal(route.requestBody, 'buffered');
    assert.equal(typeof route.fetch, 'function');
  }
});

test('registerRPC still tries the legacy /usage channel for older hosts', async () => {
  const connection = fakeConnection();
  await captureWarnings(() => registerRPC(fakeCtx(connection.value), HANDLERS));
  assert.deepEqual(connection.channels.map((entry) => entry.channel), [USAGE_RPC_CHANNEL]);
});

test('registerRPC survives a throwing legacy registration when Fetch routes mounted', async () => {
  // Reproduces DSH 0.2.x: registering the prefix channel throws inside effect()
  // because the reading fiber owns no webServer.
  const connection = fakeConnection({
    rpc: {
      handle() {
        throw new Error('cannot get property "webServer" without inject');
      },
    },
  });
  const ctx = fakeCtx(connection.value);
  await captureWarnings(async () => {
    registerRPC(ctx, HANDLERS);
  });

  assert.equal(connection.routes.length, 2);
  // A mounted Fetch registry already carries the channel: no mount failure.
  assert.deepEqual(ctx.logs.filter((line) => /failed to mount/.test(line.message)), []);
});

test('registerRPC warns when no transport could be mounted at all', async () => {
  const connection = fakeConnection({
    fetch: undefined,
    rpc: {
      handle() {
        throw new Error('cannot get property "webServer" without inject');
      },
    },
  });
  const ctx = fakeCtx(connection.value);
  const warnings = await captureWarnings(async () => {
    registerRPC(ctx, HANDLERS);
  });
  // The native channel carries it: nothing is written to the console.
  assert.deepEqual(warnings, []);
  const failures = ctx.logs.filter((line) => /failed to mount/.test(line.message));
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /failed to mount \/usage RPC channel/);
});

test('without a logger the mount failure still reaches the console', async () => {
  // A composition with no logger must not swallow the failure: the fallback
  // exists so a missing service is visible, not so it is silent.
  const connection = fakeConnection({
    fetch: undefined,
    rpc: { handle() { throw new Error('no webServer'); } },
  });
  const warnings = await captureWarnings(async () => {
    registerRPC(fakeCtx(connection.value, { logger: false }), HANDLERS);
  });
  const failures = warnings.filter((line) => /failed to mount/.test(line));
  assert.equal(failures.length, 1);
});

test('fetch route decodes JSON args and returns the RPC result envelope', async () => {
  const route = createFetchRoute(HANDLERS, 'query');
  const response = await route(new Request('http://dsh.internal/api/usage/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '2026-01-01' }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    value: { echo: { from: '2026-01-01' }, kind: 'query' },
  });
});

test('fetch route tolerates an empty body (args = null)', async () => {
  const route = createFetchRoute(HANDLERS, 'prices');
  const response = await route(new Request('http://dsh.internal/api/usage/prices', { method: 'POST' }));
  assert.deepEqual(await response.json(), { ok: true, value: { currency: 'CNY' } });
});

test('fetch route rejects a malformed JSON body with 400', async () => {
  const route = createFetchRoute(HANDLERS, 'query');
  const response = await route(new Request('http://dsh.internal/api/usage/query', {
    method: 'POST',
    body: '{not json',
  }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'bad-request');
});

test('dispatch converts unknown endpoints and thrown handlers into results', async () => {
  const throwing = new Map([['boom', () => { throw new Error('handler exploded'); }]]);

  assert.deepEqual(await dispatch(HANDLERS, 'nope', null), errorResult('unknown endpoint: nope', 'bad-request'));

  const logged = [];
  const body = await dispatch(throwing, 'boom', null, (message) => logged.push(message));
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'internal');
  // The page gets a stable, safe line; the raw error goes to the host log.
  assert.equal(body.error.message, INTERNAL_MESSAGE);
  assert.ok(!body.error.message.includes('handler exploded'), 'the raw error must not reach the caller');
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes('handler exploded'), logged[0]);
});

test('a dynamic-plugin run keeps using harness.handle', async () => {
  const calls = [];
  globalThis.harness = { handle: (endpoint, fn) => calls.push({ endpoint, fn }) };
  try {
    const connection = fakeConnection();
    registerRPC(fakeCtx(connection.value), HANDLERS);
    assert.deepEqual(calls.map((call) => call.endpoint), ['usage/query', 'usage/prices']);
    assert.deepEqual(connection.routes, []);
  } finally {
    delete globalThis.harness;
  }
});

test('the plugin joins the native typert Remote channel when the host has one', async () => {
  const registered = [];
  const typert = { register: (contribution) => { registered.push(contribution); return () => {}; } };
  const connection = fakeConnection();

  const ctx = fakeCtx(connection.value, { typert });
  registerRPC(ctx, HANDLERS);

  // The receiver service is what the gateway resolves descriptor.service on.
  assert.equal(ctx.provided.length, 1);
  assert.equal(ctx.provided[0].name, 'dsh-plugin-usage');
  const receiver = ctx.provided[0].value;
  assert.equal(typeof receiver.query, 'function');
  assert.equal(typeof receiver.prices, 'function');
  assert.deepEqual(receiver.typertRemote.serviceKey, 'dsh-plugin-usage');
  assert.deepEqual(receiver.typertRemote.namespace, 'dsh-plugin-usage');
  assert.equal(receiver.typertRemote.service, receiver);
  assert.deepEqual(await receiver.query({ from: 'x' }), { echo: { from: 'x' }, kind: 'query' });

  // …and the face is registered as a typert contribution, not a 2-arg call.
  assert.equal(registered.length, 1);
  assert.equal(registered[0].package, 'dsh-plugin-usage');
  assert.equal(registered[0].face, 'host');
  assert.deepEqual(registered[0].invocations.map((i) => i.method).sort(), ['prices', 'query']);
  // Both channels stay mounted: Remote is preferred, Fetch is the fallback.
  assert.deepEqual(connection.routes.map((route) => route.path).sort(), ['/api/usage/prices', '/api/usage/query']);
});

test('without a typert service the plugin keeps the Fetch routes and says which one it uses', async () => {
  const connection = fakeConnection();
  const ctx = fakeCtx(connection.value, { typert: undefined });
  registerRPC(ctx, HANDLERS);
  assert.deepEqual(connection.routes.map((route) => route.path).sort(), ['/api/usage/prices', '/api/usage/query']);
  // The choice is reported, not swallowed: a support log names the channel.
  assert.equal(ctx.logs.length, 1);
  assert.match(ctx.logs[0].message, /Fetch \(no typert registry/);
});
