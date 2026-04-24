import fs from 'fs';

const tablesMapping = {
  "admin_users": { type: "AdminUserRow", file: "../lib/dal/admin-users" },
  "admin_site_memberships": { type: "AdminSiteMembershipRow", file: "../lib/dal/admin-users" },
  "commissions": { type: "CommissionRow", file: "../lib/dal/commissions" },
  "epc_metrics": { type: "EpcMetricRow", file: "../lib/dal/epc-metrics" },
  "deals": { type: "DealRow", file: "../lib/dal/deals" },
  "product_affiliate_links": { type: "ProductAffiliateLinkRow", file: "../lib/dal/product-affiliate-links" },
  "quizzes": { type: "QuizRow", file: "../lib/dal/quizzes" },
  "quiz_submissions": { type: "QuizSubmissionRow", file: "../lib/dal/quizzes" },
  "stripe_events": { type: "StripeEventRow", file: "../lib/dal/stripe-events" },
  "authors": { type: "AuthorRow", file: "../lib/dal/authors" },
  "wrist_shots": { type: "WristShotRow", file: "../lib/dal/wrist-shots" },
  "comments": { type: "CommentRow", file: "../lib/dal/comments" },
  "price_alerts": { type: "PriceAlertRow", file: "../lib/dal/price-alerts" },
  "price_snapshots": { type: "PriceSnapshotRow", file: "../lib/dal/price-snapshots" },
  "experiment_assignments": { type: "ExperimentAssignmentRow", file: "../lib/ab-testing" },
  "experiment_events": { type: "ExperimentEventRow", file: "../lib/ab-testing" }
};

let typesContent = fs.readFileSync('types/supabase.ts', 'utf8');

// Remove previous fallback if it exists
typesContent = typesContent.replace(/\[key: string\]: \{\s*Row: any;\s*Insert: any;\s*Update: any;\s*\};/g, '');

let imports = "";
for (const [table, config] of Object.entries(tablesMapping)) {
  imports += `import { ${config.type} } from '${config.file}';\n`;
}

typesContent = imports + typesContent;

const tablesRegex = /Tables:\s*\{/;
const match = typesContent.match(tablesRegex);

if (match) {
  const insertPos = match.index + match[0].length;
  
  let newTables = "";
  for (const [table, config] of Object.entries(tablesMapping)) {
    if (!typesContent.includes(`      ${table}: {`)) {
      newTables += `
      ${table}: {
        Row: ${config.type};
        Insert: Partial<${config.type}>;
        Update: Partial<${config.type}>;
      };`;
    }
  }
  
  if (newTables) {
    typesContent = typesContent.slice(0, insertPos) + newTables + typesContent.slice(insertPos);
  }
  fs.writeFileSync('types/supabase.ts', typesContent);
  console.log("Updated types/supabase.ts with correct file imports");
}
