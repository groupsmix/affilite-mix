import { describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import { validateExternalUrl } from "../lib/ssrf-guard";

describe("SSRF Guard", () => {
  it("allows valid external HTTPS URLs", async () => {
    expect((await validateExternalUrl("https://example.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://google.com")).valid).toBe(true);
    expect((await validateExternalUrl("https://8.8.8.8")).valid).toBe(true);
  });

  it("blocks domains that resolve to private IPs (DNS rebinding protection)", async () => {
    // We can't guarantee an external DNS will resolve to 10.x.x.x without mocking,
    // but we can test a known public service that resolves to localhost:
    // "localhost.direct" resolves to 127.0.0.1
    const result = await validateExternalUrl("https://localhost.direct");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Resolved IP range|is blocked/);
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

  // F-12: Adversarial SSRF payload corpus
  describe("adversarial SSRF payloads", () => {
    it("blocks decimal IP representations of 127.0.0.1", async () => {
      // 127.0.0.1 = 2130706433 decimal
      expect((await validateExternalUrl("https://2130706433")).valid).toBe(false);
    });

    it("blocks octal IP representations of 127.0.0.1", async () => {
      expect((await validateExternalUrl("https://0177.0.0.1")).valid).toBe(false);
    });

    it("blocks IPv6 link-local addresses", async () => {
      expect((await validateExternalUrl("https://[fe80::1]")).valid).toBe(false);
    });

    it("blocks IPv6 unique local addresses (fd00::/8)", async () => {
      expect((await validateExternalUrl("https://[fd12:3456:789a::1]")).valid).toBe(false);
    });

    it("blocks IPv6 loopback variations", async () => {
      expect((await validateExternalUrl("https://[0:0:0:0:0:0:0:1]")).valid).toBe(false);
      expect((await validateExternalUrl("https://[::0:1]")).valid).toBe(false);
    });

    it("blocks AWS SSM endpoint (169.254.169.254 via DNS)", async () => {
      // Some AWS regions expose SSM via an alternate domain
      expect((await validateExternalUrl("https://169.254.170.2")).valid).toBe(false);
    });

    it("blocks URL-encoded private IP paths", async () => {
      // The URL parser normalizes these; the hostname should still be caught
      expect((await validateExternalUrl("https://%31%32%37%2e%30%2e%30%2e%31")).valid).toBe(false);
    });

    it("blocks DNS rebinding-friendly TLDs", async () => {
      expect((await validateExternalUrl("https://evil.arpa")).valid).toBe(false);
      expect((await validateExternalUrl("https://evil.local")).valid).toBe(false);
      expect((await validateExternalUrl("https://evil.test")).valid).toBe(false);
      expect((await validateExternalUrl("https://evil.invalid")).valid).toBe(false);
      expect((await validateExternalUrl("https://evil.onion")).valid).toBe(false);
    });

    it("blocks internal hostname suffix", async () => {
      expect((await validateExternalUrl("https://evil.internal")).valid).toBe(false);
    });

    it("blocks alternate wildcard DNS services", async () => {
      expect((await validateExternalUrl("https://127.0.0.1.xip.io")).valid).toBe(false);
      expect((await validateExternalUrl("https://app.vcap.me")).valid).toBe(false);
    });

    it("blocks 0.0.0.0 variants", async () => {
      expect((await validateExternalUrl("https://0.0.0.0")).valid).toBe(false);
      expect((await validateExternalUrl("https://[::]")).valid).toBe(false);
    });

    it("blocks carrier-grade NAT range (100.64.0.0/10)", async () => {
      expect((await validateExternalUrl("https://100.64.0.1")).valid).toBe(false);
    });

    it("blocks protocol-relative URLs that parse as invalid", async () => {
      // These should fail URL parsing, not pass validation
      expect((await validateExternalUrl("//127.0.0.1")).valid).toBe(false);
    });

    it("blocks URLs with authentication that embed private IPs", async () => {
      expect((await validateExternalUrl("https://user:pass@127.0.0.1")).valid).toBe(false);
      expect((await validateExternalUrl("https://user:pass@10.0.0.1")).valid).toBe(false);
    });

    it("blocks URLs with ports on private IPs", async () => {
      expect((await validateExternalUrl("https://127.0.0.1:443")).valid).toBe(false);
      expect((await validateExternalUrl("https://192.168.1.1:8443")).valid).toBe(false);
    });
  });

  // C8-03: T1-01 regression — hostname resolving to private IPv6
  describe("IPv6 resolve guard (T1-01)", () => {
    it("blocks hostname resolving to ULA IPv6 (fd00::1)", async () => {
      const lookupSpy = vi.spyOn(dns, "lookup").mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void;
        cb(null, "fd00::1", 6);
      });
      try {
        const result = await validateExternalUrl("https://evil-ipv6.example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/private|link-local|blocked/i);
      } finally {
        lookupSpy.mockRestore();
      }
    });

    it("blocks hostname resolving to link-local IPv6 (fe80::1)", async () => {
      const lookupSpy = vi.spyOn(dns, "lookup").mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void;
        cb(null, "fe80::1", 6);
      });
      try {
        const result = await validateExternalUrl("https://evil-linklocal.example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/private|link-local|blocked/i);
      } finally {
        lookupSpy.mockRestore();
      }
    });

    it("blocks hostname resolving to IPv6-mapped private IPv4 (::ffff:10.0.0.1)", async () => {
      const lookupSpy = vi.spyOn(dns, "lookup").mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void;
        cb(null, "::ffff:10.0.0.1", 6);
      });
      try {
        const result = await validateExternalUrl("https://evil-mapped.example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/blocked|mapped/i);
      } finally {
        lookupSpy.mockRestore();
      }
    });
  });
});
