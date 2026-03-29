#!/usr/bin/env npx tsx
/**
 * Interactive CLI to pause (or unpause) a niche site.
 *
 * Usage:  npm run pause-site
 *
 * Comments out (or uncomments) the site from the allSites array in index.ts.
 * The config file and DB data remain intact for easy re-enabling.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

const INDEX_FILE = path.resolve(import.meta.dirname, "../config/sites/index.ts");

async function main() {
  const index = fs.readFileSync(INDEX_FILE, "utf-8");

  // Parse active sites from the allSites array
  const allSitesMatch = index.match(/const allSites: SiteDefinition\[\] = \[([^\]]+)\]/);
  if (!allSitesMatch) {
    console.error("Could not parse allSites array from index.ts");
    process.exit(1);
  }

  const activeSites = allSitesMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Parse commented-out (paused) sites
  const pausedMatches = index.match(/\/\/ PAUSED: (\w+)/g) ?? [];
  const pausedSites = pausedMatches.map((m) => m.replace("// PAUSED: ", ""));

  console.log("\n⏸️   Pause / Unpause a site\n");

  if (activeSites.length > 0) {
    console.log("Active sites:");
    activeSites.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }

  if (pausedSites.length > 0) {
    console.log("\nPaused sites:");
    pausedSites.forEach((s) => console.log(`  - ${s} (paused)`));
  }

  const action = await ask("\n(p)ause or (u)npause? [p]: ");
  const isPause = action.toLowerCase() !== "u";

  if (isPause) {
    if (activeSites.length === 0) {
      console.log("No active sites to pause.");
      rl.close();
      return;
    }

    const siteName = await ask(`Site variable name to pause (${activeSites.join(", ")}): `);
    if (!activeSites.includes(siteName)) {
      console.error(`"${siteName}" is not in the active sites list.`);
      process.exit(1);
    }

    // Remove from allSites array
    const newActiveSites = activeSites.filter((s) => s !== siteName);
    let updated = index.replace(
      /const allSites: SiteDefinition\[\] = \[([^\]]+)\]/,
      `const allSites: SiteDefinition[] = [${newActiveSites.join(", ")}]`,
    );

    // Add a PAUSED comment after the allSites line
    updated = updated.replace(
      /(const allSites: SiteDefinition\[\] = \[[^\]]+\];)/,
      `$1\n// PAUSED: ${siteName}`,
    );

    fs.writeFileSync(INDEX_FILE, updated, "utf-8");
    console.log(`\n✅  Paused ${siteName} — removed from allSites array.`);
    console.log(`    The config file is still intact. Run "npm run pause-site" and choose unpause to re-enable.`);
  } else {
    if (pausedSites.length === 0) {
      console.log("No paused sites to unpause.");
      rl.close();
      return;
    }

    const siteName = await ask(`Site to unpause (${pausedSites.join(", ")}): `);
    if (!pausedSites.includes(siteName)) {
      console.error(`"${siteName}" is not in the paused sites list.`);
      process.exit(1);
    }

    // Add back to allSites array
    let updated = index.replace(
      /const allSites: SiteDefinition\[\] = \[([^\]]+)\]/,
      (match, inner: string) => `const allSites: SiteDefinition[] = [${inner.trimEnd()}, ${siteName}]`,
    );

    // Remove the PAUSED comment
    updated = updated.replace(`\n// PAUSED: ${siteName}`, "");

    fs.writeFileSync(INDEX_FILE, updated, "utf-8");
    console.log(`\n✅  Unpaused ${siteName} — added back to allSites array.`);
  }

  console.log();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
