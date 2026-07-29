import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const issues = [];

function requireValue(condition, message) {
  if (!condition) issues.push(message);
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function pngDetails(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const buffer = await readFile(absolutePath);
  const stats = await stat(absolutePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    issues.push(`${relativePath}: not a PNG`);
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: stats.size,
  };
}

function screenshotByFactor(screenshots, formFactor) {
  return screenshots.find((screenshot) => screenshot.form_factor === formFactor);
}

const manifest = JSON.parse(await readText("dist/manifest.webmanifest"));
const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];

requireValue(screenshots.length >= 2, "manifest: expected narrow and wide screenshots for install UI");

for (const [formFactor, sizes] of [
  ["narrow", "390x844"],
  ["wide", "1440x900"],
]) {
  const screenshot = screenshotByFactor(screenshots, formFactor);
  requireValue(Boolean(screenshot), `manifest: missing ${formFactor} screenshot`);
  if (!screenshot) continue;

  requireValue(screenshot.sizes === sizes, `manifest: ${formFactor} screenshot sizes must be ${sizes}, got ${screenshot.sizes}`);
  requireValue(screenshot.type === "image/png", `manifest: ${formFactor} screenshot must be image/png`);
  requireValue(typeof screenshot.label === "string" && screenshot.label.length >= 8, `manifest: ${formFactor} screenshot needs a useful label`);
  requireValue(typeof screenshot.src === "string" && screenshot.src.startsWith("/screenshots/"), `manifest: ${formFactor} screenshot src must live under /screenshots/`);

  const [width, height] = sizes.split("x").map(Number);
  const details = await pngDetails(`dist${screenshot.src}`);
  requireValue(details?.width === width && details?.height === height, `dist${screenshot.src}: expected ${sizes}, got ${details?.width}x${details?.height}`);
  requireValue((details?.bytes ?? 0) > 20_000, `dist${screenshot.src}: screenshot is too small to be a useful install preview`);
}

if (issues.length) {
  console.error(`PWA install asset audit failed:\n${issues.join("\n")}`);
  process.exit(1);
}

console.log("PWA install asset audit passed");
