#!/usr/bin/env node
/**
 * Emit a production Wrangler config with KV namespace IDs and other
 * placeholders substituted from environment variables. The committed
 * wrangler.jsonc intentionally keeps placeholders so real IDs are not
 * checked in; this script creates a local-only wrangler.deploy.json that
 * opennextjs-cloudflare can deploy with `deploy -c wrangler.deploy.json`.
 */

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "wrangler.jsonc");
const dst = path.join(__dirname, "..", "wrangler.deploy.json");

function stripJsonc(input) {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"') {
      out += ch;
      i++;
      while (i < n) {
        const c = input[i];
        out += c;
        i++;
        if (c === "\\" && i < n) {
          out += input[i];
          i++;
          continue;
        }
        if (c === '"') break;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

const raw = fs.readFileSync(src, "utf8");
const cleaned = stripJsonc(raw);
const cfg = JSON.parse(cleaned);

// The production deploy config does not inherit environment-specific env
// blocks (staging/preview); remove them so their placeholders don't block
// substitution of the production KV namespace IDs.
delete cfg.env;

// Wrangler/opennext deploy needs an explicit account_id in the config
// (or in a checked-in wrangler.toml); inject it from the environment.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (accountId) cfg.account_id = accountId;

function substitutePlaceholders(value) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, name) => {
      const v = process.env[name];
      if (typeof v === "string" && v.trim().length > 0) return v;
      throw new Error(`[generate-deploy-wrangler] required env var ${name} is unset`);
    });
  }
  if (Array.isArray(value)) return value.map(substitutePlaceholders);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitutePlaceholders(v);
    return out;
  }
  return value;
}

const substituted = substitutePlaceholders(cfg);
fs.writeFileSync(dst, JSON.stringify(substituted, null, 2));
console.log(`Wrote ${dst}`);
