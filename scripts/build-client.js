/**
 * Build helper: emit the module-form client entry for cordis.yml loading.
 *
 * src/client/index.js is the single source of truth, written as the BODY of
 * the dynamic-plugin apply function (top-level consts + `return { apply }`).
 * The module entry wraps that exact body inside `export function apply(ctx)`,
 * so the same code runs under both the dynamic runner and the composition
 * loader.
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
  '// The shared body returns a plugin descriptor ({ inject, apply }) for the\n' +
  '// dynamic-plugin runner; the static composition loader calls module apply()\n' +
  '// directly, so this entry unwraps the descriptor and runs its apply.\n' +
  'const _usagePlugin = (() => {\n' +
  src +
  '\n})();\n' +
  'export const inject = _usagePlugin.inject ?? [];\n' +
  'export function apply(ctx) {\n' +
  '  return _usagePlugin.apply(ctx);\n' +
  '}\n';
writeFileSync(out, wrapped);
console.log('wrote', out, `(${wrapped.length} bytes)`);
