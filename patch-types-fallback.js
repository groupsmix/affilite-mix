import fs from 'fs';

let typesContent = fs.readFileSync('types/supabase.ts', 'utf8');

const tablesRegex = /Tables:\s*\{/;
const match = typesContent.match(tablesRegex);

if (match) {
  const insertPos = match.index + match[0].length;
  
  const fallback = `
      [key: string]: {
        Row: any;
        Insert: any;
        Update: any;
      };`;
  
  typesContent = typesContent.slice(0, insertPos) + fallback + typesContent.slice(insertPos);
  fs.writeFileSync('types/supabase.ts', typesContent);
  console.log("Updated types/supabase.ts with fallback index signature");
}
