import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const issues = [];

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function pngSize(relativePath) {
  const buffer = await readFile(path.join(root, relativePath));
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    issues.push(`${relativePath}: not a PNG`);
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function requireValue(condition, message) {
  if (!condition) issues.push(message);
}

const manifest = JSON.parse(await readText("dist/manifest.webmanifest"));
requireValue(manifest.name, "manifest: name is required");
requireValue(manifest.short_name, "manifest: short_name is required");
requireValue(typeof manifest.description === "string" && manifest.description.length >= 30, "manifest: description is required");
requireValue(manifest.start_url === "/", `manifest: start_url must be '/', got ${manifest.start_url}`);
requireValue(manifest.scope === "/", `manifest: scope must be '/', got ${manifest.scope}`);
requireValue(["standalone", "fullscreen", "minimal-ui"].includes(manifest.display), `manifest: display must be app-like, got ${manifest.display}`);
requireValue(manifest.orientation === "portrait-primary", `manifest: orientation must be portrait-primary, got ${manifest.orientation}`);
requireValue(Array.isArray(manifest.categories) && manifest.categories.includes("education"), "manifest: categories must include education");
requireValue(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3, "manifest: expected app shortcuts");
requireValue(/^#[0-9a-f]{6}$/i.test(manifest.theme_color ?? ""), "manifest: theme_color must be a hex color");
requireValue(/^#[0-9a-f]{6}$/i.test(manifest.background_color ?? ""), "manifest: background_color must be a hex color");

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
for (const size of ["192x192", "512x512"]) {
  requireValue(icons.some((icon) => icon.sizes === size && icon.type === "image/png"), `manifest: missing ${size} PNG icon`);
}
requireValue(icons.some((icon) => icon.sizes === "512x512" && String(icon.purpose ?? "").includes("maskable")), "manifest: missing 512x512 maskable icon");

for (const [relativePath, width, height] of [
  ["dist/pwa-192.png", 192, 192],
  ["dist/pwa-512.png", 512, 512],
  ["dist/apple-touch-icon.png", 180, 180],
]) {
  const size = await pngSize(relativePath);
  requireValue(size?.width === width && size?.height === height, `${relativePath}: expected ${width}x${height}, got ${size?.width}x${size?.height}`);
}

const html = await readText("dist/index.html");
requireValue(html.includes('name="viewport"'), "index.html: missing viewport meta");
requireValue(html.includes('name="theme-color"'), "index.html: missing theme-color meta");
requireValue(html.includes('rel="manifest"'), "index.html: missing manifest link");
requireValue(html.includes('rel="apple-touch-icon"'), "index.html: missing apple touch icon link");

const sw = await readText("dist/sw.js");
requireValue(sw.includes("precacheAndRoute"), "service worker: missing precache route");
requireValue(sw.includes("NavigationRoute"), "service worker: missing navigation fallback");
requireValue(sw.includes("createHandlerBoundToURL") && sw.includes("index.html"), "service worker: missing app-shell fallback");
requireValue(sw.includes("denylist:[/^\\/api\\//]"), "service worker: API routes must be denied from app-shell fallback");

if (issues.length) {
  console.error(`PWA shell audit failed:\n${issues.join("\n")}`);
  process.exit(1);
}

console.log("PWA shell audit passed");
