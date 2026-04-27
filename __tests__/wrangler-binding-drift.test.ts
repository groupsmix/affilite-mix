/**
 * FIX-32 (F-032): Wrangler binding drift detection test.
 *
 * This test verifies that the bindings declared in wrangler.jsonc
 * match the bindings read at runtime. It prevents drift between
 * infrastructure-as-code and application code.
 *
 * The test parses wrangler.jsonc (JSON with comments) and extracts
 * the binding names, then compares them against a canonical list
 * defined here.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const WRANGLER_PATH = path.resolve(__dirname, "..", "wrangler.jsonc");

interface WranglerConfig {
  kv_namespaces?: Array<{ binding: string; id: string; preview_id?: string }>;
  durable_objects?: {
    bindings?: Array<{ name: string; class_name: string }>;
  };
  queues?: {
    producers?: Array<{ binding: string; queue: string }>;
  };
  r2_buckets?: Array<{ binding: string; bucket_name: string }>;
  vars?: Record<string, unknown>;
}

function parseWranglerJsonc(): WranglerConfig {
  const raw = fs.readFileSync(WRANGLER_PATH, "utf-8");
  // Strip JSONC comments (simple regex approach — sufficient for our file)
  const withoutComments = raw
    .replace(/\/\/.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // Remove block comments
  return JSON.parse(withoutComments);
}

/** Canonical list of expected bindings (source of truth). */
const EXPECTED_KV_BINDINGS = ["RATE_LIMIT_KV", "APP_CACHE_KV"];

const EXPECTED_DO_BINDINGS = [
  // OpenNext caching layer (declared in wrangler.jsonc, even when tag-based
  // revalidation is not yet enabled — see https://opennext.js.org/cloudflare/caching)
  "NEXT_CACHE_DO_QUEUE",
  "NEXT_TAG_CACHE_DO_SHARDED",
  // F-005: atomic distributed rate limiting
  "RATE_LIMITER_DO",
];

const EXPECTED_QUEUE_BINDINGS = ["CLICK_QUEUE"];

const EXPECTED_R2_BINDINGS = [
  // OpenNext incremental cache bucket. R2_PRIVATE_BUCKET / R2_PUBLIC_BUCKET /
  // R2_LOG_BUCKET are env-var bucket *names* used by lib/r2.ts (S3-compatible
  // access via R2_ACCOUNT_ID + R2_ACCESS_KEY_ID), not Worker bindings.
  "NEXT_INC_CACHE_R2_BUCKET",
];

const EXPECTED_VARS = ["NODE_ENV"];

describe("FIX-32: wrangler binding drift detection", () => {
  const config = parseWranglerJsonc();

  it("has wrangler.jsonc file", () => {
    expect(fs.existsSync(WRANGLER_PATH)).toBe(true);
  });

  describe("KV namespaces", () => {
    const actual = new Set(config.kv_namespaces?.map((k) => k.binding) ?? []);

    for (const expected of EXPECTED_KV_BINDINGS) {
      it(`declares KV binding: ${expected}`, () => {
        expect(actual.has(expected)).toBe(true);
      });
    }

    it("has no unexpected KV bindings", () => {
      const expectedSet = new Set(EXPECTED_KV_BINDINGS);
      for (const actualBinding of actual) {
        expect(
          expectedSet.has(actualBinding),
          `Unexpected KV binding: ${actualBinding}. Update EXPECTED_KV_BINDINGS in this test.`,
        ).toBe(true);
      }
    });
  });

  describe("Durable Objects", () => {
    const actual = new Set(config.durable_objects?.bindings?.map((b) => b.name) ?? []);

    for (const expected of EXPECTED_DO_BINDINGS) {
      it(`declares DO binding: ${expected}`, () => {
        expect(actual.has(expected)).toBe(true);
      });
    }

    it("has no unexpected DO bindings", () => {
      const expectedSet = new Set(EXPECTED_DO_BINDINGS);
      for (const actualBinding of actual) {
        expect(
          expectedSet.has(actualBinding),
          `Unexpected DO binding: ${actualBinding}. Update EXPECTED_DO_BINDINGS in this test.`,
        ).toBe(true);
      }
    });
  });

  describe("Queues", () => {
    const actual = new Set(config.queues?.producers?.map((p) => p.binding) ?? []);

    for (const expected of EXPECTED_QUEUE_BINDINGS) {
      it(`declares Queue binding: ${expected}`, () => {
        expect(actual.has(expected)).toBe(true);
      });
    }

    it("has no unexpected Queue bindings", () => {
      const expectedSet = new Set(EXPECTED_QUEUE_BINDINGS);
      for (const actualBinding of actual) {
        expect(
          expectedSet.has(actualBinding),
          `Unexpected Queue binding: ${actualBinding}. Update EXPECTED_QUEUE_BINDINGS in this test.`,
        ).toBe(true);
      }
    });
  });

  describe("R2 Buckets", () => {
    const actual = new Set(config.r2_buckets?.map((b) => b.binding) ?? []);

    for (const expected of EXPECTED_R2_BINDINGS) {
      it(`declares R2 binding: ${expected}`, () => {
        expect(actual.has(expected)).toBe(true);
      });
    }

    it("has no unexpected R2 bindings", () => {
      const expectedSet = new Set(EXPECTED_R2_BINDINGS);
      for (const actualBinding of actual) {
        expect(
          expectedSet.has(actualBinding),
          `Unexpected R2 binding: ${actualBinding}. Update EXPECTED_R2_BINDINGS in this test.`,
        ).toBe(true);
      }
    });
  });

  describe("Environment variables", () => {
    const actualVars = new Set(Object.keys(config.vars ?? {}));

    for (const expected of EXPECTED_VARS) {
      it(`declares var: ${expected}`, () => {
        expect(actualVars.has(expected)).toBe(true);
      });
    }
  });
});
