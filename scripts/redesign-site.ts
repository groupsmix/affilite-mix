#!/usr/bin/env tsx
/**
 * Interactive CLI to redesign an existing site (colors, fonts, features, homepage).
 *
 * Usage:  npm run redesign-site
 *
 * Updates the site's config file in-place.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

const FONT_PRESETS = ["modern", "classic", "arabic", "minimal"] as const;
const HOMEPAGE_PRESETS = ["standard", "cinematic", "minimal"] as const;

async function main() {
  const sitesDir = path.resolve(__dirname, "../config/sites");
  const siteFiles = fs
    .readdirSync(sitesDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.replace(".ts", ""));

  console.log("\n🎨  Redesign a site\n");
  console.log(`Available sites: ${siteFiles.join(", ")}`);

  const target = await ask("\nSite ID to redesign: ");
  if (!siteFiles.includes(target)) {
    console.error(`Site "${target}" not found.`);
    process.exit(1);
  }

  const configPath = path.join(sitesDir, `${target}.ts`);
  let content = fs.readFileSync(configPath, "utf-8");

  console.log("\nLeave blank to keep current value.\n");

  // Colors
  const primary = await ask("New primary color hex: ");
  const accent = await ask("New accent color hex: ");

  if (primary) {
    content = content.replace(
      /primary:\s*"#[0-9a-fA-F]+"/,
      `primary: "${primary}"`,
    );
  }
  if (accent) {
    content = content.replace(
      /accent:\s*"#[0-9a-fA-F]+"/,
      `accent: "${accent}"`,
    );
  }

  // Fonts
  console.log(`\nFont presets: ${FONT_PRESETS.join(", ")}`);
  const fonts = await ask("New font preset: ");
  if (fonts && FONT_PRESETS.includes(fonts as (typeof FONT_PRESETS)[number])) {
    content = content.replace(/fonts:\s*"[^"]*"/, `fonts: "${fonts}"`);
  }

  // Homepage
  console.log(`\nHomepage presets: ${HOMEPAGE_PRESETS.join(", ")}`);
  const homepage = await ask("New homepage preset: ");
  if (homepage && HOMEPAGE_PRESETS.includes(homepage as (typeof HOMEPAGE_PRESETS)[number])) {
    if (content.includes("homepage:")) {
      content = content.replace(/homepage:\s*"[^"]*"/, `homepage: "${homepage}"`);
    } else {
      // Add homepage field after fonts line
      content = content.replace(
        /(fonts:\s*"[^"]*",?)/,
        `$1\n  homepage: "${homepage}",`,
      );
    }
  }

  rl.close();

  fs.writeFileSync(configPath, content, "utf-8");
  console.log(`\n✅  Updated ${configPath}`);
  console.log("    Run `npm run dev` to preview your changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
