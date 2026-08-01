import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const uiLayer = `${path.resolve("src/components/ui")}${path.sep}`;

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx|ts)$/.test(file)) files.push(file);
  }
}

walk(root);

const violations = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (!path.resolve(file).startsWith(uiLayer)) {
    const directMuiImport = source.match(/from\s+["']@mui\/material\/(?!styles\b)[^"']+["']/g);
    if (directMuiImport) {
      violations.push(`${path.relative(process.cwd(), file)} imports MUI components directly: ${directMuiImport.join(", ")}`);
    }
  }

  if (!file.endsWith("src/components/ui/Field.tsx") && /type=\{?["']file["']/.test(source)) {
    violations.push(`${path.relative(process.cwd(), file)} uses a native file input; use FileInput from components/ui/Field.`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("UI wrapper usage passed.");
