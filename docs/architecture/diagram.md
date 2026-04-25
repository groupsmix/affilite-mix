# Production Architecture Diagram

```mermaid
graph TD
    Browser[User Browser] --> CF_WAF(Cloudflare WAF / CDN / Bot Protection)
    
    CF_WAF --> Pages(Next.js App Router)
    CF_WAF --> API(Next.js API Routes)
    CF_WAF --> Admin(Admin Dashboard: admin.domain.com)

    Pages --> KV(KV: Site Config & Products Cache)
    API --> RateLimiterDO(Durable Object Rate Limiter)
    API --> Queue(Click/Analytics Queue)
    API --> Supabase(Supabase Data API / REST)

    Supabase --> PostgreSQL[(PostgreSQL Database)]
    PostgreSQL --> RLS(Row Level Security)

    Queue --> Worker(Background Worker)
    Worker --> Supabase
    Worker --> DLQ(Dead Letter Queue)

    Cron[Cloudflare Cron Triggers] --> Worker
    Worker --> API_Cron(API Cron Endpoints)

    API_Cron --> AI[OpenAI / Anthropic API]
    API_Cron --> Resend[Resend Email API]

    Stripe[Stripe Webhooks] --> API_Webhooks(API Webhook Endpoint)

    API --> Sentry(Sentry Observability)
    Pages --> Sentry
    Worker --> Sentry
```

## Data Flow
- **Browser** requests hit the **Cloudflare WAF** where DDOS, Rate Limits, and Bot Management rules apply.
- Dynamic requests hit the **Next.js** edge workers which validate `sameSite` JWTs and resolve the current tenant domain via **KV**.
- Heavy click analytics are fired and forgotten into **Cloudflare Queues** and processed asynchronously.
- The **Supabase Data API** applies RLS on behalf of the `anon` or `authenticated` JWT role.
- Background tasks (Sitemaps, AI Generation, Price Scraping) are scheduled via **Cron Triggers**, securely invoking API routes with timing-safe secrets.
