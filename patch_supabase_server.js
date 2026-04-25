const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/lib/supabase-server.ts', 'utf8');

content = content.replace(
  'import { requireEnvInProduction } from "@/lib/env";\nimport type { Database } from "@/types/supabase";',
  'import { requireEnvInProduction } from "@/lib/env";\nimport type { Database } from "@/types/supabase";\nimport { fetchWithTimeout } from "@/lib/fetch-timeout";'
);

content = content.replace(
  'export function getAnonClient(): SupabaseClient<Database> {\n  const url = getSupabaseUrl();\n  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");\n  return createClient<Database>(url, key, {\n    auth: {\n      persistSession: false,\n      autoRefreshToken: false,\n      detectSessionInUrl: false,\n    },\n  });\n}',
  'export function getAnonClient(): SupabaseClient<Database> {\n  const url = getSupabaseUrl();\n  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");\n  return createClient<Database>(url, key, {\n    auth: {\n      persistSession: false,\n      autoRefreshToken: false,\n      detectSessionInUrl: false,\n    },\n    global: {\n      fetch: async (input, init) => {\n        try {\n          const res = await fetchWithTimeout(input as string, {\n            ...init,\n            timeoutMs: 8000,\n            next: {\n              revalidate: 60,\n              ...(init as any)?.next,\n            },\n          });\n          return res;\n        } catch (error) {\n          console.error("[getAnonClient] DB fetch failed (timeout or network):", error);\n          return new Response(JSON.stringify({ error: "Service Unavailable", data: null }), {\n            status: 503,\n            headers: { "Content-Type": "application/json" },\n          });\n        }\n      },\n    },\n  });\n}'
);

content = content.replace(
  'export function getServiceClient(): SupabaseClient<Database> {\n  const url = getSupabaseUrl();\n  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");\n  return createClient<Database>(url, key, {\n    auth: {\n      persistSession: false,\n      autoRefreshToken: false,\n      detectSessionInUrl: false,\n    },\n  });\n}',
  'export function getServiceClient(): SupabaseClient<Database> {\n  const url = getSupabaseUrl();\n  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");\n  return createClient<Database>(url, key, {\n    auth: {\n      persistSession: false,\n      autoRefreshToken: false,\n      detectSessionInUrl: false,\n    },\n    global: {\n      fetch: async (input, init) => {\n        return fetchWithTimeout(input as string, {\n          ...init,\n          timeoutMs: 12000,\n        });\n      },\n    },\n  });\n}'
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/supabase-server.ts', content);
