import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const swPath = resolve(root, 'app/.output/public/sw-v3.js');
const manifestPath = resolve(root, 'app/.output/server/index.mjs');

const swStat = readFileSync(swPath);
const actualSize = swStat.length;

let manifest = readFileSync(manifestPath, 'utf-8');

// Replace the stale size for sw-v3.js in the Nitro asset manifest
const sizeRegex = /("\/sw-v3\.js":\s*\{[^}]*"size":\s*)(\d+)/;
const match = manifest.match(sizeRegex);
if (match) {
  const oldSize = Number(match[2]);
  if (oldSize !== actualSize) {
    manifest = manifest.replace(sizeRegex, `$1${actualSize}`);
    writeFileSync(manifestPath, manifest);
    console.log(`Fixed sw-v3.js manifest size: ${oldSize} → ${actualSize}`);
  } else {
    console.log(`sw-v3.js manifest size already correct: ${actualSize}`);
  }
} else {
  console.warn('Could not find sw-v3.js entry in manifest');
}
