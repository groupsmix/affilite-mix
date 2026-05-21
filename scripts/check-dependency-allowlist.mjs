#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const allowlistPath = path.join(root, ".github", "dependency-allowlist.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`::error::Failed to read JSON from ${file}: ${error.message}`);
    process.exit(1);
  }
}

const pkg = readJson(packagePath);
const allowlist = readJson(allowlistPath);

const current = {
  dependencies: Object.keys(pkg.dependencies ?? {}).sort(),
  devDependencies: Object.keys(pkg.devDependencies ?? {}).sort(),
};

const allowed = {
  dependencies: [...(allowlist.dependencies ?? [])].sort(),
  devDependencies: [...(allowlist.devDependencies ?? [])].sort(),
};

function diff(actual, expected) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    added: actual.filter((name) => !expectedSet.has(name)),
    stale: expected.filter((name) => !actualSet.has(name)),
  };
}

const depDiff = diff(current.dependencies, allowed.dependencies);
const devDepDiff = diff(current.devDependencies, allowed.devDependencies);
const hasDiff =
  depDiff.added.length > 0 ||
  depDiff.stale.length > 0 ||
  devDepDiff.added.length > 0 ||
  devDepDiff.stale.length > 0;

if (hasDiff) {
  console.error("::error::Top-level dependency allow-list drift detected.");
  console.error(
    "::error::New top-level packages require security/CODEOWNER review to reduce hallucinated-package and typo-squat risk.",
  );
  console.error(
    JSON.stringify(
      {
        dependencies: depDiff,
        devDependencies: devDepDiff,
        remediation:
          "Review the package source/maintainer and update .github/dependency-allowlist.json in the same PR if approved.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log("Dependency allow-list verified.");
