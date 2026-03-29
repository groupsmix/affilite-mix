#!/usr/bin/env npx tsx
/**
 * Interactive CLI to scaffold a new niche site.
 *
 * Usage:  npm run add-site
 *
 * Generates a config file in config/sites/ and adds the import to index.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

const SITES_DIR = path.resolve(import.meta.dirname, "../config/sites");
const INDEX_FILE = path.join(SITES_DIR, "index.ts");

const FONT_PRESETS = ["modern", "classic", "arabic"] as const;
const HOMEPAGE_PRESETS = ["standard", "cinematic", "minimal"] as const;
const FEATURE_OPTIONS = [
  "blog",
  "comparisons",
  "deals",
  "newsletter",
  "rssFeed",
  "search",
  "scheduling",
  "giftFinder",
  "cookieConsent",
  "taxonomyPages",
  "brandSpotlights",
] as const;

function toKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) + "Site";
}

async function main() {
  console.log("\n🚀  Add a new niche site\n");

  // Required fields
  const name = await ask("Site name (e.g. BrewPerfect): ");
  if (!name) {
    console.error("Name is required.");
    process.exit(1);
  }

  const domain = await ask("Domain (e.g. brewperfect.com): ");
  if (!domain) {
    console.error("Domain is required.");
    process.exit(1);
  }

  const niche = await ask("Niche description (e.g. Coffee Equipment Reviews): ");
  const primary = (await ask("Primary color hex (e.g. #3C2415): ")) || "#1E293B";
  const accent = (await ask("Accent color hex (e.g. #D4A574): ")) || "#F59E0B";

  // Optional
  console.log(`\nFont presets: ${FONT_PRESETS.join(", ")}`);
  const fontChoice = (await ask("Font preset [modern]: ")) || "modern";

  console.log(`Homepage presets: ${HOMEPAGE_PRESETS.join(", ")}`);
  const homepageChoice = (await ask("Homepage preset [standard]: ")) || "standard";

  const lang = (await ask("Language [en]: ")) || "en";

  console.log(`\nAvailable features: ${FEATURE_OPTIONS.join(", ")}`);
  console.log("Default: blog, comparisons, newsletter, rssFeed, search, scheduling");
  const featuresRaw = await ask("Features (comma-separated, or press Enter for defaults): ");

  const features =
    featuresRaw.length > 0
      ? featuresRaw.split(",").map((f) => f.trim())
      : ["blog", "comparisons", "newsletter", "rssFeed", "search", "scheduling"];

  const productLabel = (await ask("Product label singular [Product]: ")) || "";
  const productLabelPlural = (await ask("Product label plural [Products]: ")) || "";

  // Generate
  const id = toKebab(name.replace(/\s+site$/i, ""));
  const varName = toCamel(id);
  const fileName = `${id}.ts`;
  const filePath = path.join(SITES_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`\nFile already exists: config/sites/${fileName}`);
    process.exit(1);
  }

  // Build config lines
  const lines: string[] = [
    `import { defineSite } from "../define-site";`,
    ``,
    `export const ${varName} = defineSite({`,
    `  id: "${id}",`,
    `  name: "${name}",`,
    `  domain: "${domain}",`,
    `  niche: "${niche}",`,
  ];

  if (lang !== "en") {
    lines.push(`  language: "${lang}",`);
  }

  lines.push(``);
  lines.push(`  colors: { primary: "${primary}", accent: "${accent}" },`);
  lines.push(`  fonts: "${fontChoice}",`);
  lines.push(`  homepage: "${homepageChoice}",`);

  if (productLabel) {
    lines.push(``);
    lines.push(`  productLabel: "${productLabel}",`);
    lines.push(`  productLabelPlural: "${productLabelPlural || productLabel + "s"}",`);
  }

  lines.push(``);
  lines.push(`  features: [`);
  for (const f of features) {
    lines.push(`    "${f}",`);
  }
  lines.push(`  ],`);
  lines.push(`});`);
  lines.push(``);

  const content = lines.join("\n");

  // Write config file
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`\n✅  Created config/sites/${fileName}`);

  // Update index.ts — add import and registration
  let index = fs.readFileSync(INDEX_FILE, "utf-8");

  // Add import line after last import
  const importLine = `import { ${varName} } from "./${id}";`;
  const lastImportIdx = index.lastIndexOf('import {');
  const lastImportEnd = index.indexOf("\n", lastImportIdx);
  index = index.slice(0, lastImportEnd + 1) + importLine + "\n" + index.slice(lastImportEnd + 1);

  // Add to named exports
  index = index.replace(
    /export \{([^}]+)\}/,
    (match, inner: string) => `export {${inner.trimEnd()}, ${varName} }`,
  );

  // Add to allSites array
  index = index.replace(
    /const allSites: SiteDefinition\[\] = \[([^\]]+)\]/,
    (match, inner: string) => `const allSites: SiteDefinition[] = [${inner.trimEnd()}, ${varName}]`,
  );

  fs.writeFileSync(INDEX_FILE, index, "utf-8");
  console.log(`✅  Registered in config/sites/index.ts`);
  console.log(`\n📝  Don't forget to add a row in the Supabase \`sites\` table with id="${id}"`);
  console.log(`📝  Point ${domain} DNS to your Cloudflare Pages deployment`);
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
