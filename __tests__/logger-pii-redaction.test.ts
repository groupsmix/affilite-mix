/**
 * F-OBS-02: Logger PII redaction test.
 *
 * Validates that sensitive fields are redacted from log output.
 */
import { describe, it, expect, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("F-OBS-02: Logger PII redaction", () => {
  it("redacts email fields in log output", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { email: "user@example.com", requestId: "req-123" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("user@example.com");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("req-123");

    consoleSpy.mockRestore();
  });

  it("redacts password fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { password: "secret123", siteId: "site-1" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("secret123");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("site-1");

    consoleSpy.mockRestore();
  });

  it("redacts token fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { token: "jwt-abc-123", status: 200 });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("jwt-abc-123");
    expect(output).toContain("[REDACTED]");

    consoleSpy.mockRestore();
  });

  it("redacts authorization headers", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { authorization: "Bearer xyz", latencyMs: 50 });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("Bearer xyz");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("50");

    consoleSpy.mockRestore();
  });

  it("redacts cookie values", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { cookie: "session=abc123", routeId: "/api/test" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("session=abc123");
    expect(output).toContain("[REDACTED]");

    consoleSpy.mockRestore();
  });

  // A8-01: Newly added PII fields
  it("redacts phone fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { phone: "+1-555-0100", siteId: "site-1" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("+1-555-0100");
    expect(output).toContain("[REDACTED]");
    consoleSpy.mockRestore();
  });

  it("redacts address fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { address: "123 Main St", siteId: "site-1" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("123 Main St");
    expect(output).toContain("[REDACTED]");
    consoleSpy.mockRestore();
  });

  it("redacts date_of_birth fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { date_of_birth: "1990-01-01", siteId: "site-1" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("1990-01-01");
    expect(output).toContain("[REDACTED]");
    consoleSpy.mockRestore();
  });

  it("redacts first_name and last_name fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { first_name: "John", last_name: "Doe" });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("John");
    expect(output).not.toContain("Doe");
    consoleSpy.mockRestore();
  });

  it("does not redact allowed fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", { requestId: "req-abc", siteId: "site-1", latencyMs: 100, status: 200 });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("req-abc");
    expect(output).toContain("site-1");
    expect(output).toContain("100");
    expect(output).toContain("200");

    consoleSpy.mockRestore();
  });
});
