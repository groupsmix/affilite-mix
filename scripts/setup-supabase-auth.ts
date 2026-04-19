#!/usr/bin/env tsx
/**
 * Supabase Auth configuration helper.
 *
 * Verifies the service-role key can reach the project and prints the
 * manual dashboard steps needed to finish URL configuration
 * (Supabase does not expose redirect-URL updates via its public API).
 *
 * Usage:  npm run setup-supabase-auth
 */

import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

const SITE_URL = "https://wristnerd.xyz";
const REDIRECT_URLS = [`${SITE_URL}/**`, "https://*.wristnerd.xyz/**"];

function printManualSteps(): void {
  console.log("");
  console.log("Manual step required — Supabase Auth URL settings must be set in the dashboard:");
  console.log("");
  console.log("  1. Open https://supabase.com/dashboard and select the project");
  console.log("  2. Authentication → URL Configuration");
  console.log(`  3. Site URL: ${SITE_URL}`);
  console.log("  4. Redirect URLs:");
  for (const url of REDIRECT_URLS) console.log(`       ${url}`);
  console.log("  5. Save changes");
  console.log("");
}

async function main(): Promise<void> {
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    supabaseUrl = await ask("Supabase URL (e.g. https://xxxxx.supabase.co): ");
  }
  if (!serviceKey) {
    serviceKey = await ask("SUPABASE_SERVICE_ROLE_KEY: ");
  }

  supabaseUrl = supabaseUrl.trim().replace(/\/$/, "");

  console.log("");
  console.log(`Target Supabase: ${supabaseUrl}`);
  console.log(`Target Site URL: ${SITE_URL}`);
  console.log(`Redirect URLs:   ${REDIRECT_URLS.join(", ")}`);
  console.log("");

  const confirm = (await ask("Proceed? (yes/no): ")).toLowerCase();
  if (confirm !== "yes" && confirm !== "y") {
    console.log("Cancelled.");
    rl.close();
    return;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/sites?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Supabase connection check failed (${res.status}): ${body}`);
      console.error("Verify SUPABASE_SERVICE_ROLE_KEY is correct.");
      rl.close();
      process.exitCode = 1;
      return;
    }
    console.log("Supabase connection verified.");
  } catch (err) {
    console.error("Supabase connection error:", err instanceof Error ? err.message : err);
    rl.close();
    process.exitCode = 1;
    return;
  }

  printManualSteps();
  rl.close();
}

void main();
