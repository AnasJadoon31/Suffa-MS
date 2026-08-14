import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const swPath = resolve(root, '.output/public/sw-v3.js');
const manifestPath = resolve(root, '.output/server/index.mjs');

let swCode = readFileSync(swPath, 'utf-8');

// Fix 1: Ensure NavigationRoute for offline app shell fallback.
// The generateSW step in some build environments drops the navigateFallback
// NavigationRoute; patch it in if missing.
if (!swCode.includes('NavigationRoute')) {
  // Find the full precacheAndRoute(...) call (handles nested brackets)
  const startIdx = swCode.indexOf('precacheAndRoute(');
  if (startIdx !== -1) {
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < swCode.length; i++) {
      if (swCode[i] === '(') depth++;
      else if (swCode[i] === ')') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    const before = swCode.slice(0, endIdx + 1);
    const after = swCode.slice(endIdx + 1);
    const navFallback = `,s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("/index.html"),{denylist:[/^\\/~oauth/,/^\\/api\\//]}))`;
    swCode = before + navFallback + after;
    writeFileSync(swPath, swCode);
    console.log('Patched NavigationRoute into sw-v3.js');
  }
}

const swStat = readFileSync(swPath);
const actualSize = swStat.length;

let manifest = readFileSync(manifestPath, 'utf-8');

// Fix 2: Replace the stale size for sw-v3.js in the Nitro asset manifest
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
