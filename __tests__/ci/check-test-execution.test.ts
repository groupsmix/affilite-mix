import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  parseVitestReport,
  parsePlaywrightReport,
  evaluateGate,
  parseArgs,
  parseAllowSkipFile,
} from "../../scripts/ci/check-test-execution.mjs";

function vitestReport(assertions: { file?: string; fullName: string; status: string }[]) {
  const byFile = new Map<string, { fullName: string; status: string }[]>();
  for (const a of assertions) {
    const f = a.file ?? "suite.test.ts";
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)!.push({ fullName: a.fullName, status: a.status });
  }
  return {
    testResults: [...byFile.entries()].map(([name, arr]) => ({
      name,
      assertionResults: arr.map((a) => ({
        fullName: a.fullName,
        title: a.fullName,
        status: a.status,
      })),
    })),
  };
}

function playwrightReport(specs: { title: string; status: string; skipReason?: string }[]) {
  return {
    stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [
      {
        specs: specs.map((s) => ({
          title: s.title,
          file: "e2e/example.spec.ts",
          tests: [
            {
              status: s.status,
              annotations: s.skipReason ? [{ type: "skip", description: s.skipReason }] : [],
              results: [],
            },
          ],
        })),
        suites: [],
      },
    ],
  };
}

describe("parseVitestReport", () => {
  it("flattens assertionResults across files", () => {
    const tests = parseVitestReport(
      vitestReport([
        { file: "a.test.ts", fullName: "a passes", status: "passed" },
        { file: "a.test.ts", fullName: "a skips", status: "skipped" },
        { file: "b.test.ts", fullName: "b fails", status: "failed" },
      ]),
    );
    expect(tests).toHaveLength(3);
    expect(tests[0]).toMatchObject({
      file: "a.test.ts",
      name: "a passes",
      status: "passed",
    });
  });

  it("throws on a non-object report", () => {
    expect(() => parseVitestReport(null)).toThrow();
  });
});

describe("parsePlaywrightReport", () => {
  it("normalises expected/unexpected/skipped statuses and captures skip reasons", () => {
    const tests = parsePlaywrightReport(
      playwrightReport([
        { title: "loads home", status: "expected" },
        { title: "broken", status: "unexpected" },
        { title: "needs auth", status: "skipped", skipReason: "admin auth not provisioned" },
      ]),
    );
    expect(tests.map((t) => t.status)).toEqual(["passed", "failed", "skipped"]);
    expect(tests[2]?.skipReason).toBe("admin auth not provisioned");
  });

  it("recurses into nested suites", () => {
    const report = {
      suites: [
        {
          specs: [],
          suites: [
            {
              specs: [{ title: "deep", tests: [{ status: "expected", annotations: [] }] }],
              suites: [],
            },
          ],
        },
      ],
    };
    const tests = parsePlaywrightReport(report);
    expect(tests).toHaveLength(1);
    expect(tests[0]?.name).toBe("deep");
  });
});

