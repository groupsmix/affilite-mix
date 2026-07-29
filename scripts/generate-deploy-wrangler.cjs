#!/usr/bin/env node
/**
 * Emit a production Wrangler config for Cloudflare Workers deploys.
 *
 * Reads wrangler.jsonc, strips JSONC comments and trailing commas, then
 * replaces ${VAR} placeholders with the corresponding environment variables.
 * The generated file is ignored by git and should not be committed.
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

// Drop per-environment blocks from the production deploy config.
delete cfg.env;

function substitutePlaceholders(value) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, name) => {
      const v = process.env[name];
      if (typeof v === "string" && v.trim().length > 0) return v;
      throw new Error(`Missing required env var ${name} for wrangler.deploy.json`);
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

// Avoid committing generated file: ensure gitignore includes wrangler.deploy.json
fs.writeFileSync(dst, JSON.stringify(substituted, null, 2));
console.log(`Wrote ${dst}`);
