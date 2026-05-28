/**
 * F-XSS-01 — Regression suite for the entity-decode XSS bypass in
 * `lib/sanitize-html.ts`.
 *
 * Before this fix, htmlparser2's default `decodeEntities: true` caused
 * the `ontext` callback to receive raw decoded characters (e.g. the
 * input `&lt;` was decoded to `<` before reaching the callback) and the
 * sanitizer then pushed that decoded text straight into the output
 * buffer. The browser, on reading the output via
 * `dangerouslySetInnerHTML`, parses those characters as new HTML
 * markup, completely bypassing the tag / attribute allow-list.
 *
 * Two attack shapes were possible:
 *
 *   1. Single-encoded write + single-encoded read
 *        in   : `&lt;img src=x onerror=alert(1)&gt;`
 *        out  : `<img src=x onerror=alert(1)>`  (when only one
 *               sanitize pass runs)
 *
 *   2. Double-encoded write + double-sanitize render (write-then-render
 *      flow used by `app/api/admin/content/route.ts` →
 *      `app/(public)/components/html-renderer.tsx`)
 *        in    : `&amp;lt;img src=x onerror=alert(1)&amp;gt;`
 *        write : `&lt;img src=x onerror=alert(1)&gt;`     (stored)
 *        read  : `<img src=x onerror=alert(1)>`           (rendered)
 *
 * Both shapes are now blocked because text-content output is
 * `escapeText`-escaped before emission. Identical input always
 * produces an output whose serialised form NEVER re-decodes into
 * executable markup, regardless of how many sanitize passes are run.
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize-html";

const EXECUTABLE_MARKUP_RE =
  /<(script|img|svg|iframe|object|embed|link|meta|base|style|form|input|button|video|audio|source|track|details|frame|frameset)\b/i;

function assertNoExecutableMarkup(output: string, label: string): void {
  expect(output, label).not.toMatch(EXECUTABLE_MARKUP_RE);
  // Defence-in-depth: bare `<` outside of an allowed tag should never
  // reach the output unescaped.
  const stripped = output.replace(
    /<\/?(h[1-6]|p|br|hr|ul|ol|li|a|strong|b|em|i|u|s|del|ins|blockquote|pre|code|table|thead|tbody|tfoot|tr|th|td|div|span|figure|figcaption|sup|sub)[\s/>]/gi,
    "",
  );
  expect(stripped, `${label} — bare '<' leaked into output`).not.toMatch(/</);
}

describe("F-XSS-01: entity-decode bypass in text content", () => {
  describe("single-encoded payloads", () => {
    const SINGLE_ENCODED = [
      ["named (lt/gt)", "<p>&lt;img src=x onerror=alert(1)&gt;</p>"],
      ["named uppercase", "<p>&LT;img src=x onerror=alert(2)&GT;</p>"],
      ["decimal entities", "<p>&#60;img src=x onerror=alert(3)&#62;</p>"],
      ["hex entities", "<p>&#x3c;img src=x onerror=alert(4)&#x3e;</p>"],
      ["script via entities", "<p>&lt;script&gt;alert(5)&lt;/script&gt;</p>"],
      ["svg/onload", "<p>&lt;svg onload=alert(6)&gt;</p>"],
      [
        "iframe srcdoc",
        "<p>&lt;iframe srcdoc=&quot;&lt;script&gt;alert(7)&lt;/script&gt;&quot;&gt;</p>",
      ],
    ] as const;

    it.each(SINGLE_ENCODED)("blocks single-encoded %s after one sanitize pass", (label, input) => {
      const out = sanitizeHtml(input);
      assertNoExecutableMarkup(out, `${label} (single-pass)`);
    });

    it.each(SINGLE_ENCODED)(
      "blocks single-encoded %s after two sanitize passes",
      (label, input) => {
        const out = sanitizeHtml(sanitizeHtml(input));
        assertNoExecutableMarkup(out, `${label} (double-pass)`);
      },
    );
  });

  describe("double-encoded payloads (write→render flow)", () => {
    const DOUBLE_ENCODED = [
      ["named lt/gt", "<p>&amp;lt;img src=x onerror=alert(1)&amp;gt;</p>"],
      ["named LT/GT", "<p>&amp;LT;img src=x onerror=alert(2)&amp;GT;</p>"],
      ["decimal", "<p>&amp;#60;img src=x onerror=alert(3)&amp;#62;</p>"],
      ["hex", "<p>&amp;#x3c;img src=x onerror=alert(4)&amp;#x3e;</p>"],
      ["script", "<p>&amp;lt;script&amp;gt;alert(5)&amp;lt;/script&amp;gt;</p>"],
    ] as const;

    it.each(DOUBLE_ENCODED)(
      "blocks double-encoded %s through write+render double sanitize",
      (label, input) => {
        // Simulate the real data flow:
        //   1. POST /api/admin/content     → sanitizeHtml(input)        ← stored
        //   2. SSR via HtmlRenderer        → sanitizeHtmlMemoized(stored)
        const stored = sanitizeHtml(input);
        const rendered = sanitizeHtml(stored);
        assertNoExecutableMarkup(rendered, `${label} (write+render)`);
      },
    );
  });

  describe("output stability under repeated sanitize", () => {
    // After two passes, applying sanitizeHtml again must be a no-op
    // (fixed point). If the function ever re-introduces the decode
    // bypass, a third pass will materialise markup that the second
    // pass did not, and this test will catch the regression.
    const FIXPOINT_INPUTS = [
      "<p>plain text</p>",
      "<p>foo &amp; bar</p>",
      "<p>foo & bar</p>",
      "<p>&lt;not-a-tag&gt; text</p>",
      "<p>&amp;lt;img src=x onerror=alert(1)&amp;gt;</p>",
      '<a href="https://example.com">link</a>',
    ];

    it.each(FIXPOINT_INPUTS)("sanitizeHtml is idempotent on %#-th input", (input) => {
      const once = sanitizeHtml(input);
      const twice = sanitizeHtml(once);
      const thrice = sanitizeHtml(twice);
      expect(twice, "sanitize(sanitize(x)) !== sanitize(x)").toBe(once);
      expect(thrice, "sanitize(sanitize(sanitize(x))) !== sanitize(sanitize(x))").toBe(twice);
    });
  });

  describe("legitimate text is preserved (escaped) not corrupted", () => {
    it("escapes a literal ampersand in text content", () => {
      expect(sanitizeHtml("<p>foo & bar</p>")).toBe("<p>foo &amp; bar</p>");
    });

    it("preserves an already-encoded ampersand stably", () => {
      expect(sanitizeHtml("<p>foo &amp; bar</p>")).toBe("<p>foo &amp; bar</p>");
    });

    it("keeps allowed tag structure", () => {
      const input = "<p>Hello <strong>world</strong></p>";
      expect(sanitizeHtml(input)).toBe(input);
    });

    it("normalises `<` and `>` typed by the user into entities", () => {
      // The user types "5 < 10 and 20 > 7" in a comment body. We must
      // emit it as visible text, never as fragment markup.
      const out = sanitizeHtml("<p>5 < 10 and 20 > 7</p>");
      // The exact serialisation depends on the parser's tokenisation
      // of stray `<`; what matters is the output contains no real
      // tag whose name starts with a digit and no bare `<` followed
      // by an identifier that the browser would re-tokenise.
      expect(out, "stray '<' followed by space should be escaped").toContain("&lt;");
    });
  });
});
