/**
 * The native Remote contract, checked structurally.
 *
 * The authoritative gate is `npm run verify:typert`, which runs the OFFICIAL
 * `validateTypertManifest` from the installed harness. It needs the archive, so
 * it cannot run in CI; the rules below are the same requirements plus the ones
 * the loader does NOT check but the gateway does (namespace = package name, the
 * receiver binding) — each cites where it comes from.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  USAGE_SERVICE,
  buildInvocation,
  createReceiver,
  registerTypert,
  typertContribution,
} from '../src/host/typert.js'

const ENDPOINTS = ['query', 'prices', 'pricing', 'contract']
const HANDLERS = new Map([
  ['query', (args) => ({ kind: 'query', args })],
  ['prices', () => ({ currency: 'CNY' })],
  ['pricing', (args) => ({ kind: 'pricing', args })],
  ['contract', () => ({ package: USAGE_SERVICE, names: [] })],
])

test('the namespace is the package name, because the client key is remote.<namespace>', () => {
  // dsh-api-gateway client `remoteServiceKey(namespace) = 'remote.' + namespace`.
  // Writing an endpoint name here mounts a service nobody can reach.
  const contribution = typertContribution(ENDPOINTS)
  assert.equal(USAGE_SERVICE, 'dsh-plugin-usage')
  assert.equal(contribution.package, USAGE_SERVICE)
  for (const invocation of contribution.invocations) {
    assert.equal(invocation.namespace, USAGE_SERVICE)
    assert.equal(invocation.service, USAGE_SERVICE)
  }
})

test('the contribution has the shape the loader validates', () => {
  const contribution = typertContribution(ENDPOINTS)
  assert.equal(contribution.face, 'host')
  assert.ok(Array.isArray(contribution.schemas))
  assert.deepEqual(Object.keys(contribution.model).sort(), ['events', 'objects', 'services'])
  for (const key of Object.keys(contribution.model)) {
    assert.ok(Array.isArray(contribution.model[key]), key + ' must be an array')
  }
  assert.equal(contribution.invocations.length, ENDPOINTS.length)
  // Wire names: the registry accepts only [A-Za-z0-9_$. -] for namespace/method.
  for (const invocation of contribution.invocations) {
    assert.match(invocation.method, /^[A-Za-z0-9_$.-]+$/)
    assert.match(invocation.id, /^[A-Za-z0-9_$./#-]+$/)
  }
  // Ids are the uniqueness key of a face.
  const ids = contribution.invocations.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('every parameter and every result uses a strict codec', () => {
  // requireStrictCodec: mode === 'strict', non-empty typeSymbol, create().
  for (const invocation of typertContribution(ENDPOINTS).invocations) {
    assert.equal(invocation.parameters.length, 1, 'the gateway calls methods positionally: one JSON arg')
    const parameter = invocation.parameters[0]
    assert.equal(parameter.wire, 'args')
    // `source` is only ever 'json' or 'lookup'.
    assert.equal(parameter.source, 'json')
    assert.equal(parameter.codec.mode, 'strict')
    assert.ok(parameter.codec.typeSymbol.length > 0)
    assert.equal(typeof parameter.codec.create, 'function')
    assert.equal(typeof parameter.codec.create().parse, 'function')

    assert.equal(invocation.result.mode, 'strict')
    assert.ok(invocation.result.typeSymbol.length > 0)
    assert.equal(typeof invocation.result.create, 'function')
    // The gateway skips its own result handling without an encode().
    assert.equal(typeof invocation.result.encode, 'function')
  }
})

test('sourceLocation names a real file and positive coordinates', () => {
  const invocation = buildInvocation('query')
  assert.equal(invocation.sourceLocation.file, 'src/host/typert.js')
  assert.ok(Number.isInteger(invocation.sourceLocation.line) && invocation.sourceLocation.line >= 1)
  assert.ok(Number.isInteger(invocation.sourceLocation.column) && invocation.sourceLocation.column >= 1)
})

test('a non-wire-safe endpoint name is refused before it reaches the registry', () => {
  assert.throws(() => typertContribution(['ok-name', 'not ok']), /wire-safe/)
  assert.throws(() => typertContribution([]), /at least one endpoint/)
})

test('the receiver answers every endpoint and carries the binding the gateway checks', async () => {
  const receiver = createReceiver(HANDLERS)
  assert.equal(receiver.typertRemote.service, receiver)
  assert.equal(receiver.typertRemote.serviceKey, USAGE_SERVICE)
  assert.equal(receiver.typertRemote.namespace, USAGE_SERVICE)
  assert.ok(Object.isFrozen(receiver.typertRemote))
  // Methods are keyed verbatim, so a hyphenated endpoint is reachable.
  assert.deepEqual(await receiver.query({ a: 1 }), { kind: 'query', args: { a: 1 } })
  // A missing argument must not become `undefined` inside a handler.
  assert.deepEqual(await receiver.pricing(undefined), { kind: 'pricing', args: {} })
})

test('registration reports the channel it chose, and never throws', () => {
  const registered = []
  const makeCtx = (services) => ({
    get: (name) => services[name],
    ...(services.provide === undefined ? {} : { provide: services.provide }),
  })

  // No typert registry at all: the Fetch routes are the channel, and the reason
  // says so (it travels to the dashboard as `channel`).
  const noRegistry = registerTypert(makeCtx({}), HANDLERS, () => {})
  assert.equal(noRegistry.ok, false)
  assert.equal(noRegistry.transport, 'fetch')
  assert.match(noRegistry.reason, /no typert registry/)

  // A registry but no way to provide the receiver service: registering anyway
  // would point the client at a channel that cannot answer.
  const noProvide = registerTypert(makeCtx({ typert: { register: (c) => registered.push(c) } }), HANDLERS, () => {})
  assert.equal(noProvide.ok, false)
  assert.match(noProvide.reason, /cannot provide/)
  assert.deepEqual(registered, [])

  // ctx.provide() — the real entry point — is enough on its own.
  const provided = []
  const ok = registerTypert(makeCtx({
    typert: { register: (c) => { registered.push(c); return () => {} } },
    provide: (name, value) => { provided.push({ name, value }); return () => {} },
  }), HANDLERS, () => {})
  assert.equal(ok.ok, true)
  assert.equal(ok.transport, 'remote')
  assert.equal(provided.length, 1)
  assert.equal(provided[0].name, 'dsh-plugin-usage')

  // provide() throws: stay on the Fetch path, say why.
  const throwing = registerTypert(makeCtx({
    typert: { register: () => {} },
    provide: () => { throw new Error('nope') },
  }), HANDLERS, () => {})
  assert.equal(throwing.ok, false)
  assert.match(throwing.reason, /providing the receiver failed: nope/)

  // register() throws: the receiver must be taken back out again.
  let disposed = 0
  const rejecting = registerTypert(makeCtx({
    typert: { register: () => { throw new Error('face rejected') } },
    provide: () => () => { disposed += 1 },
  }), HANDLERS, () => {})
  assert.equal(rejecting.ok, false)
  assert.equal(disposed, 1, 'a rejected face must not leave the receiver behind')
  assert.match(rejecting.reason, /typert rejected the contribution: face rejected/)
})
