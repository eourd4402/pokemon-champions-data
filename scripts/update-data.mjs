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

async function download(key, source) {
  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': 'pokemon-champions-data-updater/1.0' },
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let bytes = Buffer.from(await response.arrayBuffer());
    if (source.transform === 'showdown-items-js-to-json') {
      const sandbox = { exports: {} };
      vm.runInNewContext(bytes.toString('utf8'), sandbox, { timeout: 10_000 });
      if (!sandbox.exports.BattleItems) throw new Error('BattleItems was not found');
      bytes = Buffer.from(JSON.stringify(sandbox.exports.BattleItems));
    }
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
