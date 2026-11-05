/**
 * Locale coverage gates (source-level, plus the shipped meta files).
 *
 * DSH 0.2.2 ships eight UI languages (zh / en / ja / de / es / fr / pt / ru).
 * Official plugins keep one dictionary per language whose key set is identical
 * to the Chinese one, and the locale service resolves the active language chain
 * key by key. This file pins the three failure modes that are invisible on the
 * Chinese screen:
 *
 *  - a language dictionary missing a key (the key itself leaks onto the page);
 *  - a translation dropping a `{placeholder}` (the value silently disappears);
 *  - Chinese copy left inside a non-Chinese dictionary, or an English meta that
 *    still reads as Chinese in the plugin list.
 *
 * It also checks the locale `meta` files: the plugin manager reads
 * `locale/<language>.json` at STARTUP (not from the client bundle) for the
 * title/description and for `meta.detail` — the Markdown document shown on the
 * bundle page. A wrong or missing `meta.detail` fails the whole detail read
 * instead of falling back, so the referenced file must exist and be shipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientSource = readFileSync(join(root, 'src/client/index.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const LANGUAGES = ['zh', 'en', 'ja', 'de', 'es', 'fr', 'pt', 'ru'];

/** Read one inline object literal starting at `const <name> = {`. */
function inlineDictionary(name) {
  const at = clientSource.indexOf('const ' + name + ' = {');
  assert.ok(at >= 0, `${name} dictionary must exist in src/client/index.js`);
  const start = clientSource.indexOf('{', at);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < clientSource.length; i += 1) {
    const c = clientSource[i];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return new Function('return ' + clientSource.slice(start, i + 1))();
    }
  }
  throw new Error(`unterminated ${name} dictionary`);
}

const DICT_NAMES = { zh: 'ZH', en: 'EN', ja: 'JA', de: 'DE', es: 'ES', fr: 'FR', pt: 'PT', ru: 'RU' };
const dictionaries = Object.fromEntries(LANGUAGES.map((lang) => [lang, inlineDictionary(DICT_NAMES[lang])]));
const zhKeys = Object.keys(dictionaries.zh);

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

test('all eight dictionaries exist with the same key set', () => {
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(dictionaries[lang]), zhKeys, `${lang} must carry exactly the zh key set`);
  }
  assert.equal(zhKeys.length, 134, 'the dictionary has 134 keys today; update this count deliberately');
});

test('every translation keeps the placeholders of the Chinese string', () => {
  for (const lang of LANGUAGES) {
    if (lang === 'zh') continue;
    for (const key of zhKeys) {
      assert.equal(
        placeholders(dictionaries[lang][key]),
        placeholders(dictionaries.zh[key]),
        `${lang}.${key} must keep the placeholders of zh.${key}`,
      );
    }
  }
});

test('non-Chinese dictionaries carry the localized star nudge', () => {
  for (const lang of LANGUAGES) {
    const text = dictionaries[lang].starLine;
    assert.equal(typeof text, 'string', `${lang}.starLine must exist`);
    assert.ok(text.startsWith('⭐'), `${lang}.starLine must use the Unicode star, not a drawn icon`);
  }
});

test('no Chinese copy leaks into en / de / es / fr / pt / ru', () => {
  // ja legitimately contains kanji; zh is the source language. The other six
  // must not carry Han characters at all.
  const HAN = /[\u3400-\u9fff]/;
  for (const lang of ['en', 'de', 'es', 'fr', 'pt', 'ru']) {
    for (const [key, value] of Object.entries(dictionaries[lang])) {
      assert.ok(!HAN.test(String(value)), `${lang}.${key} still contains Chinese: ${value}`);
    }
  }
});

test('every literal key used by the client exists in the zh dictionary', () => {
  const used = new Set();
  for (const match of clientSource.matchAll(/\b(?:t|tr|fallbackT)\('([A-Za-z0-9_]+)'/g)) used.add(match[1]);
  const missing = [...used].filter((key) => !(key in dictionaries.zh));
  assert.deepEqual(missing, [], 'a t() key without a dictionary entry leaks the key onto the page');
});

test('locale meta files cover all eight languages and name an existing detail document', () => {
  const shipped = readdirSync(join(root, 'locale')).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(shipped, LANGUAGES.map((lang) => lang + '.json').sort());
  const HAN = /[\u3400-\u9fff]/;
  for (const lang of LANGUAGES) {
    const meta = JSON.parse(readFileSync(join(root, 'locale', lang + '.json'), 'utf8')).meta;
    assert.equal(typeof meta.title, 'string', `${lang} meta.title`);
    assert.equal(typeof meta.description, 'string', `${lang} meta.description`);
    if (lang !== 'ja' && lang !== 'zh') {
      assert.ok(!HAN.test(meta.title + meta.description), `${lang} meta must not contain Chinese copy`);
    }
    assert.match(meta.detail, /\.md$/, `${lang} meta.detail must name a Markdown file`);
    assert.ok(!meta.detail.includes('\\') && !meta.detail.includes('..'), `${lang} meta.detail must stay inside the package`);
    assert.ok(existsSync(join(root, meta.detail)), `${lang} meta.detail points at a missing file: ${meta.detail}`);
  }
  assert.equal(JSON.parse(readFileSync(join(root, 'locale/zh.json'), 'utf8')).meta.detail, 'README.md');
  assert.equal(JSON.parse(readFileSync(join(root, 'locale/en.json'), 'utf8')).meta.detail, 'README.en.md');
});

test('the English README is shipped so the English detail document can load', () => {
  // `meta.detail` is read from the installed package; a file omitted by `files`
  // fails the read instead of falling back to the Chinese README.
  assert.ok(pkg.files.includes('README.en.md'), 'package.json#files must ship README.en.md');
  assert.ok(pkg.files.includes('locale'), 'package.json#files must ship locale/*.json');
});

test('both READMEs cross-link each other and disclose the translation status', () => {
  for (const [file, other] of [['README.md', 'README.en.md'], ['README.en.md', 'README.md']]) {
    const text = readFileSync(join(root, file), 'utf8');
    const head = text.split('\n').slice(0, 30).join('\n');
    assert.ok(head.includes(other), `${file} must link ${other} near the top`);
    assert.match(text, /8\s*(?:种|official|built-in|种官方|种语言|语言)/i,
      `${file} must say the UI ships eight languages`);
  }
});
