/**
 * Task 2.3 — Bug 3 preservation tests (PHASE 2, run on UNFIXED code).
 *
 * GOAL: Snapshot all Kong config sections in `docker/kong.yml` EXCEPT the two
 * `keyauth_credentials[*].key` lines, so these tests act as a regression
 * baseline after the Bug 3 fix is applied.
 *
 * OBSERVATION LOG (recorded from current unfixed `docker/kong.yml`):
 *   - _format_version: "2.1"
 *   - _transform: true
 *   - One service: name=rest-v1, url=http://rest:3000/
 *   - One route: name=rest-v1-all, strip_path=true, path=/rest/v1/
 *   - CORS plugin origins: ["http://localhost:3000", "http://localhost:3001"]
 *   - CORS methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
 *   - CORS headers: Content-Type, Authorization, apikey, x-csrf-token, x-trace-id
 *   - CORS credentials: true, max_age: 3600
 *   - Consumer names: "anon" and "service_role" (both present)
 *   - Each consumer has exactly one keyauth_credentials entry (key value varies)
 *
 * EXPECTED OUTCOME (on UNFIXED code): ALL tests PASS.
 * After the Bug 3 fix (task 5.1), these tests must continue to pass — only the
 * two `key:` values change; everything else is byte-for-byte identical.
 *
 * Property 9: Preservation — All other Kong config sections are unchanged
 * Validates: Requirements 3.1, 3.2
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

// ─────────────────────────────────────────────────────────────────────────────
// Load and parse kong.yml once for all tests
// ─────────────────────────────────────────────────────────────────────────────

const kongYmlPath = path.resolve(__dirname, "..", "docker", "kong.yml");

let rawContent: string;

let parsed: any;

beforeAll(() => {
  rawContent = fs.readFileSync(kongYmlPath, "utf-8");
  parsed = YAML.parse(rawContent);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a deep clone of the parsed kong.yml with the keyauth_credentials[*].key
 * values stripped out. This lets tests compare structure without caring about
 * the credential values (which are the ONLY thing the fix changes).
 */

function withoutCredentialKeys(doc: any): any {
  const clone = JSON.parse(JSON.stringify(doc));
  if (Array.isArray(clone.consumers)) {
    for (const consumer of clone.consumers) {
      if (Array.isArray(consumer.keyauth_credentials)) {
        for (const cred of consumer.keyauth_credentials) {
          delete cred.key;
        }
      }
    }
  }
  return clone;
}

