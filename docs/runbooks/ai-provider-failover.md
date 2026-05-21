# Runbook: AI Provider Failover Manual Override

## Context

The AI content generation system (`lib/ai/providers.ts`) uses a fallback chain:

1. Cloudflare AI (primary)
2. Google Gemini
3. Groq
4. Cohere

Each provider is gated by an `AI_ENABLE_*` feature flag AND the presence of API credentials.

## When to Use

- A provider is returning errors or degraded quality
- A provider has announced maintenance or outage
- You need to force a specific provider for cost reasons
- A provider's API key has been compromised and needs rotation

## Disabling a Provider

Set the feature flag to anything other than "true" or "1":

```bash
# Disable Cloudflare AI
wrangler secret put AI_ENABLE_CLOUDFLARE <<< "false"

# Disable Gemini
wrangler secret put AI_ENABLE_GEMINI <<< "false"

# Disable Groq
wrangler secret put AI_ENABLE_GROQ <<< "false"

# Disable Cohere
wrangler secret put AI_ENABLE_COHERE <<< "false"
```

No redeploy is required -- the Worker reads these at runtime.

## Forcing a Single Provider

Disable all providers except the one you want:

```bash
# Force Gemini only
wrangler secret put AI_ENABLE_CLOUDFLARE <<< "false"
wrangler secret put AI_ENABLE_GEMINI <<< "true"
wrangler secret put AI_ENABLE_GROQ <<< "false"
wrangler secret put AI_ENABLE_COHERE <<< "false"
```

## Rotating an API Key

```bash
# Example: rotate Gemini key
wrangler secret put GEMINI_API_KEY <<< "new-api-key-here"
```

The change takes effect on the next request (no redeploy needed).

## Monitoring

- Check AI generation results via `/api/cron/ai-generate` response
- Monitor per-tenant AI quotas via KV keys: `quota:{siteId}:ai_requests:day:YYYY-MM-DD`
- Check Sentry for AI provider errors tagged with `context: "ai-provider"`

## Emergency: Disable All AI Generation

```bash
# Disable all providers
wrangler secret put AI_ENABLE_CLOUDFLARE <<< "false"
wrangler secret put AI_ENABLE_GEMINI <<< "false"
wrangler secret put AI_ENABLE_GROQ <<< "false"
wrangler secret put AI_ENABLE_COHERE <<< "false"
```

Or remove the cron trigger entirely from the `heavy-crons` worker schedule.

## Restoring Normal Operation

```bash
# Re-enable the full chain
wrangler secret put AI_ENABLE_CLOUDFLARE <<< "true"
wrangler secret put AI_ENABLE_GEMINI <<< "true"
wrangler secret put AI_ENABLE_GROQ <<< "true"
wrangler secret put AI_ENABLE_COHERE <<< "true"
```
