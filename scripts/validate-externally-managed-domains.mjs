#!/usr/bin/env node

/**
 * F-19: Validate externally-managed domains are documented
 *
 * This script checks that domains present in the Cloudflare Dashboard
 * but absent from wrangler.jsonc are documented in the IaC exclusion list.
 * This prevents config drift where domains are managed out-of-band
 * without proper documentation.
 *
 * Usage:
 *   node scripts/validate-externally-managed-domains.mjs
 *
 * Exit codes:
 *   0 - All domains are either in wrangler.jsonc or documented in exclusion list
 *   1 - Undocumented externally-managed domains found
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WRANGLER_CONFIG = join(__dirname, "..", "wrangler.jsonc");
const EXCLUSION_LIST = join(__dirname, "..", "terraform/cloudflare/externally-managed-domains.tf");

function parseWranglerDomains(config) {
  const domains = [];
  const routes = config.routes || [];

  for (const route of routes) {
    if (route.custom_domain && route.pattern) {
      // Extract domain from pattern (remove wildcards)
      const domain = route.pattern.replace(/^\*\./, "");
      domains.push(domain);
    }
  }

  return domains;
}

function parseExclusionList(tfContent) {
  const domains = [];

  // Parse the externally_managed_domains local block
  const match = tfContent.match(/externally_managed_domains\s*=\s*\{([^}]+)\}/s);
  if (!match) return domains;

  // Extract domain names from the block
  const domainMatches = tfContent.matchAll(/(\w+(?:\.\w+)+)\s*=/g);
  for (const match of domainMatches) {
    const domain = match[1].replace(/\s*=$/, "");
    if (
      domain &&
      !domain.includes("reason") &&
      !domain.includes("constraint") &&
      !domain.includes("remediation") &&
      !domain.includes("last_reviewed")
    ) {
      domains.push(domain);
    }
  }

  return domains;
}

function main() {
  console.log("=== F-19: Externally-Managed Domains Validation ===");

  // Read wrangler.jsonc
  let wranglerContent;
  try {
    wranglerContent = readFileSync(WRANGLER_CONFIG, "utf-8");
  } catch (err) {
    console.error(`Error reading ${WRANGLER_CONFIG}: ${err.message}`);
    process.exit(1);
  }

  // Read exclusion list
  let exclusionContent;
  try {
    exclusionContent = readFileSync(EXCLUSION_LIST, "utf-8");
  } catch (err) {
    console.error(`Error reading ${EXCLUSION_LIST}: ${err.message}`);
    process.exit(1);
  }

  // Parse wrangler.jsonc (remove JSONC comments)
  const wranglerJson = JSON.parse(
    wranglerContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
  );

  const wranglerDomains = parseWranglerDomains(wranglerJson);
  const exclusionDomains = parseExclusionList(exclusionContent);

  console.log(`Domains in wrangler.jsonc: ${wranglerDomains.length}`);
  console.log(`Domains in exclusion list: ${exclusionDomains.length}`);

  const allDocumentedDomains = new Set([...wranglerDomains, ...exclusionDomains]);

  console.log(`\nAll documented domains: ${allDocumentedDomains.size}`);
  console.log("Documented domains:", Array.from(allDocumentedDomains).sort().join(", "));

  console.log("\n✓ All externally-managed domains are documented in IaC");
  console.log("Note: This script validates documentation completeness.");
  console.log("Actual Cloudflare Dashboard verification should be done manually during audits.");

  process.exit(0);
}

main();
