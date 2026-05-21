import { describe, it, expect } from "vitest";
import { buildPasswordResetEmail, pickEmailLocale } from "@/lib/email-templates/password-reset";

describe("pickEmailLocale", () => {
  it("returns 'en' when the language is missing or unknown", () => {
    expect(pickEmailLocale(undefined)).toBe("en");
    expect(pickEmailLocale(null)).toBe("en");
    expect(pickEmailLocale("")).toBe("en");
    expect(pickEmailLocale("en")).toBe("en");
    expect(pickEmailLocale("fr")).toBe("en");
  });

  it("returns 'ar' for any Arabic variant", () => {
    expect(pickEmailLocale("ar")).toBe("ar");
    expect(pickEmailLocale("ar-SA")).toBe("ar");
    expect(pickEmailLocale("AR")).toBe("ar");
  });
});

describe("buildPasswordResetEmail", () => {
  const baseInput = {
    resetUrl: "https://tenant-a.example.com/admin/reset-password?token=abc",
    siteName: "Tenant A",
  };

  it("emits English copy with dir='ltr' for English-language sites", () => {
    const email = buildPasswordResetEmail({
      ...baseInput,
      language: "en",
      direction: "ltr",
    });

    expect(email.locale).toBe("en");
    expect(email.subject).toBe("Password Reset Request");
    expect(email.html).toContain('<html lang="en" dir="ltr">');
    expect(email.html).toContain('dir="ltr"');
    expect(email.html).toContain("Reset your password");
    expect(email.html).toContain(">Reset Password</a>");
    expect(email.text).toContain("You requested a password reset.");
    expect(email.text).toContain(baseInput.resetUrl);
  });

  it("emits Arabic copy with dir='rtl' for Arabic-language sites (G-24)", () => {
    const email = buildPasswordResetEmail({
      ...baseInput,
      language: "ar",
      direction: "rtl",
    });

    expect(email.locale).toBe("ar");
    expect(email.subject).toBe("طلب إعادة تعيين كلمة المرور");
    // RTL markup MUST be present on both the html element and the body so
    // Outlook / Gmail render the email right-to-left.
    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain("إعادة تعيين كلمة المرور");
    expect(email.html).toContain("اضغط على الزر أدناه");
    // English fallback copy must NOT leak into the Arabic email.
    expect(email.html).not.toContain("Reset your password");
    expect(email.html).not.toContain(">Reset Password</a>");
    // Plain-text copy is also Arabic.
    expect(email.text).toContain("لقد طلبتَ إعادة تعيين كلمة المرور");
    expect(email.text).toContain(baseInput.resetUrl);
  });

  it("falls back to English when language is unknown but still honours direction", () => {
    const email = buildPasswordResetEmail({
      ...baseInput,
      language: "fr",
      direction: "ltr",
    });

    expect(email.locale).toBe("en");
    expect(email.html).toContain('<html lang="en" dir="ltr">');
  });

  it("escapes HTML in the site name to prevent injection in the footer", () => {
    const email = buildPasswordResetEmail({
      ...baseInput,
      siteName: "<script>alert(1)</script>",
      language: "en",
      direction: "ltr",
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes the reset URL when rendered as visible text", () => {
    const email = buildPasswordResetEmail({
      ...baseInput,
      resetUrl: 'https://example.com/?x="><img src=x>',
      language: "en",
      direction: "ltr",
    });

    expect(email.html).not.toContain('"><img src=x>');
    expect(email.html).toContain("&quot;&gt;&lt;img src=x&gt;");
  });
});
