import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const logs = [];
const log = (msg) => { logs.push(msg); };
log("SCRIPT STARTED");
log("cwd = " + process.cwd());
log("__dirname = " + __dirname);

const publicDir = resolve(root, ".output/public");
const assetsDir = resolve(publicDir, "assets");
const swPath = resolve(publicDir, "sw-v3.js");
const manifestPath = resolve(root, ".output/server/index.mjs");

// ── Step 1: Generate the app shell index.html ──────────────────────────────
log("root = " + root);
log("publicDir = " + publicDir);
log("assetsDir = " + assetsDir);
log("swPath = " + swPath);
log("assets exists? " + existsSync(assetsDir));
const assetFiles = readdirSync(assetsDir);
log("assetFiles count = " + assetFiles.length);
const mainJs = assetFiles.find((f) => f.startsWith("index-") && f.endsWith(".js"));
const cssFiles = assetFiles.filter((f) => f.endsWith(".css"));
log("mainJs = " + mainJs + " cssFiles = " + cssFiles.length);
const jsTags = mainJs ? `<script type="module" src="/assets/${mainJs}" crossorigin></script>` : "";
const cssTags = cssFiles.map((f) => `<link rel="stylesheet" href="/assets/${f}" />`).join("\n    ");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  ${cssTags}
</head>
<body>
  <div id="app"></div>
  ${jsTags}
</body>
</html>`;
writeFileSync(resolve(publicDir, "index.html"), html);
log("Generated app shell index.html");

// ── Step 2: Patch the service worker ───────────────────────────────────────
let swCode = readFileSync(swPath, "utf-8");
log("swCode length = " + swCode.length);
log("has NavigationRoute? " + swCode.includes("NavigationRoute"));
log("has index.html? " + swCode.includes("index.html"));

// 2a. Add index.html to precache if missing
if (!swCode.includes('"index.html"') && !swCode.includes("index.html")) {
  swCode = swCode.replace(
    /(precacheAndRoute\(\[)({url:")/,
    `$1{url:"index.html",revision:null},$2`,
  );
  log("Added index.html to precache");
} else {
  log("index.html already in SW");
}

// 2b. Add NavigationRoute if missing
if (!swCode.includes("NavigationRoute")) {
  const startIdx = swCode.indexOf("precacheAndRoute(");
  log("precacheAndRoute at " + startIdx);
  if (startIdx !== -1) {
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < swCode.length; i++) {
      if (swCode[i] === "(") depth++;
      else if (swCode[i] === ")") {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    const before = swCode.slice(0, endIdx + 1);
    const after = swCode.slice(endIdx + 1);
    const navFallback = ',s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("/index.html"),{denylist:[/^\\/~oauth/,/^\\/api\\//]}))';
    swCode = before + navFallback + after;
    log("Patched NavigationRoute into sw-v3.js");
  }
} else {
  log("NavigationRoute already present");
}

writeFileSync(swPath, swCode);

// ── Step 3: Fix the Nitro asset manifest size ──────────────────────────────
const swStat = readFileSync(swPath);
const actualSize = swStat.length;

let manifest = readFileSync(manifestPath, "utf-8");
const sizeRegex = /("\/sw-v3\.js":\s*\{[^}]*"size":\s*)(\d+)/;
const match = manifest.match(sizeRegex);
if (match) {
  const oldSize = Number(match[2]);
  if (oldSize !== actualSize) {
    manifest = manifest.replace(sizeRegex, `$1${actualSize}`);
    writeFileSync(manifestPath, manifest);
    log("Fixed sw-v3.js manifest size: " + oldSize + " → " + actualSize);
  } else {
    log("sw-v3.js manifest size already correct: " + actualSize);
  }
} else {
  log("WARN: Could not find sw-v3.js entry in manifest");
}
log("SCRIPT COMPLETED");
// Write all logs to a file that will be copied to the runner image
try {
  writeFileSync(resolve(publicDir, "sw-debug.log"), logs.join("\n") + "\n");
} catch(e) {
  // ignore
}
