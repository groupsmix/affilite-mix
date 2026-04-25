const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', 'utf8');

const searchStr = `describe("SSRF Guard", () => {
  it("allows valid external HTTPS URLs", async () => {
    expect((await validateExternalUrl("https://example.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://google.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://8.8.8.8")).valid).toBe(true);

  it("blocks domains that resolve to private IPs (DNS rebinding protection)", async () => {
    // We can't guarantee an external DNS will resolve to 10.x.x.x without mocking,
    // but we can test a known public service that resolves to localhost:
    // "localhost.direct" resolves to 127.0.0.1
    const result = await validateExternalUrl("https://localhost.direct");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Resolved IP range|is blocked/);
  });
});
  it("blocks non-HTTPS protocols by default", async () => {`;

const replaceStr = `describe("SSRF Guard", () => {
  it("allows valid external HTTPS URLs", async () => {
    expect((await validateExternalUrl("https://example.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://google.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://8.8.8.8")).valid).toBe(true);
  });

  it("blocks domains that resolve to private IPs (DNS rebinding protection)", async () => {
    // We can't guarantee an external DNS will resolve to 10.x.x.x without mocking,
    // but we can test a known public service that resolves to localhost:
    // "localhost.direct" resolves to 127.0.0.1
    const result = await validateExternalUrl("https://localhost.direct");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Resolved IP range|is blocked/);
  });

  it("blocks non-HTTPS protocols by default", async () => {`;

content = content.replace(searchStr, replaceStr);
fs.writeFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', content);
