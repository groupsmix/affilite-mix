import { describe, expect, it } from "vitest";
import { validateExternalUrl } from "../lib/ssrf-guard";

describe("SSRF Guard", () => {
  it("allows valid external HTTPS URLs", async () => {
    expect((await validateExternalUrl("https://example.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://google.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://8.8.8.8")).valid).toBe(true);
  });

  it("blocks non-HTTPS protocols by default", async () => {
    expect((await validateExternalUrl("http://example.com")).valid).toBe(false);
    expect((await validateExternalUrl("ftp://example.com")).valid).toBe(false);
    expect((await validateExternalUrl("file:///etc/passwd")).valid).toBe(false);
  });

  it("allows HTTP if allowPrivateIPs is true", async () => {
    expect((await validateExternalUrl("http://example.com", true)).valid).toBe(true);
  });

  it("blocks localhost and 127.0.0.1", async () => {
    expect((await validateExternalUrl("https://localhost")).valid).toBe(false);
    expect((await validateExternalUrl("https://127.0.0.1")).valid).toBe(false);
    expect((await validateExternalUrl("https://0.0.0.0")).valid).toBe(false);
    expect((await validateExternalUrl("https://[::1]")).valid).toBe(false);
  });

  it("blocks cloud metadata endpoints", async () => {
    expect((await validateExternalUrl("https://169.254.169.254")).valid).toBe(false);
    expect((await validateExternalUrl("https://metadata.google.internal")).valid).toBe(false);
    expect((await validateExternalUrl("https://100.100.100.100")).valid).toBe(false);
  });

  it("blocks wildcard DNS services", async () => {
    expect((await validateExternalUrl("https://127.0.0.1.nip.io")).valid).toBe(false);
    expect((await validateExternalUrl("https://169.254.169.254.sslip.io")).valid).toBe(false);
    expect((await validateExternalUrl("https://app.localtest.me")).valid).toBe(false);
  });

  it("blocks IPv4 addresses in private CIDR ranges", async () => {
    expect((await validateExternalUrl("https://10.0.0.1")).valid).toBe(false); // 10.0.0.0/8
    expect((await validateExternalUrl("https://172.16.0.1")).valid).toBe(false); // 172.16.0.0/12
    expect((await validateExternalUrl("https://192.168.1.1")).valid).toBe(false); // 192.168.0.0/16
  });

  it("blocks IPv6-mapped IPv4 addresses", async () => {
    // ::ffff:127.0.0.1
    expect((await validateExternalUrl("https://[::ffff:127.0.0.1]")).valid).toBe(false);
    // ::ffff:7f00:1 (127.0.0.1)
    expect((await validateExternalUrl("https://[::ffff:7f00:1]")).valid).toBe(false);
    // ::ffff:a9fe:a9fe (169.254.169.254)
    expect((await validateExternalUrl("https://[::ffff:a9fe:a9fe]")).valid).toBe(false);
  });

  it("handles invalid URLs gracefully", async () => {
    expect((await validateExternalUrl("not-a-url")).valid).toBe(false);
  });
});
