const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'app/src/components');

function processFile(filePath) {
  if (filePath.includes('ui/Field')) return; // Skip Field.tsx

  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  let hasInput = content.includes('<input');
  let hasSelect = content.includes('<select');
  let hasTextarea = content.includes('<textarea');

  if (!hasInput && !hasSelect && !hasTextarea) return;

  // Replacements
  content = content.replace(/<input/g, '<Input');
  content = content.replace(/<\/input/g, '</Input');
  content = content.replace(/<select/g, '<Select');
  content = content.replace(/<\/select/g, '</Select');
  content = content.replace(/<textarea/g, '<Textarea');
  content = content.replace(/<\/textarea/g, '</Textarea');

  // Determine what to import
  const imports = [];
  if (hasInput) imports.push('Input');
  if (hasSelect) imports.push('Select');
  if (hasTextarea) imports.push('Textarea');

  const importLine = `import { ${imports.join(', ')} } from "./ui/Field";\n`;

  // Find where to insert import. Insert after the last import statement or at the top.
  let lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      lastImportIdx = i;
    }
  }

  if (lastImportIdx !== -1) {
    lines.splice(lastImportIdx + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }

  content = lines.join('\n');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.tsx')) {
    processFile(path.join(dir, file));
  }
});
