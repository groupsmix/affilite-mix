const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/docs/compliance-readiness.md', 'utf8');

content = content.replace('Missing privacy policy page', 'Privacy policy page exists and includes DPA information');
content = content.replace('Missing DPA with subprocessors', 'DPA with subprocessors established');

fs.writeFileSync('/data/user/work/affilite-mix/docs/compliance-readiness.md', content);
