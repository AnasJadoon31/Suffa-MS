#!/usr/bin/env python3
"""Post-build script to fix the service worker for offline support."""
import os
import re
import glob

def main():
    public_dir = ".output/public"
    assets_dir = os.path.join(public_dir, "assets")
    sw_path = os.path.join(public_dir, "sw-v3.js")
    manifest_path = ".output/server/index.mjs"

    # Step 1: Generate app shell index.html
    print("Generating app shell...")
    asset_files = os.listdir(assets_dir) if os.path.exists(assets_dir) else []
    main_js = next((f for f in asset_files if f.startswith("index-") and f.endswith(".js")), None)
    css_files = [f for f in asset_files if f.endswith(".css")]

    js_tags = f'<script type="module" src="/assets/{main_js}" crossorigin></script>' if main_js else ""
    css_tags = "\n".join(f'<link rel="stylesheet" href="/assets/{f}" />' for f in css_files)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  {css_tags}
</head>
<body>
  <div id="app"></div>
  {js_tags}
</body>
</html>"""

    with open(os.path.join(public_dir, "index.html"), "w") as f:
        f.write(html)
    print("Generated index.html")

    # Step 2: Patch SW
    print("Patching SW...")
    with open(sw_path, "r") as f:
        sw_code = f.read()

    # Add NavigationRoute if missing
    if "NavigationRoute" not in sw_code:
        print("Adding NavigationRoute...")
        # Find the full precacheAndRoute(...) call
        start_idx = sw_code.index("precacheAndRoute(")
        if start_idx != -1:
            depth = 0
            end_idx = start_idx
            for i in range(start_idx, len(sw_code)):
                if sw_code[i] == "(":
                    depth += 1
                elif sw_code[i] == ")":
                    depth -= 1
                    if depth == 0:
                        end_idx = i
                        break

            nav_code = ',s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("/index.html"),{denylist:[/^\\/~oauth/,/^\\/api\\//]}))'
            sw_code = sw_code[:end_idx + 1] + nav_code + sw_code[end_idx + 1:]
            print("NavigationRoute added")
        else:
            print("WARNING: precacheAndRoute not found")
    else:
        print("NavigationRoute already present")

    with open(sw_path, "w") as f:
        f.write(sw_code)

    # Step 3: Fix manifest size
    print("Fixing manifest size...")
    actual_size = os.path.getsize(sw_path)
    with open(manifest_path, "r") as f:
        manifest = f.read()

    manifest = re.sub(r'"size": \d+', f'"size": {actual_size}', manifest)
    with open(manifest_path, "w") as f:
        f.write(manifest)
    print(f"Fixed manifest size to {actual_size}")

    print("=== Post-build fix complete ===")

if __name__ == "__main__":
    main()
