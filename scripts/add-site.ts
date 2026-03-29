#!/usr/bin/env tsx
/**
 * Interactive CLI to scaffold a new niche site.
 *
 * Usage:  npm run add-site
 *
 * Generates:
 *   1. config/sites/<id>.ts  — site config using defineSite()
 *   2. Appends import + registration in config/sites/index.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

const FONT_PRESETS = ["modern", "classic", "arabic", "minimal"] as const;
const HOMEPAGE_PRESETS = ["standard", "cinematic", "minimal"] as const;
const FEATURE_OPTIONS = [
  "blog",
  "brandSpotlights",
  "comparisons",
  "cookieConsent",
  "deals",
  "giftFinder",
  "newsletter",
  "rssFeed",
  "scheduling",
  "search",
  "taxonomyPages",
] as const;

function toVarName(id: string): string {
  return id
    .split("-")
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("")
    .concat("Site");
}

async function main() {
  console.log("\n🚀  Add a new niche site\n");

  const id = await ask("Site ID (kebab-case, e.g. coffee-gear): ");
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    console.error("Invalid ID. Use lowercase letters, numbers, and dashes.");
    process.exit(1);
  }

  const name = await ask("Display name (e.g. BrewPerfect): ");
  const domain = await ask("Domain (e.g. brewperfect.com): ");
  const niche = await ask("Niche description (e.g. Coffee Equipment Reviews): ");
  const description = await ask("Brand tagline / description: ");
  const primary = await ask("Primary color hex (e.g. #1E293B): ");
  const accent = await ask("Accent color hex (e.g. #10B981): ");

  console.log(`\nFont presets: ${FONT_PRESETS.join(", ")}`);
  const fonts = await ask("Font preset [modern]: ") || "modern";

  console.log(`\nHomepage presets: ${HOMEPAGE_PRESETS.join(", ")}`);
  const homepage = await ask("Homepage preset [standard]: ") || "standard";

  console.log(`\nAvailable features:\n  ${FEATURE_OPTIONS.join(", ")}`);
  const featInput = await ask("Features (comma-separated) [blog,newsletter,search]: ")
    || "blog,newsletter,search";
  const features = featInput.split(",").map((f) => f.trim()).filter(Boolean);

  const language = await ask("Language code [en]: ") || "en";

  rl.close();

  const varName = toVarName(id);

  const featuresArray = features.map((f) => `    "${f}",`).join("\n");

  const fileContent = `import { defineSite } from "../define-site";

export const ${varName} = defineSite({
  id: "${id}",
  name: "${name}",
  domain: "${domain}",
  niche: "${niche}",
  description: "${description}",
  language: "${language}",

  colors: { primary: "${primary}", accent: "${accent}" },
  fonts: "${fonts}",
  homepage: "${homepage}",

  features: [
${featuresArray}
  ],
});
`;

  // Write config file
  const configDir = path.resolve(__dirname, "../config/sites");
  const configPath = path.join(configDir, `${id}.ts`);

  if (fs.existsSync(configPath)) {
    console.error(`\n❌  ${configPath} already exists. Aborting.`);
    process.exit(1);
  }

  fs.writeFileSync(configPath, fileContent, "utf-8");
  console.log(`\n✅  Created ${configPath}`);

  // Update index.ts
  const indexPath = path.join(configDir, "index.ts");
  let index = fs.readFileSync(indexPath, "utf-8");

  // Add import
  const importLine = `import { ${varName} } from "./${id}";`;
  index = index.replace(
    /(import \{[^}]+\} from "\.\/[^"]+";)\n\n/,
    `$1\n${importLine}\n\n`,
  );

  // Add to allSites array
  index = index.replace(
    /export const allSites: SiteDefinition\[\] = \[([^\]]+)\]/,
    (_, inner) => `export const allSites: SiteDefinition[] = [${inner.trim()}, ${varName}]`,
  );

  // Add to re-export
  index = index.replace(
    /export \{([^}]+)\}/,
    (_, inner) => `export { ${inner.trim()}, ${varName} }`,
  );

  fs.writeFileSync(indexPath, index, "utf-8");
  console.log(`✅  Updated ${indexPath}`);
  console.log(`\n🎉  Site "${name}" (${id}) is ready!`);
  console.log(`    Next: add DNS record for ${domain} and insert a row in the sites table.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
