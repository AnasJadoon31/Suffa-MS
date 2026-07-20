import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src/components');

function fixFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixFiles(fullPath);
    } else {
      if (!fullPath.endsWith('.tsx') || fullPath.includes('/ui/')) continue;
      let content = fs.readFileSync(fullPath, 'utf-8');
      let originalContent = content;

      // Find any <button followed by whitespace, >, or {
      content = content.replace(/<button([\s>\{])/g, '<Button$1');
      // Find any </button> (even with spaces)
      content = content.replace(/<\/button\s*>/g, '</Button>');

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

fixFiles(srcDir);
