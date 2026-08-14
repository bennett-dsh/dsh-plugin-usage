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
  'export function apply(ctx) {\n' +
  src +
  '\n}\n';
writeFileSync(out, wrapped);
console.log('wrote', out, `(${wrapped.length} bytes)`);
