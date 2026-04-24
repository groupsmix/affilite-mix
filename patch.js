const fs = require('fs');

const files = [
  '/data/user/work/affilite-mix/app/api/admin/feature-flags/route.ts',
  '/data/user/work/affilite-mix/app/api/admin/integrations/route.ts',
  '/data/user/work/affilite-mix/app/api/admin/modules/route.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{ getAdminSession \} from "@\/lib\/auth";/g, 'import { requireAdmin } from "@/lib/admin-guard";');
  
  content = content.replace(/const session = await getAdminSession\(\);\n\s*if \(\!session\) \{\n\s*return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);\n\s*\}/g, 
    'const { error, session } = await requireAdmin();\n  if (error) return error;');
  
  fs.writeFileSync(file, content);
}
