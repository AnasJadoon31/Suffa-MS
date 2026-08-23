import fs from 'node:fs';
// We can't easily parse Vite's bundle object from outside, but we can look at .output/public/assets
const files = fs.readdirSync('.output/public/assets');
const clientEntries = files.filter(f => f.startsWith('client') || f.startsWith('_client') || f.includes('entry'));
console.log("Entry-like files:", clientEntries);
