#!/bin/sh
# Post-build script to fix the service worker for offline support
set -e

SW_PATH=".output/public/sw-v3.js"
MANIFEST_PATH=".output/server/index.mjs"
PUBLIC_DIR=".output/public"
ASSETS_DIR="$PUBLIC_DIR/assets"

echo "=== Post-build SW fix ==="

# Step 1: Generate app shell index.html
echo "Generating app shell..."
MAIN_JS=$(ls "$ASSETS_DIR"/index-*.js 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "")
CSS_FILES=$(ls "$ASSETS_DIR"/*.css 2>/dev/null | xargs -I{} basename {} 2>/dev/null || echo "")

JS_TAGS=""
if [ -n "$MAIN_JS" ]; then
  JS_TAGS="<script type=\"module\" src=\"/assets/$MAIN_JS\" crossorigin></script>"
fi

CSS_TAGS=""
for css in $CSS_FILES; do
  CSS_TAGS="$CSS_TAGS<link rel=\"stylesheet\" href=\"/assets/$css\" />"
done

cat > "$PUBLIC_DIR/index.html" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  $CSS_TAGS
</head>
<body>
  <div id="app"></div>
  $JS_TAGS
</body>
</html>
HTMLEOF
echo "Generated index.html"

# Step 2: Patch SW - add NavigationRoute and index.html to precache
echo "Patching SW..."
if ! grep -q "NavigationRoute" "$SW_PATH"; then
  echo "Adding NavigationRoute..."
  # Insert after precacheAndRoute([...]) - find the closing ]) and insert after it
  # Use awk to find the matching closing bracket
  awk '
  /precacheAndRoute\(\[/ { in_precache=1; depth=0 }
  in_precache {
    for (i=1; i<=length($0); i++) {
      c = substr($0, i, 1)
      if (c == "(") depth++
      else if (c == ")") {
        depth--
        if (depth == 0) {
          print $0 ",s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL(\"/index.html\"),{denylist:[/^\\/~oauth/,/^\\/api\\//]}))"
          in_precache=0
          next
        }
      }
    }
    print $0
    next
  }
  { print $0 }
  ' "$SW_PATH" > "$SW_PATH.tmp" && mv "$SW_PATH.tmp" "$SW_PATH"
  echo "NavigationRoute added"
else
  echo "NavigationRoute already present"
fi

# Step 3: Fix manifest size
echo "Fixing manifest size..."
ACTUAL_SIZE=$(wc -c < "$SW_PATH")
if grep -q '"size":' "$MANIFEST_PATH"; then
  sed -i "s/\"size\": [0-9]*/\"size\": $ACTUAL_SIZE/" "$MANIFEST_PATH"
  echo "Fixed manifest size to $ACTUAL_SIZE"
fi

echo "=== Post-build fix complete ==="
