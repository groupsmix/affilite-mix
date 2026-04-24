const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', 'utf8');

content = content.replace(
  'import { logger } from "./logger";',
  'import { logger } from "./logger";\nimport dns from "node:dns";\nimport { promisify } from "node:util";\n\nconst lookupAsync = promisify(dns.lookup);'
);

content = content.replace(
  'export function validateExternalUrl(',
  'export async function validateExternalUrl('
);

content = content.replace(
  '  // Domain-to-IP resolution with rebinding check (lightweight approach)\n  // For user-supplied URLs, we resolve and validate; fail-closed on errors\n  try {\n    // In Cloudflare Workers, Dns.lookup() is available. For Next.js edge/node,\n    // we rely on the hostname check above as a baseline.\n    // Production enhancement: use DNS-over-HTTPS with DNSSEC validation.\n  } catch {\n    // If resolution fails, log and block (fail-closed)\n    logger.warn("SSRF guard: DNS resolution failed for hostname", { hostname });\n    return { valid: false, error: "DNS resolution failed — blocked" };\n  }\n\n  return { valid: true };',
  '  // Domain-to-IP resolution with rebinding check (lightweight approach)\n  // For user-supplied URLs, we resolve and validate; fail-closed on errors\n  try {\n    // Skip DNS resolution for IP literals (already checked above)\n    if (!hostname.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/) && !ipv6MappedToIPv4(hostname)) {\n      const { address } = await lookupAsync(hostname);\n      \n      // Check if the resolved IP is in blocked ranges\n      const ipMatch = address.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/);\n      if (ipMatch) {\n        const ip = ipMatch.slice(1).join(".");\n        for (const cidr of BLOCKED_IP_RANGES) {\n          if (ipInRange(ip, cidr)) {\n            return { valid: false, error: `Resolved IP range \\\'${cidr}\\\' is blocked (SSRF risk)` };\n          }\n        }\n      }\n    }\n  } catch (err) {\n    // If resolution fails, log and block (fail-closed)\n    logger.warn("SSRF guard: DNS resolution failed for hostname", { hostname, error: String(err) });\n    return { valid: false, error: "DNS resolution failed — blocked" };\n  }\n\n  return { valid: true };'
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', content);
