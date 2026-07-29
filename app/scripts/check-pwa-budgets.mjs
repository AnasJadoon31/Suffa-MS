import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = "dist";
const assetsDir = path.join(distDir, "assets");

const limits = {
  appShellJsRaw: 260 * 1024,
  appShellJsGzip: 90 * 1024,
  routeJsRaw: 140 * 1024,
  routeJsGzip: 55 * 1024,
  vendorJsRaw: 500 * 1024,
  vendorJsGzip: 170 * 1024,
  cssRaw: 90 * 1024,
  cssGzip: 18 * 1024,
  serviceWorkerRaw: 16 * 1024,
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function gzipSize(buffer) {
  return gzipSync(buffer).length;
}

function classifyJs(fileName) {
  if (fileName.startsWith("index-")) return "app-shell";
  if (fileName.startsWith("vendor-")) return "vendor";
  return "route";
}

function assertBudget({ fileName, raw, gzip, rawLimit, gzipLimit }) {
  requireValue(raw <= rawLimit, `${fileName}: raw size ${raw} exceeds ${rawLimit}`);
  requireValue(gzip <= gzipLimit, `${fileName}: gzip size ${gzip} exceeds ${gzipLimit}`);
}

const manifest = JSON.parse(await readText(path.join(distDir, "manifest.webmanifest")));
requireValue(typeof manifest.description === "string" && manifest.description.length >= 30, "manifest: description is required for install UI");
requireValue(manifest.orientation === "portrait-primary", `manifest: orientation must be portrait-primary, got ${manifest.orientation}`);
requireValue(Array.isArray(manifest.categories) && manifest.categories.includes("education"), "manifest: categories must include education");
requireValue(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3, "manifest: expected dashboard/attendance/resources shortcuts");
for (const shortcut of manifest.shortcuts) {
  requireValue(shortcut.name && shortcut.short_name && shortcut.url, `manifest shortcut incomplete: ${JSON.stringify(shortcut)}`);
  requireValue(Array.isArray(shortcut.icons) && shortcut.icons.length > 0, `manifest shortcut missing icon: ${shortcut.name}`);
}

const sw = await fs.readFile(path.join(distDir, "sw.js"));
assertBudget({
  fileName: "sw.js",
  raw: sw.length,
  gzip: gzipSize(sw),
  rawLimit: limits.serviceWorkerRaw,
  gzipLimit: limits.serviceWorkerRaw,
});

const files = await fs.readdir(assetsDir);
const budgetReport = [];
for (const fileName of files) {
  if (!fileName.endsWith(".js") && !fileName.endsWith(".css")) continue;
  const buffer = await fs.readFile(path.join(assetsDir, fileName));
  const raw = buffer.length;
  const gzip = gzipSize(buffer);
  budgetReport.push({ fileName, raw, gzip });

  if (fileName.endsWith(".css")) {
    assertBudget({ fileName, raw, gzip, rawLimit: limits.cssRaw, gzipLimit: limits.cssGzip });
    continue;
  }

  const kind = classifyJs(fileName);
  if (kind === "app-shell") {
    assertBudget({ fileName, raw, gzip, rawLimit: limits.appShellJsRaw, gzipLimit: limits.appShellJsGzip });
  } else if (kind === "vendor") {
    assertBudget({ fileName, raw, gzip, rawLimit: limits.vendorJsRaw, gzipLimit: limits.vendorJsGzip });
  } else {
    assertBudget({ fileName, raw, gzip, rawLimit: limits.routeJsRaw, gzipLimit: limits.routeJsGzip });
  }
}

budgetReport.sort((a, b) => b.gzip - a.gzip);
console.log(JSON.stringify({ budgets: limits, largest: budgetReport.slice(0, 8) }, null, 2));
console.log("PWA bundle and install metadata budgets passed");
