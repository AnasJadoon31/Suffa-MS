const fs = require('fs');
const file = 'src/i18n/index.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'interpolation: {',
  'react: { useSuspense: false },\n    interpolation: {'
);
fs.writeFileSync(file, content);
