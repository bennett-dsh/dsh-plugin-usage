/**
 * Build helper: emit the browser bundle entry for DSH's static client-modules
 * loader.
 *
 * src/client/index.js is the single source of truth, written as the BODY of
 * the dynamic-plugin apply function (top-level consts + `return { apply }`).
 * Static composition loads plugin bundles as plain scripts, so the emitted
 * file must self-register via `window.__ModuleLoader__.load({ id, factory })`
 * (the same format official DSH client bundles ship). The factory receives the
 * loader's `require`, which resolves `react` and other shell-own modules.
 *
 * The loader id is NOT a free-form name: the host composes the client boot
 * graph by resolving each installed bundle to its nearest `package.json`
 * (`resolveMeta` -> `locatePkgJson` -> `nearestPackage`) and serves the factory
 * under that resolved package name; the browser then waits for exactly that
 * key. Install the same code under a scoped name, an npm alias or a `file:`
 * tarball and a hardcoded id stops matching — the row waits forever and the
 * renderer only reports "Renderer boot failed for 1 plugin(s)", with no
 * failing entry to inspect. The id is therefore derived from
 * `package.json#name` at build time.
 *
 * The shared body returns a plugin descriptor ({ inject, apply }) for the
 * dynamic-plugin runner; this entry unwraps that descriptor, forwards the
 * loader-provided React, remembers the context, and exposes `apply`/`inject`
 * for the cordis loader.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the loader id from a package manifest. The id has to equal the
 * installed package name (see the file header).
 *
 * There is deliberately no fallback: a guessed id is exactly the failure this
 * derivation removes, and a bundle that registers under the wrong key is never
 * activated, so an unnamed package must fail the build instead.
 *
 * @param {unknown} pkg - parsed package.json contents.
 * @param {string} [pkgPath] - manifest path used in failure messages.
 * @returns {string} the package name.
 * @throws when the manifest is not an object or carries no usable `name`.
 */
export function resolveBundleId(pkg, pkgPath = 'package.json') {
  if (pkg === null || typeof pkg !== 'object') {
    throw new Error(`Missing ${pkgPath}. Refusing to guess the client bundle's registration id.`);
  }
  const name = typeof pkg.name === 'string' ? pkg.name.trim() : '';
  if (name.length === 0) {
    throw new Error(`Missing "name" in ${pkgPath}. The bundle's registration id must equal the installed package name.`);
  }
  return name;
}

/**
 * Render the self-registering bundle text for one source body.
 *
 * @param {object} options - entry options.
 * @param {string} options.id - loader id (the installed package name).
 * @param {string} options.source - contents of src/client/index.js.
 * @param {string} options.out - absolute output path.
 * @param {string} [options.sourcePath] - absolute source path (recorded in the map).
 * @param {string|null} [options.sourceMapUrl] - external map to reference, or null for none.
 * @returns {string} the emitted bundle, with the map reference when one was asked for.
 */
export function renderClientEntry({ id, source, out, sourcePath, sourceMapUrl = null }) {
  const wrapped =
    '// Auto-generated module entry wrapping the shared client body\n' +
    '// (source: src/client/index.js). Do not edit directly.\n' +
    '// Static composition loads bundles as scripts: the file must self-register\n' +
    '// via window.__ModuleLoader__.load({ id, factory }). The shared body returns\n' +
    '// a plugin descriptor ({ inject, apply }) for the dynamic-plugin runner;\n' +
    '// this entry unwraps it, forwards the loader-provided React, and exposes\n' +
    '// apply/inject for the cordis loader.\n' +
    'window.__ModuleLoader__.load({\n' +
    '  id: ' + JSON.stringify(id) + ',\n' +
    '  factory: (require) => {\n' +
    '    var module = { exports: {} };\n' +
    '    var exports = module.exports;\n' +
    '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n' +
    '    const React = require("react");\n' +
    '    let _usageCtx = null;\n' +
    '    const _usagePlugin = (() => {\n' +
    source +
    '\n    })();\n' +
    '    exports.apply = function apply(ctx) {\n' +
    '      _usageCtx = ctx;\n' +
    '      return _usagePlugin.apply(ctx);\n' +
    '    };\n' +
    '    exports.inject = _usagePlugin.inject ?? [];\n' +
    '    return module.exports;\n' +
    '  }\n' +
    '});\n';
  if (sourceMapUrl === null) return wrapped;
  return wrapped + '//# sourceMappingURL=' + sourceMapUrl + '\n';
}

/**
 * Source map for one emitted bundle.
 *
 * A separate file, never a data URI: inlining it made the shipped bundle 2.5x its
 * own source (415,786 B / 130 KB gzip against 159,982 B / 53 KB) and every web
 * client downloaded the whole source at boot to get nothing but a devtools
 * convenience. Official DSH bundles reference `client.js.map` the same way and do
 * not ship it either.
 *
 * @param {object} options - map options.
 * @param {string} options.out - absolute bundle path the map belongs to.
 * @param {string} options.source - contents of the source body.
 * @param {string} [options.sourcePath] - absolute source path.
 * @returns {string} the map JSON.
 */
export function renderSourceMap({ out, source, sourcePath }) {
  return JSON.stringify({
    version: 3,
    file: basename(out),
    sources: [sourcePath ?? join(out, '..', '..', '..', 'src/client/index.js')],
    sourcesContent: [source],
    names: [],
    mappings: '',
  });
}

/**
 * Build one client bundle from a package root.
 *
 * @param {string} root - package root containing package.json and src/client/index.js.
 * @param {{ sourcemap?: boolean }} [options] - emit a sibling `.map` (also `DSH_USAGE_SOURCEMAP=1`).
 * @returns {{ id: string, out: string, bytes: number, map: string|null }} build outcome.
 * @throws when the client source is missing (a bundle without its source is never emitted).
 */
export function buildClientBundle(root, options = {}) {
  const srcPath = join(root, 'src/client/index.js');
  if (!existsSync(srcPath)) {
    throw new Error(`Missing source file: ${srcPath}. Refusing to emit a client bundle without its source.`);
  }
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing ${pkgPath}. Refusing to guess the client bundle's registration id.`);
  }
  const id = resolveBundleId(JSON.parse(readFileSync(pkgPath, 'utf8')), pkgPath);
  const source = readFileSync(srcPath, 'utf8');
  const out = join(root, 'lib/client/index.js');
  mkdirSync(dirname(out), { recursive: true });
  // Off by default: the map is a development aid, and the published bundle must
  // not carry a copy of its own source.
  const wantMap = options.sourcemap === true || process.env.DSH_USAGE_SOURCEMAP === '1';
  const bundle = renderClientEntry({
    id,
    source,
    out,
    sourcePath: srcPath,
    sourceMapUrl: wantMap ? basename(out) + '.map' : null,
  });
  writeFileSync(out, bundle);
  const mapPath = out + '.map';
  if (wantMap) writeFileSync(mapPath, renderSourceMap({ out, source, sourcePath: srcPath }));
  return { id, out, bytes: bundle.length, map: wantMap ? mapPath : null };
}

/**
 * True when this module is the process entry point. Both sides are resolved
 * through realpath: Node reports the real path in `import.meta.url`, while
 * argv[1] may still carry a symlinked prefix (e.g. /var -> /private/var on
 * macOS), and a fixture tree must be able to run this script.
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const { id, out, bytes, map } = buildClientBundle(root);
  console.log('wrote', out, '(' + bytes + ' bytes, id: ' + id + ')');
  if (map !== null) console.log('wrote', map);
}
