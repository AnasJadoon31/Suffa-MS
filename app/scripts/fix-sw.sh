#!/bin/sh
# Post-build script to fix the service worker for offline support
set -e

PUBLIC_DIR=".output/public"
ASSETS_DIR="$PUBLIC_DIR/assets"
SW_PATH="$PUBLIC_DIR/sw-v3.js"
MANIFEST_PATH=".output/server/index.mjs"

echo "=== Post-build SW fix ==="

# Step 1: Generate app shell index.html
echo "Generating app shell..."
MAIN_JS=$(ls "$ASSETS_DIR"/index-*.js 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "")
CSS_FILES=$(ls "$ASSETS_DIR"/*.css 2>/dev/null || echo "")

JS_TAGS=""
if [ -n "$MAIN_JS" ]; then
  JS_TAGS="<script type=\"module\" src=\"/assets/$MAIN_JS\" crossorigin></script>"
fi

CSS_TAGS=""
for css in $CSS_FILES; do
  basename_css=$(basename "$css")
  CSS_TAGS="${CSS_TAGS}<link rel=\"stylesheet\" href=\"/assets/${basename_css}\" />"
done

cat > "$PUBLIC_DIR/index.html" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  ${CSS_TAGS}
</head>
<body>
  <div id="app"></div>
  ${JS_TAGS}
</body>
</html>
HTMLEOF
echo "Generated index.html"

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

echo "=== Post-build fix complete ==="
