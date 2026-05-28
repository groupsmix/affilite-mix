#!/usr/bin/env node
/**
 * Emit a preview-scoped Wrangler config for per-PR Cloudflare Worker deploys.
 *
 * Strips fields that must not be inherited by the preview worker:
 *   - routes / custom_domains: owned by the live `affilite-mix` worker.
 *   - triggers.crons: only the production worker should run scheduled jobs.
 *   - services self-reference: preview can't self-bind to the prod service.
 */

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "wrangler.jsonc");
const dst = path.join(__dirname, "..", "wrangler.preview.json");

const raw = fs.readFileSync(src, "utf8");

// Strip JSONC comments and trailing commas while respecting string literals.
function stripJsonc(input) {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"') {
      // copy string literal verbatim
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

const cleaned = stripJsonc(raw);
const cfg = JSON.parse(cleaned);

delete cfg.routes;
delete cfg.triggers;
delete cfg.services;

// Override the worker name if a preview name is supplied. `opennextjs-cloudflare
// deploy` (which wraps `wrangler deploy`) reads the name from the config file
// and does not accept a `--name` override, so it must be set here.
const previewName = process.env.PREVIEW_WORKER_NAME || process.argv[2];
if (previewName) {
  cfg.name = previewName;
}

// audit5-#27: Wrangler does NOT perform shell-style `${VAR}` substitution
// on JSON config fields. We do it here so the emitted preview config
// never ships a literal `${RATE_LIMIT_KV_NAMESPACE_ID}` to `wrangler
// deploy`, which would fail opaquely at request time with a "namespace
// not found" error. Any placeholder whose env var is unset falls back
// to a 32-zero sentinel — a valid Cloudflare KV ID shape that will not
// match any real namespace, so the failure surfaces immediately on the
// first KV operation in the preview rather than days later when the
// "deploy" appeared green.
const PLACEHOLDER_SENTINEL = "00000000000000000000000000000000";
function substitutePlaceholders(value) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, name) => {
      const v = process.env[name];
      if (typeof v === "string" && v.trim().length > 0) return v;
      console.warn(
        `[generate-preview-wrangler] env var ${name} unset; substituting sentinel for preview deploy`,
      );
      return PLACEHOLDER_SENTINEL;
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
console.log(`Wrote ${dst}${previewName ? ` (name=${previewName})` : ""}`);
