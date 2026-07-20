import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src/components');

function getRelativeUiPath(filePath) {
  const depth = filePath.replace(srcDir, '').split(path.sep).length - 2;
  if (depth <= 0) return './ui';
  return '../'.repeat(depth) + 'ui';
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  // Skip the ui components themselves to avoid circular/broken imports
  if (filePath.includes('/ui/')) return;

  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  let needsButton = false;
  let needsCheckbox = false;
  let needsRadio = false;
  let needsInput = false;

  // Replace <button> tags
  if (content.includes('<button') || content.includes('</button>')) {
    content = content.replace(/<button /g, '<Button ');
    content = content.replace(/<button>/g, '<Button>');
    content = content.replace(/<\/button>/g, '</Button>');
    needsButton = true;
  }

  // Replace <input type="checkbox">
  if (content.includes('type="checkbox"')) {
    content = content.replace(/<input([^>]*?)type="checkbox"([^>]*?)>/g, '<Checkbox$1$2>');
    content = content.replace(/<input([^>]*?)type={'checkbox'}([^>]*?)>/g, '<Checkbox$1$2>');
    needsCheckbox = true;
  }

  // Replace <input type="radio">
  if (content.includes('type="radio"')) {
    content = content.replace(/<input([^>]*?)type="radio"([^>]*?)>/g, '<Radio$1$2>');
    content = content.replace(/<input([^>]*?)type={'radio'}([^>]*?)>/g, '<Radio$1$2>');
    needsRadio = true;
  }

  // Check for any remaining <input> that isn't already <Input>
  // Exclude <input type="file"> or if we want <Input type="file"> we can do that too. Field.tsx Input allows any props.
  // Actually, replacing <input to <Input for all remaining inputs.
  if (/<input\s/.test(content)) {
    content = content.replace(/<input\s/g, '<Input ');
    needsInput = true;
  }

  if (content !== originalContent) {
    // Determine the import string for the UI components
    const uiPath = getRelativeUiPath(filePath);
    
    // Add imports
    const importMatch = content.match(new RegExp(`import \\{[^\\}]*\\} from ["']${uiPath}/(Button|Field)["'];?`, 'g'));
    
    if (needsButton) {
      if (!content.includes(`from "${uiPath}/Button"`)) {
        content = `import { Button } from "${uiPath}/Button";\n` + content;
      }
    }

    if (needsCheckbox || needsRadio || needsInput) {
      const fieldImportRegex = new RegExp(`import \\{([^\\}]*)\\} from ["']${uiPath}/Field["']`);
      const match = content.match(fieldImportRegex);
      
      let toAdd = [];
      if (needsCheckbox) toAdd.push("Checkbox");
      if (needsRadio) toAdd.push("Radio");
      if (needsInput) toAdd.push("Input");

      if (match) {
        let imports = match[1].split(',').map(s => s.trim());
        toAdd.forEach(item => {
          if (!imports.includes(item)) imports.push(item);
        });
        content = content.replace(fieldImportRegex, `import { ${imports.join(', ')} } from "${uiPath}/Field"`);
      } else {
        content = `import { ${toAdd.join(', ')} } from "${uiPath}/Field";\n` + content;
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  }
}

function traverseDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      traverseDir(fullPath);
    } else {
      processFile(fullPath);
    }
  }
}

traverseDir(srcDir);
console.log('Refactoring complete.');
