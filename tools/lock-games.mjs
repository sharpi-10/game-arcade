// Locks every game's card (title, picture, link) with its unlock code and writes the result
// into index.html. The page then holds only encrypted data: no codes, names or links can be
// read from it, and a card only opens with its code.
//
// The list of games and their codes lives outside this public repository. Run from the
// game-arcade folder:
//   node tools/lock-games.mjs ../arcade-private/games.json
//
// games.json: { "games": [ { "code": "...", "card": { title, tag, description, href,
//   artFile (an SVG next to games.json), stats: [{ label, key, format: "time" | "money",
//   fallback? }], empty? } } ] }
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 250000;
const PAGE = new URL('../index.html', import.meta.url);
const START = '/* LOCKED:start */';
const END = '/* LOCKED:end */';

// Must match normalize() in index.html: letters and digits only, case-insensitive.
const normalize = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function keyFor(code, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

const listPath = process.argv[2];
if (!listPath) {
  console.error('Usage: node tools/lock-games.mjs path/to/games.json');
  process.exit(1);
}
const { games } = JSON.parse(await readFile(listPath, 'utf8'));
const salt = crypto.getRandomValues(new Uint8Array(16));
const keys = new Map();
const boxes = [];
for (const { code, card } of games) {
  const norm = normalize(code);
  if (norm.length < 6) throw new Error(`The code for "${card.title}" needs at least 6 letters or digits.`);
  if (!keys.has(norm)) keys.set(norm, await keyFor(norm, salt));
  const { artFile, ...rest } = card;
  const payload = { ...rest, art: artFile ? await readFile(resolve(dirname(listPath), artFile), 'utf8') : '' };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.get(norm), new TextEncoder().encode(JSON.stringify(payload)));
  boxes.push(`  { iv: '${b64(iv)}', data: '${b64(new Uint8Array(data))}' },`);
}

const page = await readFile(PAGE, 'utf8');
const from = page.indexOf(START);
const to = page.indexOf(END);
if (from < 0 || to < from) throw new Error(`index.html is missing the ${START} … ${END} markers.`);
const indent = page.slice(page.lastIndexOf('\n', from) + 1, from);
const block = [
  START,
  `const SALT = '${b64(salt)}';`,
  `const ITERATIONS = ${ITERATIONS};`,
  'const LOCKED = [',
  ...boxes,
  '];',
  '',
].join(`\n${indent}`);
await writeFile(PAGE, page.slice(0, from) + block + page.slice(to));
console.log(`Locked ${boxes.length} game${boxes.length === 1 ? '' : 's'} into index.html.`);
