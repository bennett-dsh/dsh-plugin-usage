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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Fallback loader id, used only when package.json carries no usable name. */
export const DEFAULT_BUNDLE_ID = 'dsh-plugin-usage';

/**
 * Resolve the loader id from a package manifest. The id has to equal the
 * installed package name (see the file header).
 *
 * @param {unknown} pkg - parsed package.json contents (anything non-object is ignored).
 * @returns {string} the package name, or {@link DEFAULT_BUNDLE_ID} when unnamed.
 */
export function resolveBundleId(pkg) {
  if (pkg === null || typeof pkg !== 'object') return DEFAULT_BUNDLE_ID;
  const name = typeof pkg.name === 'string' ? pkg.name.trim() : '';
  return name.length > 0 ? name : DEFAULT_BUNDLE_ID;
}

/**
 * Render the self-registering bundle text for one source body.
 *
 * @param {object} options - entry options.
 * @param {string} options.id - loader id (the installed package name).
 * @param {string} options.source - contents of src/client/index.js.
 * @param {string} options.out - absolute output path (recorded in the inline sourcemap).
 * @param {string} [options.sourcePath] - absolute source path (recorded in the inline sourcemap).
 * @returns {string} the emitted bundle, sourcemap comment included.
 */
export function renderClientEntry({ id, source, out, sourcePath }) {
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
  const map = {
    version: 3,
    file: basename(out),
    sources: [sourcePath ?? join(out, '..', '..', '..', 'src/client/index.js')],
    sourcesContent: [source],
    names: [],
    mappings: '',
  };
  const sourceMapComment =
    '//# sourceMappingURL=data:application/json;base64,' +
    Buffer.from(JSON.stringify(map), 'utf8').toString('base64') +
    '\n';
  return wrapped + sourceMapComment;
}

/**
 * Build one client bundle from a package root.
 *
 * @param {string} root - package root containing package.json and src/client/index.js.
 * @returns {{ id: string, out: string, bytes: number }} build outcome.
 * @throws when the client source is missing (a bundle without its source is never emitted).
 */
export function buildClientBundle(root) {
  const srcPath = join(root, 'src/client/index.js');
  if (!existsSync(srcPath)) {
    throw new Error(`Missing source file: ${srcPath}. Refusing to emit a client bundle without its source.`);
  }
  const pkgPath = join(root, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  const id = resolveBundleId(pkg);
  const source = readFileSync(srcPath, 'utf8');
  const out = join(root, 'lib/client/index.js');
  mkdirSync(dirname(out), { recursive: true });
  const bundle = renderClientEntry({ id, source, out, sourcePath: srcPath });
  writeFileSync(out, bundle);
  return { id, out, bytes: bundle.length };
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
const isMain = invokedPath === import.meta.url || fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
if (isMain) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const { id, out, bytes } = buildClientBundle(root);
  console.log('wrote', out, '(' + bytes + ' bytes, id: ' + id + ')');
}
