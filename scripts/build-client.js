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
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'src/client/index.js'), 'utf8');
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
  '  id: "dsh-plugin-usage",\n' +
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
writeFileSync(out, wrapped);
console.log('wrote', out, `(${wrapped.length} bytes)`);
