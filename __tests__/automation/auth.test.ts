import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { authenticateAutomationRequest, extractBearerToken } from "@/lib/automation/auth";
import { hashSecretToken } from "@/lib/generate-token";
import type { AutomationTokenRow } from "@/lib/dal/automation-tokens";
import type { AutomationServiceAccountRow } from "@/lib/dal/automation-service-accounts";

const RAW = "atk_testtoken1234567890";

function future(hoursFromNow = 24): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}
function past(): string {
  return new Date(Date.now() - 3_600_000).toISOString();
}

async function baseToken(overrides: Partial<AutomationTokenRow> = {}): Promise<AutomationTokenRow> {
  return {
    id: "tok-1",
    service_account_id: "sa-1",
    token_hash: await hashSecretToken(RAW),
    name: "default",
    expires_at: future(),
    last_used_at: null,
    revoked_at: null,
    created_by: "admin-1",
    created_at: past(),
    ...overrides,
  };
}

function baseAccount(
  overrides: Partial<AutomationServiceAccountRow> = {},
): AutomationServiceAccountRow {
  return {
    id: "sa-1",
    site_id: "site-abc",
    name: "agent",
    status: "active",
    scopes: ["site:read", "content:draft"],
    allowed_ip_ranges: null,
    max_actions_per_run: 25,
    max_actions_per_day: 200,
    created_by: "admin-1",
    created_at: past(),
    updated_at: past(),
    ...overrides,
  };
}

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://x.dev/api/automation/v1/health", { headers });
}

const defaultDeps = {
  getAdminApiTokenByHash: async () => null,
  touchAdminApiToken: async () => undefined,
};

describe("extractBearerToken", () => {
  it("parses a well-formed header and rejects others", () => {
    expect(extractBearerToken(req({ authorization: `Bearer ${RAW}` }))).toBe(RAW);
    expect(extractBearerToken(req({ authorization: `bearer ${RAW}` }))).toBe(RAW);
    expect(extractBearerToken(req())).toBeNull();
    expect(extractBearerToken(req({ authorization: "Basic abc" }))).toBeNull();
  });
});

describe("authenticateAutomationRequest", () => {
  it("authenticates a valid token and derives site from the account", async () => {
    const token = await baseToken();
    const touch = vi.fn().mockResolvedValue(undefined);
    const result = await authenticateAutomationRequest(
      req({ authorization: `Bearer ${RAW}`, "x-site-id": "attacker-site" }),
      {
        getTokenByHash: async () => token,
        getAccountById: async () => baseAccount(),
        touch,
        ...defaultDeps,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Site is derived from the account, NOT the spoofed header.
      expect(result.context.siteId).toBe("site-abc");
      expect(result.context.scopes).toContain("content:draft");
    }
    expect(touch).toHaveBeenCalledWith("tok-1");
  });

  it("fails when the header is missing", async () => {
    const result = await authenticateAutomationRequest(req(), {
      getTokenByHash: async () => null,
      getAccountById: async () => baseAccount(),
      ...defaultDeps,
    });
    expect(result).toMatchObject({ ok: false, code: "AUTOMATION_UNAUTHENTICATED" });
  });

  it("fails on unknown token", async () => {
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => null,
      getAccountById: async () => baseAccount(),
      ...defaultDeps,
    });
    expect(result).toMatchObject({ ok: false, code: "AUTOMATION_TOKEN_INVALID" });
  });

  it("fails on revoked token", async () => {
    const token = await baseToken({ revoked_at: past() });
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => token,
      getAccountById: async () => baseAccount(),
      ...defaultDeps,
    });
    expect(result).toMatchObject({ ok: false, code: "AUTOMATION_TOKEN_REVOKED" });
  });

  it("fails on expired token", async () => {
    const token = await baseToken({ expires_at: past() });
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => token,
      getAccountById: async () => baseAccount(),
      ...defaultDeps,
    });
    expect(result).toMatchObject({ ok: false, code: "AUTOMATION_TOKEN_EXPIRED" });
  });

  it("fails when the account is suspended", async () => {
    const token = await baseToken();
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => token,
      getAccountById: async () => baseAccount({ status: "suspended" }),
      ...defaultDeps,
    });
    expect(result).toMatchObject({ ok: false, code: "AUTOMATION_TOKEN_INVALID" });
  });

  it("does not fail auth when last-used touch throws", async () => {
    const token = await baseToken();
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => token,
      getAccountById: async () => baseAccount(),
      touch: async () => {
        throw new Error("db down");
      },
      ...defaultDeps,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a site-bound admin API token as an automation fallback", async () => {
    const adminToken = {
      id: "adm-tok-1",
      token_hash: await hashSecretToken(RAW),
      site_id: "site-abc",
      name: "admin token",
      expires_at: future(),
      is_active: true,
      last_used_at: null,
      created_by: "admin-1",
      created_at: past(),
      updated_at: past(),
    };
    const touchAdmin = vi.fn().mockResolvedValue(undefined);
    const result = await authenticateAutomationRequest(req({ authorization: `Bearer ${RAW}` }), {
      getTokenByHash: async () => null,
      getAccountById: async () => baseAccount(),
      getAdminApiTokenByHash: async () => adminToken,
      touchAdminApiToken: touchAdmin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.siteId).toBe("site-abc");
      expect(result.context.scopes).toEqual([]);
    }
    expect(touchAdmin).toHaveBeenCalledWith("adm-tok-1");
  });
});
