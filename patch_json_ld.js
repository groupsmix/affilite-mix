const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/app/(public)/components/json-ld.tsx', 'utf8');

content = content.replace(
  'dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}',
  'dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\\\u003c") }}'
);

fs.writeFileSync('/data/user/work/affilite-mix/app/(public)/components/json-ld.tsx', content);

