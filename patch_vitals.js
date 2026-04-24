const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/vitals/route.ts', 'utf8');

content = content.replace(
  '    // Cap all string fields at 200 chars to prevent unbounded storage growth\n    const capString = (val: unknown, maxLen = 200): string | undefined => {\n      if (typeof val !== "string") return undefined;\n      return val.slice(0, maxLen) || undefined;\n    };\n\n    const metric = {\n      name: body.name as string,\n      value: body.value as number,\n      id: capString(body.id),\n      page: capString(body.page),\n      href: capString(body.href),\n      rating: capString(body.rating),\n    };',
  '    // Cap all string fields at 200 chars to prevent unbounded storage growth\n    const capString = (val: unknown, maxLen = 200): string | undefined => {\n      if (typeof val !== "string") return undefined;\n      return val.slice(0, maxLen) || undefined;\n    };\n\n    // Strip PII (query parameters and fragments) from URLs\n    const stripPiiFromUrl = (urlStr: unknown): string | undefined => {\n      const capped = capString(urlStr);\n      if (!capped) return undefined;\n      try {\n        // Only keep origin and pathname\n        const u = new URL(capped);\n        return u.origin + u.pathname;\n      } catch {\n        // If it\'s just a path like "/about", strip query/hash manually\n        return capped.split("?")[0].split("#")[0];\n      }\n    };\n\n    const metric = {\n      name: body.name as string,\n      value: body.value as number,\n      id: capString(body.id),\n      page: stripPiiFromUrl(body.page),\n      href: stripPiiFromUrl(body.href),\n      rating: capString(body.rating),\n    };'
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/vitals/route.ts', content);
