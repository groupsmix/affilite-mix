import { describe, it, expect } from "vitest";
import { safeJsonLdString } from "@/lib/safe-json-ld";

describe("safeJsonLdString", () => {
  it("produces valid JSON round-trippable output", () => {
    const input = { title: "Hello", count: 3, nested: { ok: true } };
    expect(JSON.parse(safeJsonLdString(input))).toEqual(input);
  });

  it("escapes </script> so the script element cannot be terminated early", () => {
    const payload = { title: "pwn</script><script>alert(1)</script>" };
    const output = safeJsonLdString(payload);
    expect(output).not.toContain("</script>");
    // Round-trip still preserves the original text
    expect(JSON.parse(output)).toEqual(payload);
  });

  it("escapes HTML comment sequences (<!-- and -->)", () => {
    const payload = { x: "<!--evil-->" };
    const output = safeJsonLdString(payload);
    expect(output).not.toContain("<!--");
    expect(output).not.toContain("-->");
  });

  it("escapes U+2028 and U+2029 line separators", () => {
    const payload = { x: "a\u2028b\u2029c" };
    const output = safeJsonLdString(payload);
    // Raw characters must not survive — they break inline <script> text
    expect(output).not.toContain("\u2028");
    expect(output).not.toContain("\u2029");
    expect(output).toContain("\\u2028");
    expect(output).toContain("\\u2029");
  });

  it("escapes ampersand so entity references cannot be injected", () => {
    const payload = { x: "a&b" };
    expect(safeJsonLdString(payload)).toContain("\\u0026");
  });
});
