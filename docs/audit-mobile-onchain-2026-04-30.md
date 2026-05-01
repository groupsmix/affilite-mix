# Mobile / On-Chain Security Audit -- Runs 1-10 of 10

**Date (UTC):** 2026-04-30
**Ruleset:** A116-A135 (OWASP MASVS + smart-contract security)
**Repository:** `groupsmix/affilite-mix`
**Commit:** HEAD of `main`

---

## Project Classification

`affilite-mix` is a **Next.js 15 web application** deployed to Cloudflare Workers
(`@opennextjs/cloudflare`) with a Supabase (PostgreSQL + RLS) backend.

**Confirmed by:**

- `package.json` dependencies: `next`, `react`, `react-dom`,
  `@opennextjs/cloudflare`, `@supabase/supabase-js`, `wrangler`.
- No React Native, Capacitor, Cordova, Expo, Flutter, native iOS/Android, or
  smart-contract toolchain present.

**Absent artifacts (mobile):**

- No `ios/`, `android/`, `Podfile`, `*.xcodeproj`, `AndroidManifest.xml`,
  `build.gradle`, `Package.swift`.

**Absent artifacts (on-chain):**

- No `*.sol`, `foundry.toml`, `hardhat.config.*`, `truffle-config.*`,
  `contracts/`, `slither`, `mythril`, `echidna`, `certora`, `forge`.

**Conclusion:** No mobile binary, no native client, no on-chain code. Every
A116-A135 control targets either a mobile binary/runtime or an EVM
smart-contract codebase. Per the skip rule ("If something not matching my
project, skip it"), all items are **N/A** for every run.

---

## Mobile Section (A116-A125)

| ID   | Control                                                        | Verdict | Reason                                                                                            |
| ---- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| A116 | OWASP MASVS L1+L2+R                                            | N/A     | MASVS is the Mobile Application Security Verification Standard. No mobile binary.                 |
| A117 | Cert/pubkey pinning (Frida / objection / mitmproxy)            | N/A     | No mobile client to pin from. TLS to Cloudflare/Supabase is browser-managed.                      |
| A118 | Secure storage (Keychain / Android Keystore / StrongBox / bio) | N/A     | No iOS Keychain, no Android Keystore. Secrets live in CF/Wrangler env + Supabase.                 |
| A119 | Deep / universal / app links + custom URL schemes              | N/A     | No `apple-app-site-association`, no `assetlinks.json`, no `Info.plist` URL types. Web links only. |
| A120 | Reverse binary (strings / class-dump / Hopper / Ghidra)        | N/A     | No `.ipa` / `.apk` / Mach-O / ELF binary to disassemble. JS bundle review = web audit.            |
| A121 | Anti-tamper / anti-debug / root-jailbreak detection            | N/A     | No mobile runtime. Concept does not apply to a server-rendered Next.js app.                       |
| A122 | IPC (app groups, share extensions, intents, content providers) | N/A     | OS-level mobile IPC primitives. None present.                                                     |
| A123 | Mobile permissions (background location, photos, contacts)     | N/A     | No mobile permission manifest. Web app does not declare these.                                    |
| A124 | WebViews (`addJavascriptInterface`, `file://`, mixed content)  | N/A     | No `WKWebView` / `WebView` host. The product is a web page, not embedded in one.                  |
| A125 | SDK supply chain -- Apple Privacy Manifest, GDPR, kid-safe     | N/A     | No App Store SDKs / Apple Privacy Manifest. Web supply-chain review is outside A125 scope.        |

## On-Chain Section (A126-A135)

| ID   | Control                                                      | Verdict | Reason                                                                          |
| ---- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------- |
| A126 | SWC Registry (reentrancy, tx.origin, delegatecall, ...)      | N/A     | No Solidity / Vyper / Move / Cairo source. SWC is EVM-specific.                 |
| A127 | Slither + MythX + Foundry invariants + Echidna + Certora     | N/A     | No contracts to feed any of these tools. Tool list is EVM-only.                 |
| A128 | Upgradeability (Proxy / UUPS / Diamond)                      | N/A     | No proxy pattern, no EIP-1967 storage, no `initialize()` to audit.              |
| A129 | On-chain access control (Ownable / AccessControl / multisig) | N/A     | No on-chain roles. Off-chain RBAC is in `lib/authz.ts` (web concern, not A129). |
| A130 | Economic (flash loans, sandwich, MEV, oracle TWAP)           | N/A     | No AMM, lending, oracle, or governance contracts.                               |
| A131 | DeFi invariants (Echidna / Foundry -- solvency)              | N/A     | No DeFi protocol present.                                                       |
| A132 | Off-chain (HSM/MPC signer custody, bridge, indexer)          | N/A     | No on-chain signer, no bridge, no indexer.                                      |
| A133 | Deployment (deterministic build, EIP-1967, ownership xfer)   | N/A     | No contract deployment artifacts. App deploy = `wrangler deploy` (web concern). |
| A134 | User UX (tx simulation, EIP-712, blind signing)              | N/A     | No wallet flow, no `eth_sign` / `personal_sign` / `signTypedData`.              |
| A135 | Compliance (OFAC, Travel Rule, MiCA, Howey)                  | N/A     | No VASP function, no token issuance, no on-chain value transfer.                |

---

## Pass / Fail Summary (All 10 Runs)

| Metric                 | Value                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| Items checked per run  | 20                                                                    |
| PASS                   | 0                                                                     |
| FAIL                   | 0                                                                     |
| N/A (skipped per rule) | 20                                                                    |
| Total runs             | 10                                                                    |
| Evidence collected     | None -- toolchains (Frida, class-dump, Slither, Echidna) do not apply |

All 10 runs produce an identical N/A result by construction because the
ruleset is mobile + on-chain only and the project is a server-rendered web app.

---

## Recommendation

If a web-application-equivalent security audit is desired, the appropriate
rulesets would cover:

- OWASP ASVS / OWASP Top 10
- Next.js middleware hardening
- Supabase RLS policy verification
- CSP / CORS / CSRF protections
- Rate limiting and abuse prevention
- Supply-chain (npm) auditing
- Secrets management and rotation

These concerns are partially addressed by the existing
[technical audit](./technical-audit-2026-04-30.md) and related documentation.
