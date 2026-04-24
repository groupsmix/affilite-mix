const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/ai/providers.ts', 'utf8');

content = content.replace('export interface AIProvider', 'import { fetchWithTimeout } from "@/lib/fetch-timeout";\n\nexport interface AIProvider');
content = content.replace(/const res = await fetch\(/g, 'const res = await fetchWithTimeout(');
content = content.replace(/body: JSON\.stringify\(\{\n\s*messages,\n\s*max_tokens: 4096\n\s*\}\),\n\s*\}\);/g, 'body: JSON.stringify({ messages, max_tokens: 4096 }),\n      timeoutMs: 15000,\n    });');
content = content.replace(/generationConfig: \{ maxOutputTokens: 4096 \},\n\s*\}\),\n\s*\}\);/g, 'generationConfig: { maxOutputTokens: 4096 },\n      }),\n      timeoutMs: 15000,\n    });');
content = content.replace(/max_tokens: 4096,\n\s*\}\),\n\s*\}\);/g, 'max_tokens: 4096,\n      }),\n      timeoutMs: 15000,\n    });');

fs.writeFileSync('/data/user/work/affilite-mix/lib/ai/providers.ts', content);
