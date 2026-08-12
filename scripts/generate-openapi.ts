#!/usr/bin/env tsx
/**
 * Generate openapi.yaml from the API route metadata registry.
 *
 * The registry already enumerates every route, its methods, auth requirement,
 * and tenant scope. This script turns that into a living OpenAPI 3.1 contract
 * so the public documentation does not drift from the actual route surface.
 *
 * Usage:
 *   npx tsx scripts/generate-openapi.ts [output-path]
 */

import { writeFileSync } from "fs";
import { API_ROUTE_METADATA } from "@/lib/api-route-metadata";
import { API_SCHEMA_COMPONENTS } from "@/lib/api-contract-schema";
import { API_VERSION_HEADER, CURRENT_API_VERSION } from "@/lib/api-version";

const OUTPUT = process.argv[2] ?? "openapi.yaml";

function needsQuotes(value: string): boolean {
  if (value === "") return true;
  if (/^[\s]|[\s]$/.test(value)) return true;
  if (/[\:\#\,\[\]\{\}\*\&\|\>\<\%\!\'\"\?\@\`\r\n]/.test(value)) return true;
  if (["true", "false", "null", "yes", "no", "on", "off"].includes(value.toLowerCase()))
    return true;
  if (/^(\-?\d+(\.\d+)?|0[xbo][0-9a-fA-F]+)$/.test(value)) return true;
  return false;
}

function yamlString(value: string): string {
  if (needsQuotes(value)) {
    return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return value;
}

function toYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (value === null || value === undefined) return `${pad}null`;
  if (typeof value === "boolean") return `${pad}${value ? "true" : "false"}`;
  if (typeof value === "number") return `${pad}${String(value)}`;
  if (typeof value === "string") return `${pad}${yamlString(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        const rendered = toYaml(item, indent + 2);
        const line = rendered.slice(indent + 2);
        return `${pad}- ${line}`;
      })
      .join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, val]) => {
        if (Array.isArray(val) && val.length === 0) return `${pad}${key}: []`;
        if (
          typeof val === "object" &&
          val !== null &&
          !Array.isArray(val) &&
          Object.keys(val).length === 0
        ) {
          return `${pad}${key}: {}`;
        }
        if (typeof val === "object" && val !== null) {
          const nested = toYaml(val, indent + 2);
          return `${pad}${key}:\n${nested}`;
        }
        return `${pad}${key}: ${toYaml(val, 0).trimStart()}`;
      })
      .join("\n");
  }
  return `${pad}${String(value)}`;
}

function pathToOpenApi(path: string): string {
  return path.replace(/\[([^\]]+)\]/g, "{$1}");
}

function operationId(method: string, path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[\[\]\-{}]/g, ""));
  const parts = [method.toLowerCase(), ...segments];
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
}

function tagForPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return "System";
  const second = parts[1]!;
  if (second.startsWith("[")) return "Dynamic";
  return second.charAt(0).toUpperCase() + second.slice(1);
}

function summaryFor(meta: (typeof API_ROUTE_METADATA)[number], method: string): string {
  const scope = meta.scope ? ` (${meta.scope})` : "";
  const auth = meta.auth === "public" ? "public" : `auth=${meta.auth}`;
  return `${method.toUpperCase()} ${meta.path}${scope} — ${auth}`;
}

function versionedResponse(description: string, schema?: Record<string, unknown>) {
  const response: Record<string, unknown> = {
    description,
    headers: {
      [API_VERSION_HEADER]: {
        $ref: `#/components/headers/${API_VERSION_HEADER}`,
      },
    },
  };
  if (schema) {
    response.content = {
      "application/json": {
        schema,
      },
    };
  }
  return response;
}

