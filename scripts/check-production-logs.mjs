#!/usr/bin/env node
/**
 * F-013: Production log shipping validation
 * 
 * This script ensures that production deployments have log shipping configured.
 * It checks that tail_consumers is not empty in wrangler.jsonc.
 * 
 * Run in CI before production deploy:
 *   node scripts/check-production-logs.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function checkLogShipping() {
  // Check if this is a production deployment
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.CF_DEPLOY_ENVIRONMENT === 'production';
  
  if (!isProduction) {
    console.log('ℹ️  Not a production environment, skipping log shipping check');
    process.exit(0);
  }

  console.log('🔍 Checking production log shipping configuration...');

  // Read wrangler.jsonc
  const wranglerPath = join(__dirname, '..', 'wrangler.jsonc');
  const wranglerContent = readFileSync(wranglerPath, 'utf-8');

  // Parse tail_consumers (handle JSONC - remove comments)
  const jsonContent = wranglerContent
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  let wranglerConfig;
  try {
    wranglerConfig = JSON.parse(jsonContent);
  } catch (err) {
    console.error('❌ Failed to parse wrangler.jsonc:', err.message);
    process.exit(1);
  }

  // Check tail_consumers
  const tailConsumers = wranglerConfig.tail_consumers;

  if (!tailConsumers || !Array.isArray(tailConsumers) || tailConsumers.length === 0) {
    console.error('❌ F-013: Production log shipping is not configured!');
    console.error('');
    console.error('tail_consumers is empty in wrangler.jsonc.');
    console.error('');
    console.error('To fix this:');
    console.error('  1. Deploy the log shipper:');
    console.error('     cd workers/log-shipper && npx wrangler deploy');
    console.error('');
    console.error('  2. Update wrangler.jsonc tail_consumers:');
    console.error('     "tail_consumers": [{ "service": "affilite-mix-log-shipper" }]');
    console.error('');
    console.error('  3. Or set LOG_SHIPPER_ENABLED=true in GitHub Actions variables');
    console.error('     to auto-inject the tail consumer during deploy.');
    console.error('');
    console.error('See: workers/log-shipper/README.md');
    process.exit(1);
  }

  // Validate each tail consumer has required fields
  for (const consumer of tailConsumers) {
    if (!consumer.service) {
      console.error('❌ Invalid tail consumer: missing "service" field');
      console.error(JSON.stringify(consumer, null, 2));
      process.exit(1);
    }
  }

  console.log(`✅ Log shipping configured with ${tailConsumers.length} tail consumer(s):`);
  for (const consumer of tailConsumers) {
    console.log(`   - ${consumer.service}`);
  }

  // Also check observability is enabled
  if (!wranglerConfig.observability?.enabled) {
    console.error('⚠️  Warning: observability.enabled is not set to true');
  }

  console.log('✅ Production log shipping validation passed');
  process.exit(0);
}

checkLogShipping();
