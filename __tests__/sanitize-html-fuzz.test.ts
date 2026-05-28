/**
 * H-1: Fuzz harness for lib/sanitize-html.ts
 *
 * Corpus-driven tests using known XSS bypass vectors from:
 * - OWASP XSS Filter Evasion Cheat Sheet
 * - PortSwigger XSS cheat sheet
 * - html5sec.org
 * - DOMPurify bypass research
 *
 * Every output is asserted to NOT contain executable payloads:
 *   - No javascript:/data:/vbscript: in href/src
 *   - No on* event handlers
 *   - No <script>, <style>, <svg>, <math>, <iframe>, <object> tags
 *   - No tag-breaking attribute injection
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml, isSafeUrl } from "@/lib/sanitize-html";

/** Assert that sanitized output contains none of the known-dangerous patterns. */
function assertSafe(output: string, label: string): void {
  const lc = output.toLowerCase();

  // No executable script tags
  expect(lc).not.toMatch(/<script[\s>]/);
  expect(lc).not.toMatch(/<\/script>/);

  // No event handlers
  expect(lc).not.toMatch(/\bon\w+\s*=/);

  // No dangerous tags
  for (const tag of [
    "style",
    "svg",
    "math",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "meta",
    "link",
    "base",
  ]) {
    expect(lc).not.toMatch(new RegExp(`<${tag}[\\s>]`));
  }

  // No javascript:/vbscript:/data: in attributes
  expect(lc).not.toMatch(/(?:href|src)\s*=\s*["']?\s*javascript\s*:/);
  expect(lc).not.toMatch(/(?:href|src)\s*=\s*["']?\s*vbscript\s*:/);
  expect(lc).not.toMatch(/(?:href|src)\s*=\s*["']?\s*data\s*:/);

  // No style attributes (always stripped)
  expect(lc).not.toMatch(/\bstyle\s*=/);
}

describe("sanitize-html fuzz corpus", () => {
  // ---- Script injection vectors ----
  const SCRIPT_VECTORS = [
    "<script>alert(1)</script>",
    "<SCRIPT SRC=https://evil.example/xss.js></SCRIPT>",
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "<script/src=data:,alert(1)>",
    "<script>alert(String.fromCharCode(88,83,83))</script>",
    '<<script>alert("XSS");//<</script>',
    "<script>a]]}()//</script>",
    '<script src="data:text/javascript,alert(1)"></script>',
  ];

  it.each(SCRIPT_VECTORS)("strips script injection: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Event handler injection ----
  const EVENT_VECTORS = [
    "<img src=x onerror=alert(1)>",
    '<img src=x onerror="alert(1)">',
    "<body onload=alert(1)>",
    '<div onmouseover="alert(1)">hover me</div>',
    '<a href="#" onclick="alert(1)">click</a>',
    '<input onfocus="alert(1)" autofocus>',
    '<details open ontoggle="alert(1)">',
    "<marquee onstart=alert(1)>",
    '<video><source onerror="alert(1)">',
    "<img src=1 oNeRrOr=alert(1)>",
  ];

  it.each(EVENT_VECTORS)("strips event handlers: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Protocol/scheme bypass vectors ----
  const PROTOCOL_VECTORS = [
    '<a href="javascript:alert(1)">click</a>',
    '<a href="JAVASCRIPT:alert(1)">click</a>',
    '<a href="java\tscript:alert(1)">click</a>',
    '<a href="java\nscript:alert(1)">click</a>',
    '<a href="java\rscript:alert(1)">click</a>',
    '<a href="&#106;avascript:alert(1)">click</a>',
    '<a href="&#x6A;avascript:alert(1)">click</a>',
    '<a href=" javascript:alert(1)">click</a>',
    '<a href="vbscript:MsgBox(1)">click</a>',
    '<a href="data:text/html,<script>alert(1)</script>">click</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
    '<img src="javascript:alert(1)">',
    '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  ];

  it.each(PROTOCOL_VECTORS)("blocks dangerous protocols: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- SVG/MathML mXSS vectors ----
  const SVG_MATH_VECTORS = [
    '<svg onload="alert(1)">',
    "<svg><script>alert(1)</script></svg>",
    '<svg><a xlink:href="javascript:alert(1)"><text>click</text></a></svg>',
    '<math><maction actiontype="toggle"><mtext>click</mtext><script>alert(1)</script></maction></math>',
    "<svg><foreignObject><body onload=alert(1)></foreignObject></svg>",
    "<svg><animate onbegin=alert(1) attributeName=x dur=1s>",
    "<svg><set onbegin=alert(1) attributeName=x to=y>",
    '<math><mi//teleporting="true">',
  ];

  it.each(SVG_MATH_VECTORS)("strips SVG/MathML mXSS: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Style injection vectors ----
  const STYLE_VECTORS = [
    '<div style="background:url(javascript:alert(1))">',
    '<div style="behavior:url(xss.htc)">',
    '<div style="width:expression(alert(1))">',
    "<style>body{background:url(javascript:alert(1))}</style>",
    '<link rel=stylesheet href="data:text/css,body{background:url(javascript:alert(1))}">',
  ];

  it.each(STYLE_VECTORS)("strips style injection: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Embedding/iframe vectors ----
  const EMBED_VECTORS = [
    '<iframe src="javascript:alert(1)">',
    '<iframe src="data:text/html,<script>alert(1)</script>">',
    '<object data="javascript:alert(1)">',
    '<embed src="javascript:alert(1)">',
    '<form action="javascript:alert(1)"><input type=submit>',
    '<base href="javascript:alert(1)//">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  ];

  it.each(EMBED_VECTORS)("strips embed/iframe: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Attribute breaking / mutation vectors ----
  const MUTATION_VECTORS = [
    '<a href="x" onclick="alert(1)" href="safe">click</a>',
    '<img src="x" title="x" onerror="alert(1)">',
    '<p class="x" id="y" style="background:url(javascript:alert(1))">text</p>',
    '<div data-custom="x" onclick="alert(1)">text</div>',
    // Null byte injection
    '<a href="java\x00script:alert(1)">click</a>',
    // Unicode replacement attempts
    '<a href="\u0001javascript:alert(1)">click</a>',
    // Backtick attribute delimiter (IE)
    "<img src=`javascript:alert(1)`>",
  ];

  it.each(MUTATION_VECTORS)("handles mutation/breaking: %s", (input) => {
    const output = sanitizeHtml(input);
    assertSafe(output, input);
  });

  // ---- Nesting depth attack ----
  it("handles excessive nesting depth without crashing", () => {
    const depth = 200;
    const open = "<div>".repeat(depth);
    const close = "</div>".repeat(depth);
    const input = open + "payload" + close;
    const output = sanitizeHtml(input);
    assertSafe(output, "depth attack");
    expect(output).toContain("payload");
  });

  // ---- Length limit ----
  it("rejects input exceeding MAX_INPUT_LENGTH", () => {
    const input = "a".repeat(100_001);
    expect(() => sanitizeHtml(input)).toThrow(/exceeds maximum/);
  });

  // ---- Empty / null-ish inputs ----
  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("preserves safe HTML", () => {
    const safe = "<p>Hello <strong>world</strong></p>";
    const output = sanitizeHtml(safe);
    expect(output).toBe(safe);
  });

  it("preserves safe links with allowed attributes", () => {
    const safe = '<a href="https://example.com" title="Example">link</a>';
    const output = sanitizeHtml(safe);
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("isSafeUrl fuzz corpus", () => {
  const UNSAFE_URLS = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    " javascript:alert(1)",
    "\x01javascript:alert(1)",
    "vbscript:MsgBox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "//evil.example/path",
  ];

  it.each(UNSAFE_URLS)("rejects unsafe URL: %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  const SAFE_URLS = [
    "https://example.com",
    "http://example.com",
    "https://example.com/path?q=1",
    "/relative/path",
    "#anchor",
    "relative/path",
    "../parent/path",
  ];

  it.each(SAFE_URLS)("accepts safe URL: %s", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });
});