function buildOperation(meta: (typeof API_ROUTE_METADATA)[number], method: string) {
  const op: Record<string, unknown> = {
    summary: summaryFor(meta, method),
    operationId: operationId(method, meta.path),
    tags: [tagForPath(meta.path)],
    "x-auth": meta.auth,
    "x-adminRequired": meta.adminRequired,
    "x-tenantScope": meta.scope,
    "x-rateLimit": meta.rateLimit,
    "x-csrf": meta.csrf,
    "x-requestSchema": meta.requestSchema,
    "x-responseSchema": meta.responseSchema,
    "x-notes": meta.notes ?? null,
  };

  if (meta.auth !== "public") {
    op.security = [{ bearerAuth: [] }];
  } else {
    op.security = [];
  }

  const publicOrInternal = meta.auth === "public" || meta.auth === "internal";
  const isInternal =
    meta.auth === "internal" ||
    meta.auth === "admin" ||
    meta.auth === "super_admin" ||
    meta.auth === "cron";
  if (isInternal) {
    op["x-internal"] = true;
  }

  const responses: Record<string, unknown> = {};
  if (meta.contract) {
    for (const [status, response] of Object.entries(meta.contract.responses)) {
      responses[status] = versionedResponse(response.description, {
        $ref: `#/components/schemas/${response.schema}`,
      });
    }
    if (meta.contract.requestSchema && method !== "GET" && method !== "HEAD") {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${meta.contract.requestSchema}`,
            },
          },
        },
      };
    }
  } else {
    responses["200"] = versionedResponse(
      publicOrInternal
        ? "Successful response"
        : `Successful response (${meta.responseSchema || "object"})`,
      { type: "object" },
    );

    if (meta.auth !== "public" && meta.auth !== "stripe-webhook") {
      responses["401"] = versionedResponse("Unauthorized");
    }
    if (meta.auth === "admin" || meta.auth === "super_admin") {
      responses["403"] = versionedResponse("Forbidden — insufficient role or cross-tenant access");
    }
    if (meta.rateLimit) {
      responses["429"] = versionedResponse("Rate limited");
    }
  }

  op.responses = responses;

  // Extract dynamic path parameters
  const params: Array<Record<string, unknown>> = [];
  const dynamic = meta.path.match(/\[([^\]]+)\]/g);
  if (dynamic) {
    for (const m of dynamic) {
      const name = m.slice(1, -1);
      params.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
  }
  if (params.length > 0) {
    op.parameters = params;
  }

  return op;
}

function buildPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const meta of API_ROUTE_METADATA) {
    // Feature-gated/incubating surfaces are not part of the public contract yet.
    if (meta.path.startsWith("/api/community") || meta.path.startsWith("/api/membership")) continue;
    const oPath = pathToOpenApi(meta.path);
    if (!paths[oPath]) paths[oPath] = {};
    for (const method of meta.methods) {
      paths[oPath][method.toLowerCase()] = buildOperation(meta, method);
    }
  }
  return paths;
}

const doc = {
  openapi: "3.1.0",
  info: {
    title: "Affilite Mix API",
    version: CURRENT_API_VERSION,
    description:
      "Multi-tenant affiliate marketing platform API. Routes marked x-internal: true are not part of the public consumer contract.",
    contact: { name: "Affilite Mix" },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "https://compareai.site", description: "Production (compareai.site)" },
    { url: "https://staging.compareai.site", description: "Staging" },
  ],
  paths: buildPaths(),
  components: {
    schemas: API_SCHEMA_COMPONENTS,
    headers: {
      [API_VERSION_HEADER]: {
        description: "Numeric major version of the served API contract.",
        schema: {
          type: "string",
          pattern: "^[1-9][0-9]*$",
          example: CURRENT_API_VERSION,
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    parameters: {
      siteId: {
        name: "x-site-id",
        in: "header",
        required: true,
        schema: { type: "string" },
        description: "Tenant identifier",
      },
    },
  },
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Newsletter" },
    { name: "Admin" },
    { name: "Cron" },
    { name: "Public" },
    { name: "Internal" },
    { name: "Membership" },
    { name: "Community" },
  ],
};

const yaml = toYaml(doc, 0);
writeFileSync(OUTPUT, `${yaml}\n`);
console.log(`Wrote ${OUTPUT} with ${API_ROUTE_METADATA.length} routes`);
