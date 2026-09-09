import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
const previous = await readFile(path.join(root, 'manifest.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => ({ dataVersion: `${today}.0` }));
const oldSerial = Number(String(previous.dataVersion || '').split('.').at(-1)) || 0;
const dataVersion = `${today}.${oldSerial + 1}`;
const files = {};
const failures = [];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function transformBytes(transform, bytes) {
  if (!transform) return bytes;
  const text = bytes.toString('utf8');
  if (transform === 'showdown-items-js-to-json' || transform === 'showdown-abilities-js-to-json') {
    const sandbox = { exports: {} };
    vm.runInNewContext(text, sandbox, { timeout: 10_000 });
    const data = transform === 'showdown-items-js-to-json'
      ? sandbox.exports.BattleItems : sandbox.exports.BattleAbilities;
    if (!data) throw new Error('Showdown export was not found');
    return Buffer.from(JSON.stringify(data));
  }
  if (transform === 'champions-learnsets-ts-to-json') {
    const sandbox = { exports: {} };
    const runnable = text.replace(
      /export const Learnsets:[^=]+=/,
      'exports.Learnsets ='
    );
    vm.runInNewContext(runnable, sandbox, { timeout: 20_000 });
    if (!sandbox.exports.Learnsets) throw new Error('Champions Learnsets export was not found');
    const compact = {};
    for (const [species, entry] of Object.entries(sandbox.exports.Learnsets)) {
      if (entry?.learnset) compact[species] = Object.keys(entry.learnset).sort();
    }
    return Buffer.from(JSON.stringify(compact));
  }
  if (transform === 'pokeapi-korean-flavor-to-json') {
    const rows = parseCsv(text);
    const latest = {};
    for (const row of rows.slice(1)) {
      const [objectId, versionGroupId, languageId, flavorText] = row;
      if (languageId !== '3' || !objectId || !flavorText) continue;
      const version = Number(versionGroupId) || 0;
      if (!latest[objectId] || version >= latest[objectId].version) {
        latest[objectId] = {
          version,
          text: flavorText.replace(/\s+/g, ' ').trim()
        };
      }
    }
    return Buffer.from(JSON.stringify(Object.fromEntries(
      Object.entries(latest).map(([id, value]) => [id, value.text])
    )));
  }
  throw new Error(`Unknown transform: ${transform}`);
}

async function download(key, source) {
  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': 'pokemon-champions-data-updater/1.0' },
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let bytes = Buffer.from(await response.arrayBuffer());
    bytes = transformBytes(source.transform, bytes);
    const destination = path.join(root, source.path);
    const temporary = `${destination}.tmp`;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
    files[key] = {
      path: source.path.replaceAll('\\', '/'),
      version: dataVersion,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: source.url
    };
    process.stdout.write(`updated ${key} (${bytes.length} bytes)\n`);
  } catch (error) {
    failures.push({ key, required: source.required !== false, error: error.message });
    process.stderr.write(`failed ${key}: ${error.message}\n`);
  }
}

async function includeLocal(key, source) {
  try {
    const bytes = await readFile(path.join(root, source.path));
    files[key] = {
      path: source.path.replaceAll('\\\\', '/'),
      version: dataVersion,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: source.source || 'Locally curated data'
    };
    process.stdout.write(`included ${key} (${bytes.length} bytes)\n`);
  } catch (error) {
    failures.push({ key, required: source.required !== false, error: error.message });
    process.stderr.write(`failed ${key}: ${error.message}\n`);
  }
}

await Promise.all(Object.entries(sources).map(([key, source]) =>
  source.local ? includeLocal(key, source) : download(key, source)
));

const requiredFailures = failures.filter(item => item.required);
if (requiredFailures.length) {
  process.stderr.write('Required data was not completely downloaded. Manifest was not changed.\n');
  process.exit(1);
}

const manifest = {
  schemaVersion: 1,
  dataVersion,
  generatedAt: new Date().toISOString(),
  files,
  optionalFailures: failures.filter(item => !item.required).map(item => item.key)
};
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`manifest ${dataVersion} written\n`);
