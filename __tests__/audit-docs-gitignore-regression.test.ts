/**
 * Finding #18 regression guard: internal audit, security, red-team, and
 * compliance report artifacts must stay out of the public working tree.
 *
 * This complements .gitignore. It cannot prove that historical blobs were
 * purged from every remote ref; that remains a repo-admin history-rewrite task.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function rootEntries(): string[] {
  return fs.readdirSync(REPO_ROOT);
}

function docsEntries(): string[] {
  return fs.existsSync(DOCS_ROOT) ? fs.readdirSync(DOCS_ROOT) : [];
}

describe("#18 public repo audit-document guard", () => {
  it("blocks the private audit-report tree in .gitignore", () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
    for (const pattern of [
      "docs/audits/",
      "docs/END-TO-END-AUDIT.md",
      "docs/*-audit-*.md",
      "docs/audit-*.md",
      "docs/cloudflare-audit-remediation.md",
      "docs/deep-audit-followup.md",
      "docs/supabase-audit-followup.md",
      "docs/technical-audit-*.md",
      "docs/orphan-records-cascade-audit.md",
      "/audit-A*.md",
      "/audit-run-*.md",
      "/audit-gaps-report.md",
      "/affilite-mix-redteam-audit.md",
      "/affilite-mix-compliance-report.md",
    ]) {
      expect(gitignore, `missing .gitignore pattern: ${pattern}`).toContain(pattern);
    }
  });

  it("keeps only explicitly public operational audit docs allowlisted", () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
    for (const allowed of [
      "!docs/audit-log-review-runbook.md",
      "!docs/pr-audit-requirements.md",
      "!docs/api-route-audit.md",
      "!docs/npm-audit-report.txt",
      "!docs/compliance-readiness.md",
      "!docs/compliance-evidence.md",
      "!docs/evidence/dependency-audit.md",
    ]) {
      expect(gitignore, `missing public-doc allowlist entry: ${allowed}`).toContain(allowed);
    }
  });

  it("does not contain the private docs/audits tree", () => {
    expect(exists("docs/audits")).toBe(false);
  });

  it("does not contain named internal audit reports at repo root", () => {
    const blocked = rootEntries().filter(
      (entry) =>
        entry === "SECURITY-AUDIT.md" ||
        /^AUDIT_REPORT.*\.md$/.test(entry) ||
        /^audit-A.*\.md$/.test(entry) ||
        /^audit-run-.*\.md$/.test(entry) ||
        entry === "audit-gaps-report.md" ||
        entry === "affilite-mix-redteam-audit.md" ||
        entry === "affilite-mix-compliance-report.md",
    );
    expect(blocked, `blocked root audit artifacts found: ${blocked.join(", ")}`).toHaveLength(0);
  });

  it("does not contain private audit report patterns under docs/", () => {
    const allowedDocs = new Set([
      "audit-log-review-runbook.md",
      "pr-audit-requirements.md",
      "api-route-audit.md",
      "npm-audit-report.txt",
      "compliance-readiness.md",
      "compliance-evidence.md",
    ]);

    const blocked = docsEntries().filter((entry) => {
      if (allowedDocs.has(entry)) return false;
      return (
        entry === "END-TO-END-AUDIT.md" ||
        entry === "cloudflare-audit-remediation.md" ||
        entry === "deep-audit-followup.md" ||
        entry === "supabase-audit-followup.md" ||
        entry === "orphan-records-cascade-audit.md" ||
        /^technical-audit-.+\.md$/.test(entry) ||
        /^audit-.+\.md$/.test(entry) ||
        /-audit-.+\.md$/.test(entry)
      );
    });

    expect(blocked, `blocked docs audit artifacts found: ${blocked.join(", ")}`).toHaveLength(0);
  });

  it("does not link README readers to private audit-report paths", () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    expect(readme).toContain("private audit repository");
    expect(readme).not.toContain("docs/audits/audit-unfixed-items.md");
    expect(readme).not.toContain("docs/audits/audit5-tech-debt-followups.md");
  });
});
