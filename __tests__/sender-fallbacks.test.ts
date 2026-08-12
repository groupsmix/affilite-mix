import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const suspiciousLogin = fs.readFileSync(path.join(root, "lib/suspicious-login.ts"), "utf8");
const reportContentLink = fs.readFileSync(
  path.join(root, "app/(public)/components/report-content-link.tsx"),
  "utf8",
);

describe("sender and recipient fallback safety", () => {
  it("does not send suspicious-login alerts without a configured sender", () => {
    expect(suspiciousLogin).toContain("const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;");
    expect(suspiciousLogin).toContain("Suspicious-login alert sender is not configured");
    expect(suspiciousLogin).toContain(
      'captureException(error, { tag: "suspicious-login:sender-not-configured" })',
    );
    expect(suspiciousLogin).toContain("if (!fromEmail)");
    expect(suspiciousLogin).toContain("return;");
    expect(suspiciousLogin).not.toContain("noreply@affilite-mix.com");
  });

  it("does not create a mailto recipient without a tenant abuse address", () => {
    expect(reportContentLink).toContain("if (!abuseEmail) return null;");
    expect(reportContentLink).not.toContain("abuse@affilite-mix.com");
  });
});
