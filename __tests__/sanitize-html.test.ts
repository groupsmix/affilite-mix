import { describe, it, expect } from "vitest";
import { sanitizeHtml, isSafeUrl } from "@/lib/sanitize-html";

describe("sanitizeHtml", () => {
  it("returns empty/falsy input unchanged", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("keeps allowed tags", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("strips disallowed tags and their text content", () => {
    // <script>/<style> bodies must be discarded entirely — leaking the text
    // would re-enable payloads like `<style>body{background:url(javascript:…)}`
    // that pass the tag-allowlist but smuggle dangerous content through.
    const input = "<script>alert('xss')</script><p>safe</p>";
    expect(sanitizeHtml(input)).toBe("<p>safe</p>");
  });

  it("strips event handler attributes", () => {
    const input = '<p onclick="alert(1)">text</p>';
    expect(sanitizeHtml(input)).toBe("<p>text</p>");
  });

  it("strips style attributes", () => {
    const input = '<p style="color:red">text</p>';
    expect(sanitizeHtml(input)).toBe("<p>text</p>");
  });

  it("removes javascript: protocol from href", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("removes data: protocol from src", () => {
    const input = '<img src="data:image/png;base64,abc123" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("src=");
  });

  it("forces rel on <a> tags", () => {
    const input = '<a href="https://example.com">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('rel="noopener noreferrer nofollow"');
  });

  it("preserves allowed attributes on allowed tags", () => {
    const input = '<img src="https://img.example.com/pic.jpg" alt="photo" />';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="https://img.example.com/pic.jpg"');
    expect(result).toContain('alt="photo"');
  });

  it("strips attributes not in the allowlist", () => {
    const input = '<p id="foo" class="bar">text</p>';
    const result = sanitizeHtml(input);
    // <p> has no allowed attributes
    expect(result).toBe("<p>text</p>");
  });

  it("handles self-closing void tags", () => {
    const input = "line1<br />line2<hr />";
    const result = sanitizeHtml(input);
    expect(result).toContain("<br");
    expect(result).toContain("<hr");
  });

  it("escapes special characters in attribute values", () => {
    const input = '<a href="https://example.com?a=1&b=2">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain("&amp;");
  });

  describe("URL scheme allow-list (F-041)", () => {
    const allowed: Array<[string, string]> = [
      ["http", '<a href="http://example.com">x</a>'],
      ["https", '<a href="https://example.com">x</a>'],
      ["mailto", '<a href="mailto:a@b.com">x</a>'],
      ["tel", '<a href="tel:+1-555-0100">x</a>'],
      ["anchor", '<a href="#section">x</a>'],
      ["site-root", '<a href="/about">x</a>'],
      ["relative", '<a href="page.html">x</a>'],
    ];
    for (const [label, input] of allowed) {
      it(`keeps ${label} href`, () => {
        expect(sanitizeHtml(input)).toContain("href=");
      });
    }

    const blocked: Array<[string, string]> = [
      ["javascript", '<a href="javascript:alert(1)">x</a>'],
      ["javascript (padded)", '<a href="  JavaScript:alert(1)">x</a>'],
      ["data", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
      ["vbscript", '<a href="vbscript:msgbox(1)">x</a>'],
      ["blob", '<a href="blob:https://evil/abc">x</a>'],
      ["filesystem", '<a href="filesystem:https://evil/tmp/x">x</a>'],
      ["intent (android)", '<a href="intent://evil#Intent;end">x</a>'],
    ];
    for (const [label, input] of blocked) {
      it(`strips ${label} href`, () => {
        expect(sanitizeHtml(input)).not.toContain("href=");
      });
    }

    it("blocks data: src on <img>", () => {
      const input = '<img src="data:image/png;base64,AAAA" />';
      expect(sanitizeHtml(input)).not.toContain("src=");
    });

    it("allows https: src on <img>", () => {
      const input = '<img src="https://cdn.example.com/pic.jpg" />';
      expect(sanitizeHtml(input)).toContain('src="https://cdn.example.com/pic.jpg"');
    });
  });

  describe("URL scheme evasion via C0 control characters", () => {
    // Browsers strip ASCII tabs, LFs and CRs globally from URLs, and trim
    // leading/trailing C0 controls (U+0000..U+001F) + space before parsing
    // the scheme. Any of those characters must not let `javascript:` slip
    // through scheme detection.
    const controlEvasions: Array<[string, string]> = [
      ["tab inside scheme", "java\tscript:alert(1)"],
      ["newline inside scheme", "java\nscript:alert(1)"],
      ["carriage return inside scheme", "java\rscript:alert(1)"],
      ["leading null byte", "\u0000javascript:alert(1)"],
      ["leading SOH", "\u0001javascript:alert(1)"],
      ["leading space", " javascript:alert(1)"],
      ["leading form feed", "\u000cjavascript:alert(1)"],
    ];
    for (const [label, href] of controlEvasions) {
      it(`blocks ${label}`, () => {
        expect(isSafeUrl(href)).toBe(false);
        const out = sanitizeHtml(`<a href="${href.replace(/"/g, "&quot;")}">x</a>`);
        expect(out).not.toContain("href=");
      });
    }
  });

  // F-12: OWASP XSS filter evasion adversarial corpus
  describe("OWASP XSS filter evasion payloads", () => {
    const xssPayloads: Array<[string, string]> = [
      // Event handler variants
      ["onerror on img", "<img src=x onerror=alert(1) />"],
      ["onload on img", "<img src=x onload=alert(1) />"],
      ["onmouseover on div", "<div onmouseover=alert(1)>x</div>"],
      ["onfocus on a", '<a href="#" onfocus=alert(1)>x</a>'],
      ["onblur on a", '<a href="#" onblur=alert(1)>x</a>'],

      // SVG/MathML vectors (tags not in allowlist)
      ["svg onload", "<svg onload=alert(1)>"],
      ["svg script", "<svg><script>alert(1)</script></svg>"],
      [
        "math href",
        '<math><maction actiontype="statusline" xlink:href="javascript:alert(1)">x</maction></math>',
      ],

      // Encoding-based evasion
      [
        "HTML entity in href",
        '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">x</a>',
      ],
      [
        "hex entity in href",
        '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">x</a>',
      ],
      ["mixed case javascript", '<a href="JaVaScRiPt:alert(1)">x</a>'],
      ["URL-encoded javascript", '<a href="java%73cript:alert(1)">x</a>'],

      // data: URI variants
      ["data:text/html", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
      [
        "data: base64",
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
      ],
      [
        "data: with charset",
        '<a href="data:text/html;charset=utf-8,<script>alert(1)</script>">x</a>',
      ],

      // Nested/recursive stripping
      ["nested script", "<scr<script>ipt>alert(1)</scr</script>ipt>"],
      ["script in tag attr", '<p title="<script>alert(1)</script>">x</p>'],

      // Style-based attacks
      ["style tag", "<style>body{background:url(javascript:alert(1))}</style>"],
      ["inline style expression", '<p style="width:expression(alert(1))">x</p>'],
      ["style url", '<p style="background:url(javascript:alert(1))">x</p>'],

      // iframe/embed/object (not in allowlist)
      ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
      ["embed", '<embed src="javascript:alert(1)">'],
      ["object", '<object data="javascript:alert(1)">'],

      // Form/input injection
      ["form action", '<form action="javascript:alert(1)"><input type=submit>'],
      ["input onfocus", "<input onfocus=alert(1) autofocus>"],

      // Meta redirect
      ["meta refresh", '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],

      // Base tag hijack
      ["base href", '<base href="javascript:alert(1)">'],

      // Null byte injection
      ["null in tag name", "<scr\x00ipt>alert(1)</script>"],
    ];

    for (const [label, input] of xssPayloads) {
      it(`blocks ${label}`, () => {
        const result = sanitizeHtml(input);
        expect(result).not.toMatch(/on\w+\s*=/i);
        expect(result).not.toContain("javascript:");
        expect(result).not.toContain("expression(");
        expect(result).not.toMatch(
          /<(script|style|iframe|embed|object|form|input|meta|base|svg|math)\b/i,
        );
      });
    }
  });

  describe("heading remapping", () => {
    it("remaps h1 to h2", () => {
      expect(sanitizeHtml("<h1>Title</h1>")).toBe("<h2>Title</h2>");
    });
  });

  describe("nesting depth limit (A73-F1)", () => {
    it("flattens elements beyond MAX_NESTING_DEPTH", () => {
      // Build a deeply nested structure that exceeds 100 levels
      const open = "<div>".repeat(105);
      const close = "</div>".repeat(105);
      const result = sanitizeHtml(open + "deep" + close);
      // The inner tags beyond depth 100 are flattened (no wrapping tag)
      // but content is preserved
      expect(result).toContain("deep");
      // Should have fewer div tags than input since some are flattened
      const divCount = (result.match(/<div>/g) || []).length;
      expect(divCount).toBeLessThan(105);
    });
  });

  describe("class attribute filtering", () => {
    it("allows language-* classes on code elements", () => {
      const input = '<code class="language-typescript">x</code>';
      expect(sanitizeHtml(input)).toContain('class="language-typescript"');
    });

    it("allows text alignment classes on div elements", () => {
      const input = '<div class="text-center">x</div>';
      expect(sanitizeHtml(input)).toContain('class="text-center"');
    });

    it("strips disallowed class values", () => {
      const input = '<div class="evil-class">x</div>';
      expect(sanitizeHtml(input)).toBe("<div>x</div>");
    });

    it("filters mixed allowed and disallowed classes", () => {
      const input = '<div class="text-left evil language-js">x</div>';
      expect(sanitizeHtml(input)).toContain('class="text-left language-js"');
    });
  });

  describe("buildAttrs edge cases", () => {
    it("strips user-supplied rel on anchor tags", () => {
      const input = '<a href="https://example.com" rel="opener">x</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('rel="noopener noreferrer nofollow"');
      expect(result).not.toContain('opener"');
    });

    it("preserves allowed attrs like colspan on td", () => {
      const input = '<td colspan="2">x</td>';
      expect(sanitizeHtml(input)).toContain('colspan="2"');
    });

    it("preserves scope on th", () => {
      const input = '<th scope="col">x</th>';
      expect(sanitizeHtml(input)).toContain('scope="col"');
    });

    it("preserves start and type on ol", () => {
      const input = '<ol start="5" type="a"><li>x</li></ol>';
      expect(sanitizeHtml(input)).toContain('start="5"');
    });

    it("preserves cite on blockquote", () => {
      const input = '<blockquote cite="https://example.com">x</blockquote>';
      expect(sanitizeHtml(input)).toContain('cite="https://example.com"');
    });
  });

  describe("isSafeUrl edge cases", () => {
    it("returns false for non-string input", () => {
      expect(isSafeUrl(null as unknown as string)).toBe(false);
      expect(isSafeUrl(undefined as unknown as string)).toBe(false);
      expect(isSafeUrl(123 as unknown as string)).toBe(false);
    });

    it("returns false for empty string after trimming", () => {
      expect(isSafeUrl("   ")).toBe(false);
      expect(isSafeUrl("\t\n\r")).toBe(false);
    });

    it("blocks protocol-relative URLs (//)", () => {
      expect(isSafeUrl("//evil.example.com/x")).toBe(false);
    });

    it("allows relative paths without scheme", () => {
      expect(isSafeUrl("foo/bar.html")).toBe(true);
      expect(isSafeUrl("../page")).toBe(true);
    });
  });

  describe("MAX_INPUT_LENGTH", () => {
    it("throws when input exceeds maximum length", () => {
      const longInput = "x".repeat(100_001);
      expect(() => sanitizeHtml(longInput)).toThrow("exceeds maximum allowed length");
    });
  });

  describe("suppress depth for disallowed non-void tags", () => {
    it("suppresses text inside nested disallowed tags", () => {
      const input = "<style><div>hidden</div></style><p>visible</p>";
      const result = sanitizeHtml(input);
      expect(result).not.toContain("hidden");
      expect(result).toContain("<p>visible</p>");
    });

    it("handles disallowed void tags without incrementing suppress depth", () => {
      const input = "<input /><p>visible</p>";
      const result = sanitizeHtml(input);
      expect(result).toBe("<p>visible</p>");
    });
  });

  describe("data: URI variants in img src", () => {
    const dataUris: Array<[string, string]> = [
      ["plain data:image/svg", '<img src="data:image/svg+xml,<svg onload=alert(1)>" />'],
      ["data:image/png base64", '<img src="data:image/png;base64,iVBORw0KGgo=" />'],
      [
        "data:image/gif",
        '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" />',
      ],
    ];
    for (const [label, input] of dataUris) {
      it(`blocks ${label}`, () => {
        expect(sanitizeHtml(input)).not.toContain("src=");
      });
    }
  });
});
