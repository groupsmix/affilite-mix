#!/usr/bin/env npx tsx
/**
 * Interactive CLI to redesign an existing site (colors, fonts, homepage template).
 *
 * Usage:  npm run redesign-site
 *
 * Reads the current config file and lets you update visual properties.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

const SITES_DIR = path.resolve(import.meta.dirname, "../config/sites");

async function main() {
  console.log("\n🎨  Redesign a site\n");

  // List available site config files
  const files = fs
    .readdirSync(SITES_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");

  if (files.length === 0) {
    console.log("No site configs found.");
    rl.close();
    return;
  }

  console.log("Available sites:");
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f.replace(".ts", "")}`));

  const choice = await ask("\nSite to redesign (name or number): ");
  let fileName: string;

  const num = parseInt(choice, 10);
  if (!isNaN(num) && num >= 1 && num <= files.length) {
    fileName = files[num - 1];
  } else {
    fileName = choice.endsWith(".ts") ? choice : `${choice}.ts`;
    if (!files.includes(fileName)) {
      console.error(`File not found: config/sites/${fileName}`);
      process.exit(1);
    }
  }

  const filePath = path.join(SITES_DIR, fileName);
  let content = fs.readFileSync(filePath, "utf-8");

  console.log(`\nEditing: config/sites/${fileName}`);
  console.log("Press Enter to keep current value.\n");

  // Primary color
  const currentPrimary = content.match(/primary:\s*"([^"]+)"/)?.[1] ?? "";
  const newPrimary = await ask(`Primary color [${currentPrimary}]: `);
  if (newPrimary) {
    content = content.replace(/primary:\s*"[^"]+"/, `primary: "${newPrimary}"`);
  }

  // Accent color
  const currentAccent = content.match(/accent:\s*"([^"]+)"/)?.[1] ?? "";
  const newAccent = await ask(`Accent color [${currentAccent}]: `);
  if (newAccent) {
    content = content.replace(/accent:\s*"[^"]+"/, `accent: "${newAccent}"`);
  }

  // Font preset
  const currentFont = content.match(/fonts:\s*"([^"]+)"/)?.[1] ?? "modern";
  const newFont = await ask(`Font preset (modern, classic, arabic) [${currentFont}]: `);
  if (newFont) {
    content = content.replace(/fonts:\s*"[^"]+"/, `fonts: "${newFont}"`);
  }

  // Homepage preset
  const currentHomepage = content.match(/homepage:\s*"([^"]+)"/)?.[1] ?? "standard";
  const newHomepage = await ask(`Homepage preset (standard, cinematic, minimal) [${currentHomepage}]: `);
  if (newHomepage) {
    content = content.replace(/homepage:\s*"[^"]+"/, `homepage: "${newHomepage}"`);
  }

  // Niche description
  const currentNiche = content.match(/niche:\s*"([^"]+)"/)?.[1] ?? "";
  const newNiche = await ask(`Niche description [${currentNiche}]: `);
  if (newNiche) {
    content = content.replace(/niche:\s*"[^"]+"/, `niche: "${newNiche}"`);
  }

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`\n✅  Updated config/sites/${fileName}`);
  console.log(`    Redeploy to see changes live.\n`);

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
