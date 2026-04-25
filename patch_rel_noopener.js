const fs = require('fs');
const glob = require('glob');

const files = glob.sync('/data/user/work/affilite-mix/app/**/*.tsx');
let count = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('target="_blank"') && !content.includes('rel="noopener noreferrer"')) {
    content = content.replace(/target="_blank"/g, 'target="_blank" rel="noopener noreferrer"');
    fs.writeFileSync(file, content);
    count++;
  }
}
console.log(`Patched ${count} files`);
