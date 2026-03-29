/**
 * Next.js instrumentation — runs once on server startup.
 * Validates that all required environment variables are set so the app
 * fails fast with clear error messages instead of cryptic runtime failures.
 */

export function register() {
  const required: { name: string; description: string }[] = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL" },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon/public key" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key (server-only)" },
    { name: "JWT_SECRET", description: "Random secret for admin JWT signing" },
  ];

  const conditionalInProd: { name: string; description: string }[] = [
    { name: "CRON_SECRET", description: "Secret for authenticating cron job requests" },
    { name: "RESEND_API_KEY", description: "Resend API key for newsletter confirmation emails" },
    { name: "NEWSLETTER_FROM_EMAIL", description: "Sender address for newsletter confirmation emails" },
  ];

  const missing: string[] = [];

  for (const { name, description } of required) {
    if (!process.env[name]) {
      missing.push(`  - ${name}: ${description}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    for (const { name, description } of conditionalInProd) {
      if (!process.env[name]) {
        missing.push(`  - ${name}: ${description} (required in production)`);
      }
    }
  }

  if (missing.length > 0) {
    const message = [
      "",
      "=".repeat(60),
      "MISSING ENVIRONMENT VARIABLES",
      "=".repeat(60),
      ...missing,
      "",
      "Copy .env.example to .env and fill in the values.",
      "=".repeat(60),
      "",
    ].join("\n");

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }
}
