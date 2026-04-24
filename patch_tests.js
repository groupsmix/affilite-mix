const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/__tests__/rate-limit-fail-open.test.ts', 'utf8');

content = content.replace(/fails closed immediately when KV binding is missing in production/g, 'fails open gracefully when KV binding is missing in production');
content = content.replace(/fails closed immediately when KV.get throws in production/g, 'fails open gracefully when KV.get throws in production');
content = content.replace(/Fail-closed: rate-limited requests will now be rejected/g, 'Fail-open: rate-limited requests will temporarily use per-isolate memory fallback');
content = content.replace(/rate-limit.kv-unavailable-fail-closed/g, 'rate-limit.kv-unavailable-fail-open');

// Fix assertions
content = content.replace(/expect\(result\.allowed\)\.toBe\(false\);/g, 'expect(result.allowed).toBe(true);');
content = content.replace(/expect\(result\.remaining\)\.toBe\(0\);/g, 'expect(result.remaining).toBe(1);');
content = content.replace(/expect\(result\.retryAfterMs\)\.toBe\(60_000\);/g, 'expect(result.retryAfterMs).toBe(0);');
content = content.replace(/expect\(result2\.allowed\)\.toBe\(false\);/g, 'expect(result2.allowed).toBe(true);');
content = content.replace(/expect\(res\.allowed\)\.toBe\(false\);/g, 'expect(res.allowed).toBe(true);');
content = content.replace(/expect\(missingCall\.allowed\)\.toBe\(false\);/g, 'expect(missingCall.allowed).toBe(true);');
content = content.replace(/expect\(brokenAgain\.allowed\)\.toBe\(false\);/g, 'expect(brokenAgain.allowed).toBe(true);');

fs.writeFileSync('/data/user/work/affilite-mix/__tests__/rate-limit-fail-open.test.ts', content);
