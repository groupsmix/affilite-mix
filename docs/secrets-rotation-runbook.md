# Secrets Rotation & Maintenance

## Quarterly Compatibility Date Bump Checklist
1. Review Cloudflare Workers release notes
2. Update `compatibility_date` in `wrangler.jsonc`
3. Deploy to staging
4. Run integration tests
5. Deploy to production
