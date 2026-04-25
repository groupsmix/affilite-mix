# Developer Setup Docs

1. `npm i -g supabase`
2. `supabase start`
3. `npm ci`
4. Create `.env.local` using `.env.example`
5. `npm run dev`

## Common Failures
- If Cloudflare Workers fail locally: Run `npm run typecheck:all` or clear `.vercel/` cache.
- Ensure Turnstile keys are properly loaded into `.env.local`.
- If database migration fails locally: Reset `supabase db reset`.

## Test Commands
- `npm run lint`
- `npm test`
- `npx playwright test`
