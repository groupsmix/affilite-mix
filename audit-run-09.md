# Mobile/On-Chain Security Audit — Run 9 of 10

**Target:** https://github.com/groupsmix/affilite-mix/
**Run:** 9/10
**Date (UTC):** 2026-04-30
**Ruleset:** A116–A135 (mobile MASVS + smart-contract security)
**Skip rule:** "If something not matching my project, skip it."

---

## Project classification (re-confirmed each run)

`affilite-mix` is a **Next.js 15 web application** deployed to Cloudflare Workers (`@opennextjs/cloudflare`) with a Supabase (PostgreSQL + RLS) backend. Confirmed by:

- `package.json` → `next`, `react`, `react-dom`, `@opennextjs/cloudflare`, `@supabase/supabase-js`, `wrangler`. No React Native, Capacitor, Cordova, Expo, Flutter, native iOS/Android, or smart-contract toolchain.
- No `ios/`, `android/`, `Podfile`, `*.xcodeproj`, `AndroidManifest.xml`, `build.gradle`, `Package.swift`.
- No `*.sol`, `foundry.toml`, `hardhat.config.*`, `truffle-config.*`, `contracts/`, `slither`, `mythril`, `echidna`, `certora`, `forge`.
- `app/` is Next.js App Router; `workers/` is the Cloudflare Worker entry; `supabase/` is SQL migrations.

**Conclusion for this run:** No mobile binary, no native client, no on-chain code. Every A116–A135 control targets either a mobile binary/runtime or an EVM smart-contract codebase. Per the user's skip rule, all items are **N/A** for this run.

---

## Mobile section (A116–A125) — verdicts

| ID   | Control                                              | Verdict | Reason                                                                                |
| ---- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| A116 | OWASP MASVS L1+L2+R                                  | N/A     | MASVS is the *Mobile* Application Security Verification Standard. No mobile binary.   |
| A117 | Cert/pubkey pinning (Frida / objection / mitmproxy)  | N/A     | No mobile client to pin from. TLS to Cloudflare/Supabase is browser-managed.          |
| A118 | Secure storage (Keychain / Android Keystore / StrongBox / biometric) | N/A | No iOS Keychain, no Android Keystore. Secrets live in CF/Wrangler env + Supabase. |
| A119 | Deep / universal / app links + custom URL schemes    | N/A     | No `apple-app-site-association`, no `assetlinks.json`, no `Info.plist` URL types, no `<intent-filter>`. Web links only. |
| A120 | Reverse binary (strings / class-dump / Hopper / Ghidra) | N/A  | No `.ipa` / `.apk` / Mach-O / ELF binary to disassemble. JS bundle review = web audit. |
| A121 | Anti-tamper / anti-debug / root-jailbreak detection  | N/A     | No mobile runtime. Concept does not apply to a server-rendered Next.js app.           |
| A122 | IPC (app groups, share extensions, intents, content providers, broadcast receivers) | N/A | OS-level mobile IPC primitives. None present.                                  |
| A123 | Mobile permissions (background location, photos, contacts, mic, camera) | N/A | No mobile permission manifest. Web app does not declare these.                    |
| A124 | WebViews (`addJavascriptInterface`, `file://`, mixed content, allowlist) | N/A | No `WKWebView` / `WebView` host. The whole product *is* a web page, not embedded in one. |
| A125 | SDK supply chain — Apple Privacy Manifest, GDPR, kid-safe | Partially N/A | No App Store SDKs / Apple Privacy Manifest applies. (Web supply-chain review is out of scope of A125 as written.) |

---

## On-chain section (A126–A135) — verdicts

| ID   | Control                                              | Verdict | Reason                                                                                |
| ---- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| A126 | SWC Registry (reentrancy, tx.origin, delegatecall, …) | N/A    | No Solidity / Vyper / Move / Cairo source. SWC is EVM-specific.                       |
| A127 | Slither + MythX + Foundry invariants + Echidna + Certora | N/A | No contracts to feed any of these tools. Tool list is EVM-only.                       |
| A128 | Upgradeability (Proxy / UUPS / Diamond)              | N/A     | No proxy pattern, no EIP-1967 storage, no `initialize()` to audit.                    |
| A129 | On-chain access control (Ownable / AccessControl, multisig, timelock) | N/A | No on-chain roles. Off-chain RBAC is in `lib/authz.ts` (web concern, not A129). |
| A130 | Economic (flash loans, sandwich, MEV, oracle TWAP)   | N/A     | No AMM, lending, oracle, or governance contracts.                                     |
| A131 | DeFi invariants (Echidna / Foundry — solvency, conservation) | N/A | No DeFi protocol present.                                                             |
| A132 | Off-chain (HSM/MPC signer custody, bridge, indexer)  | N/A     | No on-chain signer, no bridge, no indexer.                                            |
| A133 | Deployment (deterministic build, EIP-1967 slots, ownership transfer) | N/A | No contract deployment artifacts. (App deploy = `wrangler deploy`, web concern.)   |
| A134 | User UX (tx simulation, EIP-712, blind signing)      | N/A     | No wallet flow, no `eth_sign` / `personal_sign` / `signTypedData`.                    |
| A135 | Compliance (OFAC, Travel Rule, MiCA, Howey)          | N/A     | No VASP function, no token issuance, no on-chain value transfer.                      |

---

## Pass / Fail summary for run 9

- Items checked: 20 (A116–A135)
- PASS: 0
- FAIL: 0
- N/A (skipped per rule): 20
- Evidence collected (Frida / class-dump / Slither / Echidna): none — toolchains do not apply.

---

## Note (identical across all 10 runs)

The user requested 10 sequential runs of the same ruleset. Because the ruleset is mobile + on-chain only and the project is a server-rendered web app, every run produces an identical N/A result. This is run **9** of **10**; runs 1–10 are by construction equivalent. If a web-app-equivalent ruleset is desired (OWASP ASVS / Top 10, Next.js middleware, Supabase RLS, CSP, CSRF, rate limiting, supply chain, secrets), that would be a different scope and was offered but not selected.
