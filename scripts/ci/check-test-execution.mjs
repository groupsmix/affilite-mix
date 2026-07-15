#!/usr/bin/env node
/**
 * Test-execution gate (audit P1-2 / P0-1).
 *
 * A required CI job that reports "success" is not, on its own, evidence that
 * meaningful tests actually ran. A suite can be green while every test is
 * skipped (missing backend, dynamic `test.skip`, a stray `describe.skipIf`).
 * This script reads a machine-readable test report and fails when execution
 * quality is below an explicit contract:
 *
 *   --min-executed <N>     Fail if fewer than N tests executed (passed+failed).
 *   --max-skips <N>        Fail if more than N tests were skipped.
 *   --require-suite <sub>  Fail unless at least one EXECUTED test belongs to a
 *                          file/name containing <sub> (repeatable).
 *   --allow-skip <regex>   When set, every skipped test must match at least one
 *                          allow pattern; any other skip is an "unexpected
 *                          skip" and fails the gate (repeatable). Vitest reports
 *                          have no skip reason, so the test's full name is
 *                          matched; Playwright reports match the skip
 *                          annotation description (falling back to the title).
 *   --allow-skip-file <p>  Load newline/JSON-array separated allow patterns
 *                          from a file (repeatable, merged with --allow-skip).
 *
 * Input (exactly one):
 *   --vitest <file>        Vitest JSON reporter output.
 *   --playwright <file>    Playwright JSON reporter output.
 *
 * The script is intentionally dependency-free so it runs in any CI step
 * without an install, and its pure helpers are unit-tested in
 * __tests__/ci/check-test-execution.test.ts.
 */
import { readFileSync, appendFileSync } from "node:fs";

/**
 * Normalise a Vitest (Jest-compatible) JSON report into a flat list of tests.
 * @param {unknown} report
 */
export function parseVitestReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("Vitest report is not an object");
  }
  const r = /** @type {Record<string, any>} */ (report);
  const testResults = Array.isArray(r.testResults) ? r.testResults : [];
  /** @type {{ file: string; name: string; status: string; skipReason: string }[]} */
  const tests = [];
  for (const file of testResults) {
    const filePath = typeof file?.name === "string" ? file.name : "";
    const assertions = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
    for (const a of assertions) {
      const name = typeof a?.fullName === "string" && a.fullName ? a.fullName : (a?.title ?? "");
      tests.push({
        file: filePath,
        name,
        status: String(a?.status ?? "unknown"),
        // Vitest carries no skip reason; the full test name is the best signal.
        skipReason: name,
      });
    }
  }
  return tests;
}

/**
 * Recursively collect Playwright specs from the nested suite tree.
 * @param {any} suite
 * @param {any[]} acc
 */
function collectPlaywrightSpecs(suite, acc) {
  if (!suite) return acc;
  for (const child of suite.suites ?? []) collectPlaywrightSpecs(child, acc);
  for (const spec of suite.specs ?? []) acc.push(spec);
  return acc;
}

/**
 * Normalise a Playwright JSON report into a flat list of tests.
 * @param {unknown} report
 */
export function parsePlaywrightReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("Playwright report is not an object");
  }
  const r = /** @type {Record<string, any>} */ (report);
  const specs = (Array.isArray(r.suites) ? r.suites : []).flatMap((s) =>
    collectPlaywrightSpecs(s, []),
  );
  /** @type {{ file: string; name: string; status: string; skipReason: string }[]} */
  const tests = [];
  for (const spec of specs) {
    const title = typeof spec?.title === "string" ? spec.title : "";
    for (const t of spec?.tests ?? []) {
      // Playwright statuses: "expected" | "unexpected" | "skipped" | "flaky".
      const raw = String(t?.status ?? "unknown");
      const status = raw === "expected" ? "passed" : raw === "unexpected" ? "failed" : raw;
      const skipAnnotation = (t?.annotations ?? []).find(
        (an) => typeof an?.type === "string" && an.type.includes("skip"),
      );
      const skipReason =
        skipAnnotation && typeof skipAnnotation.description === "string"
          ? skipAnnotation.description
          : title;
      tests.push({
        file: typeof spec?.file === "string" ? spec.file : "",
        name: title,
        status,
        skipReason,
      });
    }
  }
  return tests;
}