describe("evaluateGate", () => {
  const tests = parseVitestReport(
    vitestReport([
      { file: "rls.integration.test.ts", fullName: "rls denies anon", status: "passed" },
      { file: "flow.test.ts", fullName: "flow works", status: "passed" },
      { file: "flow.test.ts", fullName: "needs backend", status: "skipped" },
    ]),
  );

  it("passes when the contract is satisfied", () => {
    const r = evaluateGate(tests, { minExecuted: 2, requiredSuites: ["rls.integration"] });
    expect(r.ok).toBe(true);
    expect(r.executed).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it("fails when too few tests executed", () => {
    const r = evaluateGate(tests, { minExecuted: 3 });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/Only 2 test\(s\) executed/);
  });

  it("fails when a required suite did not execute", () => {
    const r = evaluateGate(tests, { requiredSuites: ["newsletter-flow"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/Required suite "newsletter-flow"/);
  });

  it("fails a required suite that is present but entirely skipped", () => {
    const skippedOnly = parseVitestReport(
      vitestReport([{ file: "rls.integration.test.ts", fullName: "rls x", status: "skipped" }]),
    );
    const r = evaluateGate(skippedOnly, { requiredSuites: ["rls.integration"] });
    expect(r.ok).toBe(false);
  });

  it("enforces max-skips", () => {
    const r = evaluateGate(tests, { maxSkips: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/1 test\(s\) skipped/);
  });

  it("flags skips not covered by the allow-list", () => {
    const r = evaluateGate(tests, { allowSkipPatterns: [/no such reason/] });
    expect(r.ok).toBe(false);
    expect(r.unexpectedSkips).toHaveLength(1);
    expect(r.unexpectedSkips[0]?.name).toBe("needs backend");
  });

  it("accepts skips covered by the allow-list", () => {
    const r = evaluateGate(tests, { allowSkipPatterns: [/needs backend/] });
    expect(r.ok).toBe(true);
    expect(r.unexpectedSkips).toHaveLength(0);
  });

  it("matches Playwright skip reasons against the allow-list", () => {
    const pw = parsePlaywrightReport(
      playwrightReport([
        { title: "home", status: "expected" },
        {
          title: "admin edit",
          status: "skipped",
          skipReason: "admin auth not provisioned — login page detected",
        },
      ]),
    );
    expect(evaluateGate(pw, { allowSkipPatterns: [/admin auth not provisioned/] }).ok).toBe(true);
    expect(evaluateGate(pw, { allowSkipPatterns: [/unrelated/] }).ok).toBe(false);
  });
});

describe("parseArgs", () => {
  it("collects repeatable and scalar flags", () => {
    const args = parseArgs([
      "--vitest",
      "r.json",
      "--min-executed",
      "40",
      "--require-suite",
      "rls",
      "--require-suite",
      "flow",
      "--allow-skip",
      "reason",
    ]);
    expect(args.vitest).toBe("r.json");
    expect(args.minExecuted).toBe(40);
    expect(args.requireSuite).toEqual(["rls", "flow"]);
    expect(args.allowSkip).toEqual(["reason"]);
  });

  it("throws on unknown flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("parseAllowSkipFile", () => {
  it("parses a JSON array", () => {
    expect(parseAllowSkipFile('["a", "b"]')).toEqual(["a", "b"]);
  });

  it("parses newline-delimited patterns and ignores comments/blanks", () => {
    expect(parseAllowSkipFile("# comment\nalpha\n\n  beta  \n")).toEqual(["alpha", "beta"]);
  });
});

describe("shipped e2e allow-skip config", () => {
  const files = [
    "scripts/ci/e2e-allowed-skips.json",
    "scripts/ci/e2e-allowed-skips-unauthenticated.json",
  ];

  it("are valid JSON arrays of compilable regexes", () => {
    for (const f of files) {
      const patterns = parseAllowSkipFile(
        readFileSync(path.resolve(__dirname, "../../", f), "utf8"),
      );
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) expect(() => new RegExp(p)).not.toThrow();
    }
  });

  it("cover every current static e2e test.skip reason (skip-honesty allow-list stays complete)", () => {
    const patterns = files
      .flatMap((f) =>
        parseAllowSkipFile(readFileSync(path.resolve(__dirname, "../../", f), "utf8")),
      )
      .map((p) => new RegExp(p));

    // Extract the literal reason strings passed to `.skip(true, "...")` across
    // the e2e specs. Any NEW static skip reason that is not covered by the
    // allow-list must be added deliberately, which keeps the CI skip-honesty
    // gate meaningful. Template-literal reasons (containing `${...}`) are
    // dynamic and covered by broader runtime patterns, so they are excluded
    // from this static completeness check.
    const e2eDir = path.resolve(__dirname, "../../e2e");
    const reasons: string[] = [];
    const reasonRe = /\.skip\(\s*true\s*,\s*"([^"]*)"/g;
    for (const file of readdirSync(e2eDir).filter((n) => n.endsWith(".spec.ts"))) {
      const src = readFileSync(path.join(e2eDir, file), "utf8");
      for (const m of src.matchAll(reasonRe)) reasons.push(m[1] ?? "");
    }

    expect(reasons.length).toBeGreaterThan(0);
    const uncovered = reasons.filter((r) => !patterns.some((re) => re.test(r)));
    expect(uncovered).toEqual([]);
  });
});
