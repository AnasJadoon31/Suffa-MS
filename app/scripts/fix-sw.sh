#!/bin/sh
# Post-build script to fix the service worker for offline support
set -e

PUBLIC_DIR=".output/public"
ASSETS_DIR="$PUBLIC_DIR/assets"
SW_PATH="$PUBLIC_DIR/sw-v4.js"
MANIFEST_PATH=".output/server/index.mjs"

echo "=== Post-build SW fix ==="



# Step 2: Patch SW - add NavigationRoute if missing
echo "Patching SW..."
if ! grep -q "NavigationRoute" "$SW_PATH"; then
  echo "Adding NavigationRoute..."
  # Write the node patch script to a temp file to avoid shell escaping issues
  cat > /tmp/patch-sw.js << 'JSEOF'
const fs = require('fs');
const swPath = process.argv[2];
let code = fs.readFileSync(swPath, 'utf8');
const startIdx = code.indexOf('precacheAndRoute(');
if (startIdx === -1) { console.error('precacheAndRoute not found'); process.exit(1); }
let depth = 0;
let endIdx = startIdx;
for (let i = startIdx; i < code.length; i++) {
  if (code[i] === '(') depth++;
  else if (code[i] === ')') { depth--; if (depth === 0) { endIdx = i; break; } }
}
const navCode = String.raw`,s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("/index.html"),{denylist:[/^\/~oauth/,/^\/api\//]}))`;
code = code.slice(0, endIdx + 1) + navCode + code.slice(endIdx + 1);
fs.writeFileSync(swPath, code);
console.log('NavigationRoute added');
JSEOF
  node /tmp/patch-sw.js "$SW_PATH"
  rm -f /tmp/patch-sw.js
else
  echo "NavigationRoute already present"
fi

# Step 3: Fix manifest sizes — the SSR build pass reads public assets before
# the client build finishes writing them, so every asset ends up with the same
# stale size. Walk the public assets and correct each entry individually.
echo "Fixing manifest sizes..."
node -e "
const fs = require('fs');
const path = require('path');
const manifest = '$(pwd)/$MANIFEST_PATH';
const assetsDir = '$(pwd)/$ASSETS_DIR';
let code = fs.readFileSync(manifest, 'utf8');
const files = fs.readdirSync(assetsDir);
let fixed = 0;
for (const f of files) {
  const filePath = path.join(assetsDir, f);
  const size = fs.statSync(filePath).size;
  const escaped = f.replace(/[.*+?^\${}()|[\]\\\\]/g, '\\\\$&');
  const re = new RegExp('(\"/assets/' + escaped + '\"[\\\\s\\\\S]*?\"size\":\\\\s*)(\\\\d+)', 'm');
  if (re.test(code)) {
    code = code.replace(re, '\$1' + size);
    fixed++;
  }
}
fs.writeFileSync(manifest, code);
console.log('Fixed ' + fixed + ' asset sizes in manifest');
"

# Step 3b: Fix sw-v4.js manifest size (it lives in public/, not assets/)
node -e "
const fs = require('fs');
const manifest = '$(pwd)/$MANIFEST_PATH';
const swPath = '$(pwd)/$SW_PATH';
const actualSize = fs.statSync(swPath).size;
let code = fs.readFileSync(manifest, 'utf8');
const re = new RegExp('(\"/sw-v4\\.js\"[\\\\s\\\\S]*?\"size\":\\\\s*)(\\\\d+)', 'm');
if (re.test(code)) {
  const oldSize = code.match(re)[2];
  code = code.replace(re, '\$1' + actualSize);
  fs.writeFileSync(manifest, code);
  console.log('Fixed sw-v4.js manifest size: ' + oldSize + ' -> ' + actualSize);
} else {
  console.log('WARNING: could not find sw-v4.js in manifest');
}
"

