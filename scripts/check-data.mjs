import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
let failed = false;

for (const [key, file] of Object.entries(manifest.files || {})) {
  try {
    const bytes = await readFile(path.join(root, file.path));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== file.sha256 || bytes.length !== file.bytes) throw new Error('size/hash mismatch');
    process.stdout.write(`ok ${key}\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(`invalid ${key}: ${error.message}\n`);
  }
}

if (!Object.keys(manifest.files || {}).length) {
  failed = true;
  process.stderr.write('manifest has no data files; run npm run update first\n');
}
if (failed) process.exit(1);
