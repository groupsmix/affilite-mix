#!/usr/bin/env node
/**
 * Emit a preview-scoped Wrangler config for per-PR Cloudflare Worker deploys.
 *
 * Strips fields that must not be inherited by the preview worker:
 *   - routes / custom_domains: owned by the live `affilite-mix` worker.
 *   - triggers.crons: only the production worker should run scheduled jobs.
 *   - services self-reference: preview can't self-bind to the prod service.
 */

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'wrangler.jsonc');
const dst = path.join(__dirname, '..', 'wrangler.preview.json');

const raw = fs.readFileSync(src, 'utf8');

// Strip JSONC comments and trailing commas while respecting string literals.
function stripJsonc(input) {
  let out = '';
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
        if (c === '\\' && i < n) {
          out += input[i];
          i++;
          continue;
        }
        if (c === '"') break;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const cleaned = stripJsonc(raw);
const cfg = JSON.parse(cleaned);

delete cfg.routes;
delete cfg.triggers;
delete cfg.services;

fs.writeFileSync(dst, JSON.stringify(cfg, null, 2));
console.log(`Wrote ${dst}`);
