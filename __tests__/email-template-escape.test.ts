import { describe, it, expect } from "vitest";
import { escapeAttribute, escapeHtml, safeHexColor, safeHref } from "@/lib/email-templates/escape";

describe("email-templates/escape", () => {
  describe("escapeHtml", () => {
    it("escapes the five HTML metacharacters", () => {
      expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;",
      );
    });

    it("returns plain text unchanged", () => {
      expect(escapeHtml("Hello, world!")).toBe("Hello, world!");
    });
  });

  describe("escapeAttribute", () => {
    it("escapes quotes so an attacker cannot break out of href", () => {
      expect(escapeAttribute('https://e.com" onmouseover="alert(1)')).toBe(
        "https://e.com&quot; onmouseover=&quot;alert(1)",
      );
    });
  });

  describe("safeHref", () => {
    it("accepts http and https URLs", () => {
      expect(safeHref("https://example.com/path")).toBe("https://example.com/path");
      expect(safeHref("http://example.com/")).toBe("http://example.com/");
    });

    it("rejects javascript: and data: schemes", () => {
      expect(safeHref("javascript:alert(1)")).toBeNull();
      expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
      expect(safeHref("vbscript:msgbox")).toBeNull();
    });

    it("rejects malformed URLs", () => {
      expect(safeHref("not a url")).toBeNull();
      expect(safeHref("")).toBeNull();
    });

    it("enforces hostname allowlist when provided", () => {
      expect(safeHref("https://example.com/x", ["example.com"])).toBe("https://example.com/x");
      expect(safeHref("https://sub.example.com/x", ["example.com"])).toBe(
        "https://sub.example.com/x",
      );
      // Different host → rejected
      expect(safeHref("https://attacker.com/x", ["example.com"])).toBeNull();
      // Lookalike (suffix without dot) → rejected
      expect(safeHref("https://notexample.com/x", ["example.com"])).toBeNull();
    });
  });

  describe("safeHexColor", () => {
    it("accepts 3/4/6/8-digit hex colours", () => {
      expect(safeHexColor("#abc", "#000")).toBe("#abc");
      expect(safeHexColor("#abcd", "#000")).toBe("#abcd");
      expect(safeHexColor("#aabbcc", "#000")).toBe("#aabbcc");
      expect(safeHexColor("#aabbccdd", "#000")).toBe("#aabbccdd");
    });

    it("rejects expression() and url() injections", () => {
      expect(safeHexColor("expression(alert(1))", "#fb0")).toBe("#fb0");
      expect(safeHexColor("url(javascript:alert(1))", "#fb0")).toBe("#fb0");
      expect(safeHexColor("red; background:url(x)", "#fb0")).toBe("#fb0");
    });

    it("rejects empty/undefined values", () => {
      expect(safeHexColor("", "#fb0")).toBe("#fb0");
      expect(safeHexColor(undefined, "#fb0")).toBe("#fb0");
    });
  });
});
