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

# Step 3: Fix manifest size
echo "Fixing manifest size..."
ACTUAL_SIZE=$(wc -c < "$SW_PATH" | tr -d ' ')
sed -i.bak "s/\"size\":[[:space:]]*[0-9]*/\"size\": $ACTUAL_SIZE/" "$MANIFEST_PATH" && rm -f "$MANIFEST_PATH.bak"
echo "Fixed manifest size to $ACTUAL_SIZE"

echo "=== Post-build fix complete ==="