// ─────────────────────────────────────────────────────────────────────────────
// Observation baseline (recorded from unfixed docker/kong.yml)
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 3 preservation — docker/kong.yml structure outside the credential lines", () => {
  // ── Format / top-level fields ────────────────────────────────────────────

  /**
   * Observation: _format_version is "2.1"
   *
   * Property 9: Preservation — format version must remain unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it('observation: _format_version is "2.1"', () => {
    expect(parsed._format_version).toBe("2.1");
  });

  /**
   * Observation: _transform is true
   *
   * Property 9: Preservation — transform flag must remain unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: _transform is true", () => {
    expect(parsed._transform).toBe(true);
  });

  // ── Service: rest-v1 ─────────────────────────────────────────────────────

  /**
   * Observation: one service named "rest-v1" pointing to http://rest:3000/
   *
   * Property 9: Preservation — service definition unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it('observation: services contains exactly one entry named "rest-v1"', () => {
    expect(parsed.services).toHaveLength(1);
    expect(parsed.services[0].name).toBe("rest-v1");
  });

  it('observation: rest-v1 service URL is "http://rest:3000/"', () => {
    expect(parsed.services[0].url).toBe("http://rest:3000/");
  });

  // ── Routes ───────────────────────────────────────────────────────────────

  /**
   * Observation: one route named "rest-v1-all" with strip_path=true and path=/rest/v1/
   *
   * Property 9: Preservation — route config unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it('observation: rest-v1 service has exactly one route named "rest-v1-all"', () => {
    const routes = parsed.services[0].routes;
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe("rest-v1-all");
  });

  it("observation: rest-v1-all route has strip_path=true", () => {
    expect(parsed.services[0].routes[0].strip_path).toBe(true);
  });

  it('observation: rest-v1-all route has path "/rest/v1/"', () => {
    const paths = parsed.services[0].routes[0].paths;
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("/rest/v1/");
  });

  // ── CORS plugin ──────────────────────────────────────────────────────────

  /**
   * Observation: one CORS plugin on the rest-v1 service with specific config
   *
   * Property 9: Preservation — CORS settings unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it('observation: rest-v1 service has exactly one plugin named "cors"', () => {
    const plugins = parsed.services[0].plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("cors");
  });

  it("observation: CORS origins are exactly [http://localhost:3000, http://localhost:3001]", () => {
    const origins = parsed.services[0].plugins[0].config.origins;
    expect(origins).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("observation: CORS methods include GET, POST, PUT, PATCH, DELETE, OPTIONS", () => {
    const methods = parsed.services[0].plugins[0].config.methods;
    expect(methods).toEqual(
      expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
    );
    expect(methods).toHaveLength(6);
  });

  it("observation: CORS headers include Content-Type, Authorization, apikey, x-csrf-token, x-trace-id", () => {
    const headers = parsed.services[0].plugins[0].config.headers;
    expect(headers).toEqual(
      expect.arrayContaining([
        "Content-Type",
        "Authorization",
        "apikey",
        "x-csrf-token",
        "x-trace-id",
      ]),
    );
    expect(headers).toHaveLength(5);
  });

  it("observation: CORS credentials is true", () => {
    expect(parsed.services[0].plugins[0].config.credentials).toBe(true);
  });

  it("observation: CORS max_age is 3600", () => {
    expect(parsed.services[0].plugins[0].config.max_age).toBe(3600);
  });

  // ── Consumers ────────────────────────────────────────────────────────────

  /**
   * Observation: two consumers named "anon" and "service_role"
   *
   * Property 9: Preservation — consumer names unchanged after the fix.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: consumers array contains exactly two entries", () => {
    expect(parsed.consumers).toHaveLength(2);
  });

  it('observation: first consumer username is "anon"', () => {
    expect(parsed.consumers[0].username).toBe("anon");
  });

  it('observation: second consumer username is "service_role"', () => {
    expect(parsed.consumers[1].username).toBe("service_role");
  });

  it("observation: anon consumer has exactly one keyauth_credentials entry", () => {
    expect(parsed.consumers[0].keyauth_credentials).toHaveLength(1);
  });

  it("observation: service_role consumer has exactly one keyauth_credentials entry", () => {
    expect(parsed.consumers[1].keyauth_credentials).toHaveLength(1);
  });

  // ── Structural snapshot (excluding credential keys) ──────────────────────

  /**
   * P9a — Full structural snapshot (key values excluded).
   *
   * After any edit to kong.yml, every field EXCEPT the two
   * `keyauth_credentials[*].key` values must remain identical to the observed
   * baseline recorded here.
   *
   * This is the primary regression guard: if the fix accidentally touches any
   * other part of the file, this test will catch it.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P9a: full structural snapshot — all fields except credential keys match observed baseline", () => {
    const baseline = {
      _format_version: "2.1",
      _transform: true,
      services: [
        {
          name: "rest-v1",
          _comment: "Supabase PostgREST → /rest/v1/",
          url: "http://rest:3000/",
          routes: [
            {
              name: "rest-v1-all",
              strip_path: true,
              paths: ["/rest/v1/"],
            },
          ],
          plugins: [
            {
              name: "cors",
              config: {
                origins: ["http://localhost:3000", "http://localhost:3001"],
                methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                headers: ["Content-Type", "Authorization", "apikey", "x-csrf-token", "x-trace-id"],
                credentials: true,
                max_age: 3600,
              },
            },
          ],
        },
      ],
      consumers: [
        {
          username: "anon",
          keyauth_credentials: [{}], // key stripped — only structure matters
        },
        {
          username: "service_role",
          keyauth_credentials: [{}], // key stripped — only structure matters
        },
      ],
    };

    const actual = withoutCredentialKeys(parsed);

    // Top-level format fields
    expect(actual._format_version).toBe(baseline._format_version);
    expect(actual._transform).toBe(baseline._transform);

    // Services structure
    expect(actual.services).toHaveLength(1);
    const svc = actual.services[0]!;
    const bSvc = baseline.services[0]!;

    expect(svc.name).toBe(bSvc.name);
    expect(svc.url).toBe(bSvc.url);

    // Routes
    expect(svc.routes).toHaveLength(1);
    expect(svc.routes[0]!.name).toBe(bSvc.routes[0]!.name);
    expect(svc.routes[0]!.strip_path).toBe(bSvc.routes[0]!.strip_path);
    expect(svc.routes[0]!.paths).toEqual(bSvc.routes[0]!.paths);

    // Plugins / CORS
    expect(svc.plugins).toHaveLength(1);
    const plugin = svc.plugins[0]!;
    const bPlugin = bSvc.plugins[0]!;
    expect(plugin.name).toBe(bPlugin.name);
    expect(plugin.config.origins).toEqual(bPlugin.config.origins);
    expect(plugin.config.methods).toEqual(bPlugin.config.methods);
    expect(plugin.config.headers).toEqual(bPlugin.config.headers);
    expect(plugin.config.credentials).toBe(bPlugin.config.credentials);
    expect(plugin.config.max_age).toBe(bPlugin.config.max_age);

    // Consumers (names and credential count only — not the key values)
    expect(actual.consumers).toHaveLength(2);
    expect(actual.consumers[0].username).toBe("anon");
    expect(actual.consumers[0].keyauth_credentials).toHaveLength(1);
    expect(actual.consumers[1].username).toBe("service_role");
    expect(actual.consumers[1].keyauth_credentials).toHaveLength(1);
  });

  // ── Line-level raw text assertions ───────────────────────────────────────

  /**
   * P9b — Raw text checks: structural comment and key config sections are present.
   *
   * Verifies that characteristic comment text and YAML keys (not the credential
   * values) are present in the raw file, ensuring the file wasn't accidentally
   * rewritten from scratch with different formatting.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P9b: raw file contains the service declaration comment and structural keywords", () => {
    expect(rawContent).toContain("Supabase PostgREST → /rest/v1/");
    expect(rawContent).toContain("name: rest-v1");
    expect(rawContent).toContain("url: http://rest:3000/");
    expect(rawContent).toContain("name: rest-v1-all");
    expect(rawContent).toContain("strip_path: true");
    expect(rawContent).toContain("- /rest/v1/");
    expect(rawContent).toContain("name: cors");
    expect(rawContent).toContain("credentials: true");
    expect(rawContent).toContain("max_age: 3600");
  });

  it("P9b: raw file contains consumer section with expected usernames", () => {
    expect(rawContent).toContain("username: anon");
    expect(rawContent).toContain("username: service_role");
    expect(rawContent).toContain("keyauth_credentials:");
  });

  it("P9b: raw file contains all CORS origin values", () => {
    expect(rawContent).toContain("http://localhost:3000");
    expect(rawContent).toContain("http://localhost:3001");
  });

  it("P9b: raw file contains all CORS method values", () => {
    expect(rawContent).toContain("GET");
    expect(rawContent).toContain("POST");
    expect(rawContent).toContain("PUT");
    expect(rawContent).toContain("PATCH");
    expect(rawContent).toContain("DELETE");
    expect(rawContent).toContain("OPTIONS");
  });

  it("P9b: raw file contains all CORS header values", () => {
    expect(rawContent).toContain("Content-Type");
    expect(rawContent).toContain("Authorization");
    expect(rawContent).toContain("apikey");
    expect(rawContent).toContain("x-csrf-token");
    expect(rawContent).toContain("x-trace-id");
  });

  // ── No accidental additions ───────────────────────────────────────────────

  /**
   * P9c — No extra consumers, services, or plugins have been added.
   *
   * Counts top-level array lengths to catch accidental additions that might
   * slip through when editing the file.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P9c: exactly one service, one route, one plugin, and two consumers — no extras added", () => {
    expect(parsed.services).toHaveLength(1);
    expect(parsed.services[0].routes).toHaveLength(1);
    expect(parsed.services[0].plugins).toHaveLength(1);
    expect(parsed.consumers).toHaveLength(2);
  });
});
