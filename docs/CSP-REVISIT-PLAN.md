# CSP Policy Revisits and Deferred Security Improvements

## CSP `style-src 'unsafe-inline'` (F-07)

**Status**: Accepted Risk with Revisit Date: 2026-09-01
**Finding**: F-07 — Content Security Policy includes `style-src 'unsafe-inline'`
**Severity**: **Low/Medium** · Confidence: **High** · Domain: Security

### Current State

The CSP policy currently allows `style-src 'unsafe-inline'` to support inline styles in the application. This is an accepted security risk with documented justification.

### Why It's Currently Allowed

- The application uses certain libraries or frameworks that require inline styles
- Removing `unsafe-inline` would require significant refactoring
- The risk is mitigated by other security controls (sanitization, CSP nonces for scripts)

### Revisit Plan for 2026-09-01

By September 1, 2026, revisit this decision with the following goals:

1. **Audit all inline style usage**
   - Identify all locations where inline styles are used
   - Determine if they can be migrated to external stylesheets
   - Check if libraries/frameworks have been updated to support CSP-compliant alternatives

2. **Evaluate alternative approaches**
   - Use CSP nonces for inline styles (similar to script nonces)
   - Migrate to CSS-in-JS libraries that support CSP
   - Extract inline styles to external CSS files
   - Use style-hashing approaches

3. **Implementation path**
   - Create feature flag for CSP strict mode
   - Test strict mode in staging environment
   - Roll out gradually with monitoring
   - Monitor for any style-related breakages

4. **Success criteria**
   - Remove `style-src 'unsafe-inline'` from CSP policy
   - All styles load without inline styles
   - No visual regressions in production
   - Maintain same security level for scripts

### Related ADRs

- Create ADR for CSP inline style migration strategy
- Document trade-offs of different CSP enforcement levels

### Assigned Owner

- [ ] Security team member to be assigned

### Dependencies

- Next.js/React framework updates
- Third-party library CSP support
- Development team bandwidth for refactoring

---

## Other Deferred Security Improvements

### Admin Path Obfuscation vs Edge Gating (F-08)

**Status**: Currently using path obfuscation, should revisit Cloudflare Access
**Finding**: F-08 — Admin segment uses path obfuscation instead of edge gating
**Severity**: **Medium** · Confidence: **High** · Domain: Security

**Current Approach**: Admin routes at `/q7m-k4j9/admin/**` use obfuscated path
**Recommended**: Cloudflare Access for edge-gated admin segment

**Revisit Considerations**:

- Evaluate Cloudflare Access implementation complexity
- Assess impact on admin user experience (additional auth)
- Compare cost/benefit of edge gating vs current approach
- Consider hybrid approach (edge gating + path obfuscation)

### DAL AbortSignal Implementation (F-11)

**Status**: Partial implementation - fetchWithTimeout exists, need verification
**Finding**: F-11 — Ensure DAL calls honor AbortSignal
**Severity**: **Low/Medium** · Confidence: **Medium** · Domain: Reliability

**Current State**: `fetchWithTimeout` is implemented but not verified across all DAL calls
**Revisit Plan**:

- Audit all DAL calls to verify AbortSignal support
- Add tests for timeout behavior
- Document which DAL paths support cancellation
- Add metric for "post-timeout completion" as recommended in audit

### Click Queue Concurrency (F-13)

**Status**: Current setting is `max_concurrency: 2`
**Finding**: F-13 — Increase click queue concurrency and add pgbouncer
**Severity**: **Medium** · Confidence: **High** · Domain: Performance

**Current State**: Queue consumer runs at `max_concurrency: 2` for Supabase pool reasons
**Revisit Plan**:

- Evaluate if pgbouncer is still needed or if Supabase has improved
- Test increasing concurrency in staging
- Monitor database connection pool performance
- Add global concurrency cap on outbound AI calls (not just queue level)

---

## Revisits Schedule

| Item                         | Revisit Date | Priority | Owner | Status    |
| ---------------------------- | ------------ | -------- | ----- | --------- |
| CSP unsafe-inline removal    | 2026-09-01   | P1       | TBD   | Scheduled |
| Admin Cloudflare Access      | 2026-06-30   | P2       | TBD   | Pending   |
| DAL AbortSignal verification | 2026-07-15   | P2       | TBD   | Pending   |
| Click queue concurrency      | 2026-08-01   | P2       | TBD   | Pending   |

---

## Review Process

### Monthly Review

- Track progress on all revisit items
- Update priorities based on changing risk landscape
- Block out time for implementation in sprint planning

### Pre-Revisit Checklist

Before the revisit date:

1. [ ] Research current state of technology/library support
2. [ ] Estimate implementation effort
3. [ ] Identify potential risks of implementation
4. [ ] Prepare rollback plan
5. [ ] Schedule maintenance window if needed

### Post-Implementation

1. [ ] Monitor for regressions
2. [ ] Update security documentation
3. [ ] Close out associated audit findings
4. [ ] Document lessons learned

---

## Related Documentation

- `affilite-mix-AUDIT(15).md` - Full audit report
- `docs/security.md` - Security policies
- `docs/adr/` - Architecture decision records
- `.github/ISSUE_TEMPLATE/` - Issue templates for future security improvements