# Step 4: Patch Nitro's static handler so it does NOT serve index.html
# for "/" (the bare SPA shell). TanStack Start's SSR handler must own
# "/" — otherwise the server returns the static shell and TanStack
# Router's client hydration throws "Invariant failed".
echo "Patching static handler to skip index.html for root path..."
cat > /tmp/patch-static.js << 'JSEOF'
const fs = require('fs');
const manifest = process.argv[2];
let code = fs.readFileSync(manifest, 'utf8');

// The static handler serves index.html when id resolves to "/index.html".
// Inject a guard: if original pathname is "/", skip and let SSR handle it.
const marker = 'if (encodings.length > 1) event.res.headers.append("Vary", "Accept-Encoding");';
const guard = 'if (event.url.pathname === "/" && (id === "/" || id === "/index.html")) { return; }';
const sentinel = '/* patch-static-skip-root */';

if (code.includes(sentinel)) {
  console.log('Static handler already patched');
} else if (code.includes(marker)) {
  code = code.replace(marker, guard + '\n' + sentinel + '\n' + marker);
  fs.writeFileSync(manifest, code);
  console.log('Patched static handler');
} else {
  console.log('WARNING: could not find patch marker');
}
JSEOF
node /tmp/patch-static.js "$(pwd)/$MANIFEST_PATH"
rm -f /tmp/patch-static.js

# Step 5: Fix Rolldown SSR circular chunk bug.
# Vite 8 / Rolldown sometimes splits the SSR server entry into two chunks
# with a circular import:  A imports __exportAll from B, B imports server_exports from A.
# ESM live bindings resolve this in theory, but Node evaluates A first (because
# it's the entry), and when A runs `import { server_exports } from B`, Node loads
# B which tries to read __exportAll from A — but A hasn't defined it yet (TDZ).
# Fix: inline the __exportAll helper directly in any SSR file that imports it.
echo "Fixing Rolldown SSR circular chunk (__exportAll)..."
cat > /tmp/patch-ssr-circular.js << 'JSEOF'
const fs = require('fs');
const path = require('path');

const ssrDir = path.join(process.argv[2], '.output/server/_ssr');
if (!fs.existsSync(ssrDir)) { console.log('No _ssr dir, skipping'); process.exit(0); }

const helperCode = `
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
  if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
`;

const files = fs.readdirSync(ssrDir).filter(f => f.endsWith('.mjs'));
let patched = 0;
for (const file of files) {
  const filePath = path.join(ssrDir, file);
  let code = fs.readFileSync(filePath, 'utf8');

  // Check if this file imports __exportAll from a sibling chunk
  const importRe = /import\s*\{\s*[^}]*\b(\w+)\s+as\s+__exportAll\b[^}]*\}\s*from\s*"\.\/([^"]+)"/;
  const match = code.match(importRe);
  if (!match) continue;

  // Remove the __exportAll binding from the import (keep other bindings if any)
  const fullImport = match[0];
  const aliasName = match[1];  // e.g. "n"
  const fromFile = match[2];

  // Try to remove just the __exportAll binding from the import
  // Pattern: "n as __exportAll" possibly with leading/trailing comma
  let newImport = fullImport.replace(new RegExp(',?\\s*' + aliasName + '\\s+as\\s+__exportAll'), '');
  newImport = newImport.replace(new RegExp(aliasName + '\\s+as\\s+__exportAll\\s*,?'), '');

  // If the import is now empty (only had __exportAll), remove the whole import
  if (/import\s*\{\s*\}\s*from/.test(newImport)) {
    code = code.replace(fullImport, '');
  } else {
    code = code.replace(fullImport, newImport);
  }

  // Prepend the inlined helper
  code = helperCode + code;
  fs.writeFileSync(filePath, code);
  patched++;
  console.log('Inlined __exportAll in ' + file);
}
if (!patched) console.log('No __exportAll circular imports found');
JSEOF
node /tmp/patch-ssr-circular.js "$(pwd)"
rm -f /tmp/patch-ssr-circular.js

echo "=== Post-build fix complete ==="
