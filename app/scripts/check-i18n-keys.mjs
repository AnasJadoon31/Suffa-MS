import fs from "node:fs";
import path from "node:path";

const srcRoot = path.resolve("src");
const i18nSource = fs.readFileSync(path.join(srcRoot, "i18n", "index.ts"), "utf8");
const definitionCounts = new Map();
for (const match of i18nSource.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9_]*):/gm)) {
  definitionCounts.set(match[1], (definitionCounts.get(match[1]) ?? 0) + 1);
}

const files = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (/\.(ts|tsx)$/.test(entry.name) && !target.endsWith("i18n/index.ts")) files.push(target);
  }
};
visit(srcRoot);

const missing = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z][A-Za-z0-9_.-]*)["']/g)) {
    const hasDirect = (definitionCounts.get(match[1]) ?? 0) >= 2;
    const hasPlural = (definitionCounts.get(`${match[1]}_one`) ?? 0) >= 2
      && (definitionCounts.get(`${match[1]}_other`) ?? 0) >= 2;
    if (!hasDirect && !hasPlural) {
      missing.push(`${path.relative(process.cwd(), file)}: ${match[1]}`);
    }
  }
}

if (missing.length) {
  console.error(`Missing English/Urdu translation keys:\n${[...new Set(missing)].sort().join("\n")}`);
  process.exit(1);
}
console.log(`i18n audit passed (${definitionCounts.size} keys checked)`);
