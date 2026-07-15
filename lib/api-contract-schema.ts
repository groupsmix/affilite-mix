export interface ApiJsonSchema {
  readonly $ref?: string;
  readonly type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  readonly description?: string;
  readonly format?: string;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly const?: string | number | boolean;
  readonly enum?: ReadonlyArray<string | number | boolean | null>;
  readonly properties?: Readonly<Record<string, ApiJsonSchema>>;
  readonly required?: ReadonlyArray<string>;
  readonly items?: ApiJsonSchema;
  readonly additionalProperties?: boolean | ApiJsonSchema;
  readonly oneOf?: ReadonlyArray<ApiJsonSchema>;
}

const nullableString: ApiJsonSchema = {
  oneOf: [{ type: "string" }, { type: "null" }],
};

export const API_SCHEMA_COMPONENTS = {
  ApiError: {
    type: "object",
    additionalProperties: false,
    required: ["error", "code"],
    properties: {
      error: { type: "string" },
      code: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
      details: {},
    },
  },
  CsrfTokenResponse: {
    type: "object",
    additionalProperties: false,
    required: ["csrfToken"],
    properties: {
      csrfToken: { type: "string" },
    },
  },
  AuthMeResponse: {
    type: "object",
    additionalProperties: false,
    required: ["role", "email", "activeSite"],
    properties: {
      role: { type: "string" },
      email: nullableString,
      activeSite: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "name"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
          { type: "null" },
        ],
      },
    },
  },
  NewsletterSignupRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email", "turnstileToken"],
    properties: {
      email: { type: "string", format: "email" },
      turnstileToken: { type: "string" },
      website: { type: "string", description: "Honeypot field; clients should leave it empty." },
    },
  },
  NewsletterSignupResponse: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "message"],
    properties: {
      ok: { type: "boolean", const: true },
      message: { type: "string" },
    },
  },
  HealthResponse: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", const: "healthy" },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "timestamp", "checks"],
        properties: {
          status: { type: "string", enum: ["healthy", "degraded"] },
          timestamp: { type: "string", format: "date-time" },
          checks: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: false,
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["ok", "warn", "error"] },
                latencyMs: { type: "integer", minimum: 0 },
                error: { type: "string" },
              },
            },
          },
        },
      },
    ],
  },
} as const satisfies Readonly<Record<string, ApiJsonSchema>>;

export type ApiSchemaName = keyof typeof API_SCHEMA_COMPONENTS;
