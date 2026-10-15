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
 * The shared body returns a plugin descriptor ({ inject, apply }) for the
 * dynamic-plugin runner; this entry unwraps that descriptor, forwards the
 * loader-provided React, remembers the context for the RPC bridge, and exposes
 * `apply`/`inject` for the cordis loader.
 *
 * The registration id MUST equal the package name in package.json. The host
 * composes the client boot graph by resolving each installed bundle to its
 * nearest package.json (`resolveMeta` -> `locatePkgJson` -> `nearestPackage`)
 * and serves the factory under that resolved name; the browser's `arrive()`
 * then waits for exactly that key. So a hardcoded id breaks silently the
 * moment the package is renamed, scoped, aliased or vendored under another
 * name: the row waits forever for a factory that arrived under a different
 * key, and the renderer only reports "Renderer boot failed for N plugin(s)"
 * with no message and no failing entry.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(root, 'package.json');
if (!existsSync(pkgPath)) {
  throw new Error(`Missing ${pkgPath}. Refusing to guess the client bundle's registration id.`);
}
const { name: pluginId } = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (typeof pluginId !== 'string' || pluginId === '') {
  throw new Error(`Missing "name" in ${pkgPath}. The bundle's registration id must equal the installed package name.`);
}
const srcPath = join(root, 'src/client/index.js');
if (!existsSync(srcPath)) {
  throw new Error(`Missing source file: ${srcPath}. Refusing to emit a client bundle without its source.`);
}
const src = readFileSync(srcPath, 'utf8');
const out = join(root, 'lib/client/index.js');
mkdirSync(dirname(out), { recursive: true });
const wrapped =
  '// Auto-generated module entry wrapping the shared client body\n' +
  '// (source: src/client/index.js). Do not edit directly.\n' +
  '// Static composition loads bundles as scripts: the file must self-register\n' +
  '// via window.__ModuleLoader__.load({ id, factory }). The shared body returns\n' +
  '// a plugin descriptor ({ inject, apply }) for the dynamic-plugin runner;\n' +
  '// this entry unwraps it, forwards the loader-provided React, and exposes\n' +
  '// apply/inject for the cordis loader.\n' +
  'window.__ModuleLoader__.load({\n' +
  '  id: ' + JSON.stringify(pluginId) + ',\n' +
  '  factory: (require) => {\n' +
  '    var module = { exports: {} };\n' +
  '    var exports = module.exports;\n' +
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n' +
  '    const React = require("react");\n' +
  '    let _usageCtx = null;\n' +
  '    const _usagePlugin = (() => {\n' +
  src +
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
  sources: [srcPath],
  sourcesContent: [src],
  names: [],
  mappings: '',
};
const sourceMapComment =
  '//# sourceMappingURL=data:application/json;base64,' +
  Buffer.from(JSON.stringify(map), 'utf8').toString('base64') +
  '\n';
const bundle = wrapped + sourceMapComment;
writeFileSync(out, bundle);
console.log('wrote', out, '(' + bundle.length + ' bytes)');
