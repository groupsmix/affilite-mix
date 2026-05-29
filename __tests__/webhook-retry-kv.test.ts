/**
 * C-3 regression: Webhook retry counter must use APP_CACHE_KV, not RATE_LIMIT_KV.
 *
 * The retry counter tracks how many times a webhook has been retried. If it
 * shares the RATE_LIMIT_KV binding, a KV rotation/outage for rate-limiting
 * silently resets retry counters, causing premature DLQ writes.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Webhook retry KV binding (C-3 / #592)", () => {
  const routePath = path.resolve("app/api/membership/webhook/route.ts");
  const source = fs.readFileSync(routePath, "utf8");

  it("does not use RATE_LIMIT_KV for retry tracking", () => {
    expect(source).not.toMatch(/RATE_LIMIT_KV/);
  });

  it("uses getAppCacheKV or APP_CACHE_KV for retry tracking", () => {
    expect(source).toMatch(/getAppCacheKV|APP_CACHE_KV/);
  });

  it("uses a webhook-specific key prefix for retry attempts", () => {
    expect(source).toMatch(/webhook-attempt:/);
  });
});
