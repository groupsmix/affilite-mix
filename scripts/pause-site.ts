#!/usr/bin/env tsx
/**
 * Interactive CLI to pause or unpause a site.
 *
 * Usage:  npm run pause-site
 *
 * Pausing a site comments out its entry in config/sites/index.ts so the
 * middleware returns 404 for that domain. The config file and DB data stay
 * intact so you can re-enable anytime.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

async function main() {
  const sitesDir = path.resolve(__dirname, "../config/sites");
  const indexPath = path.join(sitesDir, "index.ts");
  const index = fs.readFileSync(indexPath, "utf-8");

  // Discover site files (excluding index.ts)
  const siteFiles = fs
    .readdirSync(sitesDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");

  // Determine which are currently active (imported in index.ts)
  const active: string[] = [];
  const paused: string[] = [];

  for (const file of siteFiles) {
    const id = file.replace(".ts", "");
    if (index.includes(`from "./${id}"`)) {
      active.push(id);
    } else {
      paused.push(id);
    }
  }

  console.log("\n📋  Site status:\n");
  for (const id of active) console.log(`  🟢  ${id}  (active)`);
  for (const id of paused) console.log(`  🔴  ${id}  (paused)`);

  const action = await ask("\nAction — (p)ause or (u)npause? ");
  if (!["p", "u", "pause", "unpause"].includes(action.toLowerCase())) {
    console.error("Invalid action.");
    process.exit(1);
  }

  const isPause = action.toLowerCase().startsWith("p");
  const candidates = isPause ? active : paused;

  if (candidates.length === 0) {
    console.log(`\nNo sites to ${isPause ? "pause" : "unpause"}.`);
    rl.close();
    return;
  }

  console.log(`\nAvailable to ${isPause ? "pause" : "unpause"}: ${candidates.join(", ")}`);
  const target = await ask("Site ID: ");
  rl.close();

  if (!candidates.includes(target)) {
    console.error(`"${target}" is not in the list.`);
    process.exit(1);
  }

  if (isPause) {
    // Comment out the import and remove from allSites + re-export
    let updated = index;

    // Comment out import line
    updated = updated.replace(
      new RegExp(`^(import \\{ \\w+ \\} from "\\.\\/${target}";)`, "m"),
      `// $1  // PAUSED`,
    );

    // Remove from allSites array
    const varName = toVarName(target);
    updated = updated.replace(new RegExp(`,?\\s*${varName}`, "g"), (match) => {
      // If it starts with comma, remove the comma too
      return "";
    });

    // Remove from re-export
    updated = updated.replace(
      new RegExp(`(export \\{[^}]*),\\s*${varName}([^}]*\\})`, "g"),
      "$1$2",
    );
    updated = updated.replace(
      new RegExp(`(export \\{[^}]*)${varName},?\\s*([^}]*\\})`, "g"),
      "$1$2",
    );

    fs.writeFileSync(indexPath, updated, "utf-8");
    console.log(`\n⏸️   ${target} paused. Domain will return 404.`);
  } else {
    // Read the site config to get the export name
    const configPath = path.join(sitesDir, `${target}.ts`);
    const configContent = fs.readFileSync(configPath, "utf-8");
    const exportMatch = configContent.match(/export const (\w+)/);
    if (!exportMatch) {
      console.error("Could not find exported variable in config file.");
      process.exit(1);
    }
    const varName = exportMatch[1];

    let updated = index;

    // Uncomment import (or add new one)
    const commentedImport = new RegExp(
      `^// (import \\{ ${varName} \\} from "\\.\\/${target}";)\\s*// PAUSED`,
      "m",
    );
    if (commentedImport.test(updated)) {
      updated = updated.replace(commentedImport, "$1");
    } else {
      // Add fresh import
      updated = updated.replace(
        /(import \{[^}]+\} from "\.\/[^"]+";)\n\n/,
        `$1\nimport { ${varName} } from "./${target}";\n\n`,
      );
    }

    // Add to allSites
    updated = updated.replace(
      /export const allSites: SiteDefinition\[\] = \[([^\]]+)\]/,
      (_, inner) =>
        `export const allSites: SiteDefinition[] = [${inner.trim()}, ${varName}]`,
    );

    // Add to re-export
    updated = updated.replace(
      /export \{([^}]+)\}/,
      (_, inner) => `export { ${inner.trim()}, ${varName} }`,
    );

    fs.writeFileSync(indexPath, updated, "utf-8");
    console.log(`\n▶️   ${target} unpaused and active again!`);
  }
}

function toVarName(id: string): string {
  return id
    .split("-")
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("")
    .concat("Site");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