/**
 * Evaluate the execution contract against a flat list of tests.
 * @param {{ file: string; name: string; status: string; skipReason: string }[]} tests
 * @param {{
 *   minExecuted?: number,
 *   maxSkips?: number | null,
 *   requiredSuites?: string[],
 *   allowSkipPatterns?: RegExp[],
 * }} opts
 */
export function evaluateGate(tests, opts = {}) {
  const { minExecuted = 0, maxSkips = null, requiredSuites = [], allowSkipPatterns = [] } = opts;
  const executed = tests.filter((t) => t.status === "passed" || t.status === "failed");
  const skipped = tests.filter((t) => t.status === "skipped" || t.status === "pending");
  const errors = [];

  if (executed.length < minExecuted) {
    errors.push(
      `Only ${executed.length} test(s) executed; required minimum is ${minExecuted}. A green job with too few executed tests is not trustworthy evidence.`,
    );
  }

  if (typeof maxSkips === "number" && skipped.length > maxSkips) {
    errors.push(`${skipped.length} test(s) skipped; the maximum allowed is ${maxSkips}.`);
  }

  for (const sub of requiredSuites) {
    const ran = executed.some((t) => t.file.includes(sub) || t.name.includes(sub));
    if (!ran) {
      errors.push(
        `Required suite "${sub}" did not execute any tests (absent or entirely skipped). This suite must run substantively.`,
      );
    }
  }

  /** @type {{ name: string; reason: string }[]} */
  const unexpectedSkips = [];
  if (allowSkipPatterns.length > 0) {
    for (const t of skipped) {
      const matched = allowSkipPatterns.some((re) => re.test(t.skipReason) || re.test(t.name));
      if (!matched) unexpectedSkips.push({ name: t.name, reason: t.skipReason });
    }
    if (unexpectedSkips.length > 0) {
      errors.push(
        `${unexpectedSkips.length} unexpected skip(s) not covered by the allow-list:\n` +
          unexpectedSkips.map((s) => `    - ${s.name} :: ${s.reason}`).join("\n"),
      );
    }
  }

  return {
    ok: errors.length === 0,
    executed: executed.length,
    skipped: skipped.length,
    total: tests.length,
    unexpectedSkips,
    errors,
  };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const out = { requireSuite: [], allowSkip: [], allowSkipFile: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--vitest":
        out.vitest = next();
        break;
      case "--playwright":
        out.playwright = next();
        break;
      case "--min-executed":
        out.minExecuted = Number(next());
        break;
      case "--max-skips":
        out.maxSkips = Number(next());
        break;
      case "--require-suite":
        out.requireSuite.push(next());
        break;
      case "--allow-skip":
        out.allowSkip.push(next());
        break;
      case "--allow-skip-file":
        out.allowSkipFile.push(next());
        break;
      case "--label":
        out.label = next();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

/** @param {string} raw */
export function parseAllowSkipFile(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error("allow-skip file JSON must be an array");
    return arr.map(String);
  }
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (Boolean(args.vitest) === Boolean(args.playwright)) {
    console.error("Provide exactly one of --vitest <file> or --playwright <file>.");
    process.exit(2);
  }

  const file = args.vitest ?? args.playwright;
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`::error::Could not read/parse test report at "${file}": ${err.message}`);
    console.error(
      "::error::A missing report means the test step did not produce machine-readable output — treating as a gate failure.",
    );
    process.exit(1);
  }

  const tests = args.vitest ? parseVitestReport(report) : parsePlaywrightReport(report);

  const patternStrings = [...args.allowSkip];
  for (const f of args.allowSkipFile) {
    patternStrings.push(...parseAllowSkipFile(readFileSync(f, "utf8")));
  }
  const allowSkipPatterns = patternStrings.map((s) => new RegExp(s));

  const result = evaluateGate(tests, {
    minExecuted: Number.isFinite(args.minExecuted) ? args.minExecuted : 0,
    maxSkips: Number.isFinite(args.maxSkips) ? args.maxSkips : null,
    requiredSuites: args.requireSuite,
    allowSkipPatterns,
  });

  const summary =
    `Test-execution gate (${args.vitest ? "vitest" : "playwright"}): ` +
    `executed=${result.executed} skipped=${result.skipped} total=${result.total}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### ${summary}`];
    if (!result.ok) lines.push("", "**Gate failures:**", ...result.errors.map((e) => `- ${e}`));
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }

  if (!result.ok) {
    for (const e of result.errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log("Test-execution gate passed.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
