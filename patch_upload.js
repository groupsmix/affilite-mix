const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/admin/upload/route.ts', 'utf8');

content = content.replace('return NextResponse.json({ uploadUrl, publicUrl });', 'const res = NextResponse.json({ uploadUrl, publicUrl });\n    res.headers.set("Content-Disposition", "attachment");\n    return res;');

fs.writeFileSync('/data/user/work/affilite-mix/app/api/admin/upload/route.ts', content);
