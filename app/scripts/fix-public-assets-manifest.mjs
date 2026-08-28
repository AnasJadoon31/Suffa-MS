#!/usr/bin/env node
// Nitro's SSR build snapshots `.output/public` (size/etag baked into
// `.output/server/index.mjs`) slightly before the client build's async plugin
// hooks — notably vite-plugin-pwa's generateSW step — finish writing their
// files. The result: Nitro serves a stale `Content-Length`, truncating the
// response before the browser gets the full file (seen on the generated
// service worker, whose write lands last). This walks the real files on disk
// after the full build finishes and corrects any manifest entry that drifted.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, ".output/public");
const manifestPath = resolve(root, ".output/server/index.mjs");

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [full];
  });
}

let manifest = readFileSync(manifestPath, "utf-8");
let fixed = 0;

for (const filePath of listFiles(publicDir)) {
  const urlPath = "/" + filePath.slice(publicDir.length + 1).split("\\").join("/");
  const entryRe = new RegExp(
    `("${urlPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*\\{[^{}]*"size":\\s*)(\\d+)([^{}]*\\})`,
  );
  const match = manifest.match(entryRe);
  if (!match) continue;

  const declaredSize = Number(match[2]);
  const actualStat = statSync(filePath);
  if (actualStat.size === declaredSize) continue;

  const content = readFileSync(filePath);
  const etag = `"${createHash("sha1").update(content).digest("hex")}"`;
  const entryText = match[0];
  // Field values are JSON strings and may contain escaped quotes (etag does:
  // e.g. "\"387-abc\""), so `[^"]*` alone would stop at the first inner `\"`.
  const patchedEntry = entryText
    .replace(/"etag":\s*"(?:[^"\\]|\\.)*"/, `"etag": ${JSON.stringify(etag)}`)
    .replace(/"mtime":\s*"(?:[^"\\]|\\.)*"/, `"mtime": ${JSON.stringify(actualStat.mtime.toJSON())}`)
    .replace(/"size":\s*\d+/, `"size": ${actualStat.size}`);
  manifest = manifest.replace(entryText, patchedEntry);
  fixed++;
  console.log(`Fixed ${urlPath}: size ${declaredSize} -> ${actualStat.size}`);
}

if (fixed > 0) {
  writeFileSync(manifestPath, manifest);
  console.log(`fix-public-assets-manifest: corrected ${fixed} stale manifest entr${fixed === 1 ? "y" : "ies"}`);
} else {
  console.log("fix-public-assets-manifest: no stale manifest entries found");
}
