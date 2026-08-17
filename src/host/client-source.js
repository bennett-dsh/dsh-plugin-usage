/**
 * Client source loader.
 *
 * The full dashboard UI lives in src/client/index.js (single source of
 * truth). A dynamic plugin cannot import files, so the host reads the file
 * and serves it to the browser half, which evaluates it with new Function.
 *
 * P1-4: baseline keeps the old hardcoded absolute candidates; the
 * optimization derives the paths from import.meta.url so the dynamic-plugin
 * dev flow works from any checkout location.
 */
const CLIENT_SOURCE_CANDIDATES = [
  '/Users/ruanbw/projects/usage/src/client/index.js',
  '/Users/ruanbw/projects/usage/lib/client/index.js',
];

export async function getClientSource(ctx) {
  const fs = ctx.get('fs');
  if (fs === undefined) return { ok: false, error: 'fs service unavailable' };
  for (const p of CLIENT_SOURCE_CANDIDATES) {
    try {
      const target = await fs.resolve(p);
      const body = await fs.readText(target);
      if (typeof body === 'string' && body.length > 0) return { ok: true, body };
    } catch (error) {
      // try the next candidate
    }
  }
  return { ok: false, error: 'client source not found (tried: ' + CLIENT_SOURCE_CANDIDATES.join(', ') + ')' };
}
