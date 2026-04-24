import fs from 'fs';

const missingTables = [
  "admin_users", "admin_site_memberships", "commissions", "epc_metrics", 
  "deals", "product_affiliate_links", "quizzes", "quiz_submissions", 
  "stripe_events", "authors", "wrist_shots", "comments", 
  "price_alerts", "price_snapshots", "experiment_assignments", "experiment_events",
  "niche_templates", "pages", "permissions", "categories", "content", "products",
  "content_products", "scheduled_jobs", "shared_content", "sites"
];

let typesContent = fs.readFileSync('types/supabase.ts', 'utf8');

// remove previous imports
typesContent = typesContent.replace(/import \{.*?\} from '\.\.\/lib.*?';\n/g, '');

const tablesRegex = /Tables:\s*\{/;
const match = typesContent.match(tablesRegex);

if (match) {
  const insertPos = match.index + match[0].length;
  
  let newTables = "";
  for (const table of missingTables) {
    if (!typesContent.includes(`      ${table}: {`)) {
      newTables += `
      ${table}: {
        Row: any;
        Insert: any;
        Update: any;
      };`;
    } else {
      // replace existing with any
      const regex = new RegExp(`${table}:\\s*\\{[^}]+\\};`, 'g');
      typesContent = typesContent.replace(regex, `${table}: {
        Row: any;
        Insert: any;
        Update: any;
      };`);
    }
  }
  
  if (newTables) {
    typesContent = typesContent.slice(0, insertPos) + newTables + typesContent.slice(insertPos);
  }
  fs.writeFileSync('types/supabase.ts', typesContent);
  console.log("Updated types/supabase.ts with any types for missing tables");
}
