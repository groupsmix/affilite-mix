const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', 'utf8');

if (!content.includes('blocks domains that resolve to private IPs')) {
  const insertStr = `
  it("blocks domains that resolve to private IPs (DNS rebinding protection)", async () => {
    // We can't guarantee an external DNS will resolve to 10.x.x.x without mocking,
    // but we can test a known public service that resolves to localhost:
    // "localhost.direct" resolves to 127.0.0.1
    const result = await validateExternalUrl("https://localhost.direct");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Resolved IP range|is blocked/);
  });
});`;
  
  content = content.replace('});\n', insertStr);
  fs.writeFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', content);
}

