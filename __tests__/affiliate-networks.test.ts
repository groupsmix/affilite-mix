import { describe, expect, it } from "vitest";
import {
  getNetworkFromUrl,
  getSubIdParamForNetwork,
  NETWORK_CONFIGS,
} from "@/lib/affiliate/networks";
import {
  __resetAllowedDomainsCacheForTests,
  validateAffiliateDomain,
} from "@/lib/affiliate-domain-allowlist";

describe("Sovrn affiliate network", () => {
  it("classifies Sovrn shortlinks without inventing tracking parameters", () => {
    expect(getNetworkFromUrl("https://sovrn.co/1m9tdvu")).toBe("sovrn");
    expect(getSubIdParamForNetwork("sovrn")).toBeNull();
  });

  it("keeps every catalog network domain accepted by the strict redirect allowlist", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    __resetAllowedDomainsCacheForTests();

    for (const config of Object.values(NETWORK_CONFIGS)) {
      for (const domain of config.domains ?? []) {
        const result = validateAffiliateDomain(`https://${domain}/drift-test`);
        expect(result.allowed, `${config.network} domain ${domain}`).toBe(true);
      }
    }
  });
});
