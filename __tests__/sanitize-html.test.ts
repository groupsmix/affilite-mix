import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize-html";

describe("sanitizeHtml", () => {
  it("returns empty/falsy input unchanged", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("keeps allowed tags", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("strips disallowed tags", () => {
    const input = "<script>alert('xss')</script><p>safe</p>";
    expect(sanitizeHtml(input)).toBe("alert('xss')<p>safe</p>");
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
});
