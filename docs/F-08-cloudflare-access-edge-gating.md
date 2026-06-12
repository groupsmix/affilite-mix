# F-08: Cloudflare Access Edge Gating for Admin Segment

## Status: Implementation Plan - Requires Cloudflare Configuration

## Finding
F-08 — Admin segment uses path obfuscation instead of edge gating
- Severity: **Medium** · Confidence: **High** · Domain: Security
- Evidence: Admin routes at `/q7m-k4j9/admin/**` use obfuscated path
- Remediation: Add Cloudflare Access for edge-gated admin segment

## Current State

### Path Obfuscation
- Admin routes are at: `/q7m-k4j9/admin/**`
- Path is obfuscated but not truly secret
- Relies on "security by obscurity"
- No additional protection at the edge

### Current Authentication
- JWT-based authentication via admin session
- Cookie-based session management
- Rate limiting per admin user
- CSRF protection on all mutations

## Recommended Solution: Cloudflare Access

### What is Cloudflare Access?

Cloudflare Access (Zero Trust) provides:
- Identity-aware access control at the edge
- Integration with identity providers (Okta, Azure AD, Google, etc.)
- Short-lived access tokens
- Device posture checks
- Geographic restrictions
- Session duration controls
- Audit logging

### Implementation Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Request to /q7m-k4j9/admin/**
       │
       ▼
┌─────────────────────────────┐
│  Cloudflare Access          │
│  - Identity Provider Check  │
│  - MFA Validation          │
│  - Device Posture Check     │
│  - Geo-Fencing             │
└──────┬──────────────────────┘
       │ 2. Identity Verified
       │    (Access Token Issued)
       ▼
┌─────────────────────────────┐
│  Cloudflare Worker          │
│  - JWT Session Validation  │
│  - Authorization Checks     │
│  - Rate Limiting            │
└──────┬──────────────────────┘
       │ 3. Admin Response
       ▼
┌─────────────┐
│   Browser   │
└─────────────┘
```

## Implementation Plan

### Phase 1: Cloudflare Access Setup

#### 1. Create Access Application

In Cloudflare Dashboard:
1. Navigate to Zero Trust → Access → Applications
2. Click "Add an application"
3. Configure:
   - **Name**: affilite-mix-admin
   - **Session Duration**: 8 hours (recommended)
   - **Type**: Self-hosted
   - **URL**: https://wristnerd.xyz
   - **Path**: /q7m-k4j9/admin/*

#### 2. Configure Identity Provider

Choose one or more identity providers:

**Option A: Email Pin (Simplest for Small Teams)**
- Email-based one-time pin
- No external IdP required
- Good for small teams (<10 users)

**Option B: Google OAuth**
- Google Workspace integration
- Existing Google accounts
- MFA via Google 2FA

**Option C: Okta / Azure AD (Enterprise)**
- SAML integration
- Corporate SSO
- Advanced MFA policies

**Option D: One-Time Pin (Temporary)**
- For initial setup
- Upgrade to IdP later

#### 3. Access Policies

**Default Policy (Allow)**
- Email domain: `@yourdomain.com` (or specific emails)
- MFA: Required
- Device posture: Managed devices (optional)
- Geographic: All locations (or restrict regions)

**Additional Policies**
- IT Support (no MFA for emergencies): IP allowlist + short duration
- Contractors: Time-limited access + approval required

### Phase 2: Worker Configuration

No code changes required in the Worker - Cloudflare Access sits entirely at the edge and validates before the request reaches the Worker.

However, consider adding Access context logging:

```typescript
// middleware.ts or admin guard
// Log CF-Access headers for audit trail
const cfAccessEmail = request.headers.get('cf-access-user-identity');
const cfAccessAuth = request.headers.get('cf-access-authenticated-user');
if (cfAccessEmail) {
  logger.info('Cloudflare Access authentication', {
    email: cfAccessEmail,
    path: request.nextUrl.pathname,
  });
}
```

### Phase 3: Wrangler Configuration

Update wrangler.jsonc to document Access usage:

```jsonc
// wrangler.jsonc - add to header comments
// ═════════════════════════════════════════════════════════════════
// CLOUDFLARE ACCESS FOR ADMIN SEGMENT
// ═════════════════════════════════════════════════════════════════
//
// F-08: Admin routes are protected by Cloudflare Access (Zero Trust)
// in addition to path obfuscation and JWT authentication.
//
// Access Application: affilite-mix-admin
// Identity Provider: [configured in Cloudflare Dashboard]
// Session Duration: 8 hours
// Path: /q7m-k4j9/admin/**
//
// Benefits:
// - Identity-aware access control at the edge
// - MFA enforcement
// - Device posture checks (optional)
// - Geographic restrictions (optional)
// - Centralized audit logging
//
// Cloudflare Access is applied BEFORE the Worker, so all requests
// to /q7m-k4j9/admin/** must pass Access validation before reaching
// the application. This provides defense-in-depth:
//
// Layer 1 (Edge): Cloudflare Access (identity + MFA + device + geo)
// Layer 2 (Worker): JWT session validation (app-level auth)
// Layer 3 (App): Authorization checks (RBAC + site membership)
//
// See docs/F-08-cloudflare-access.md for setup instructions.
```

### Phase 4: Migration from Path Obfuscation

**Option A: Keep Both (Defense in Depth - Recommended)**
- Maintain path obfuscation `/q7m-k4j9/admin/**`
- Add Cloudflare Access on top
- Benefits: Two layers of security, no disruption to users

**Option B: Remove Path Obfuscation**
- Change admin routes to `/admin/**`
- Rely solely on Cloudflare Access
- Benefits: Cleaner URLs, easier development
- Risk: If Access is misconfigured, admin routes exposed

**Recommendation**: Keep path obfuscation as defense-in-depth

### Phase 5: Testing

#### 1. Test Access Setup

```bash
# Test with curl (simulating Access-authenticated request)
curl -H "cf-access-client-id: <client-id>" \
     -H "cf-access-client-secret: <client-secret>" \
     https://wristnerd.xyz/q7m-k4j9/admin/sites
```

#### 2. Test Without Access

Verify that requests without Access credentials are blocked at the edge (403 from Cloudflare, never reaches Worker).

#### 3. Test MFA

Attempt access from new device/location, verify MFA prompt.

#### 4. Test Audit Logging

Check Cloudflare Access logs in Dashboard → Zero Trust → Access → Logs.

## Security Benefits

### Current (Path Obfuscation Only)
- ❌ Path can be discovered via logs, network traffic
- ❌ No identity verification at edge
- ❌ No MFA requirement
- ❌ No device posture checks
- ❌ No geographic restrictions
- ❌ No centralized audit logging

### After Cloudflare Access
- ✅ Identity verification at edge (before Worker)
- ✅ MFA enforcement
- ✅ Device posture checks (optional)
- ✅ Geographic restrictions (optional)
- ✅ Centralized audit logging in Cloudflare
- ✅ Short-lived access tokens (auto-expire)
- ✅ Immediate revocation capability

## Compliance Mapping

- **SOC 2 CC6.7**: Detection of unauthorized access
- **SOC 2 CC7.2**: Periodic access reviews
- **SOC 2 CC8.2**: System performance monitoring
- **ISO 27001 A.9.2.1**: User access management
- **ISO 27001 A.9.4.1**: Access control
- **ISO 27001 A.9.4.3**: Management of privileged access rights

## Operational Considerations

### User Experience

**Login Flow:**
1. User navigates to `/q7m-k4j9/admin/**`
2. Cloudflare Access redirects to IdP login page
3. User authenticates with IdP + MFA
4. Cloudflare Access issues short-lived JWT
5. User redirected back to admin panel
6. Worker validates existing JWT session (layer 2)

**Session Management:**
- Access tokens: 8 hours (configurable)
- App JWT sessions: Configurable (currently via cookie)
- Both layers enforce security

### Cost Considerations

- **Free Tier**: Cloudflare Access included in Free plan (limited features)
- **Enterprise Plan**: Advanced features (device posture, geo-fencing, SAML)
- Recommendation: Start with Free tier, upgrade if needed

### Rollback Plan

If Cloudflare Access causes issues:
1. Remove Access policy (temporarily allow all)
2. App-level JWT authentication still protects admin routes
3. Path obfuscation still provides some protection
4. No code rollback needed (Access is edge-only)

## Implementation Steps

### Step 1: Cloudflare Dashboard Setup (30 minutes)
- [ ] Create Access application
- [ ] Configure identity provider
- [ ] Set up MFA policy
- [ ] Add admin users/emails
- [ ] Test login flow

### Step 2: Policy Configuration (15 minutes)
- [ ] Configure default allow policy
- [ ] Set session duration (8 hours recommended)
- [ ] Add geo restrictions if needed
- [ ] Configure device posture if using enterprise features

### Step 3: Documentation Updates (15 minutes)
- [ ] Update wrangler.jsonc header comments
- [ ] Document in docs/security.md
- [ ] Update runbooks with Access troubleshooting
- [ ] Add to onboarding documentation

### Step 4: Testing (30 minutes)
- [ ] Test successful login
- [ ] Test unauthorized access blocked
- [ ] Test MFA flow
- [ ] Test session expiration
- [ ] Test audit logging

### Step 5: Monitoring Setup (15 minutes)
- [ ] Configure Cloudflare Access alerts
- [ ] Set up logging to SIEM (if applicable)
- [ ] Create runbook for access issues

Total Estimated Time: ~2 hours

## Troubleshooting

### Common Issues

**Issue: Access loops between IdP and application**
- Cause: Callback URL misconfiguration
- Fix: Verify callback URL in Access application settings

**Issue: Valid users blocked**
- Cause: Email domain policy too restrictive
- Fix: Add user email or domain to allowlist

**Issue: MFA not prompting**
- Cause: IdP doesn't enforce MFA
- Fix: Configure MFA in IdP, not in Cloudflare Access

**Issue: Workers unreachable after enabling Access**
- Cause: Access policy blocking Worker API calls
- Fix: Add Worker IP ranges to Access allowlist

## Related Documentation

- `docs/security.md` - Security policies
- `lib/admin-guard.ts` - Admin authentication logic
- `lib/middleware.ts` - Request middleware
- `docs/CSP-REVISIT-PLAN.md` - Deferred security improvements

## Success Criteria

- [ ] Cloudflare Access application created and configured
- [ ] Identity provider integrated with MFA
- [ ] Admin routes accessible via Access authentication
- [ ] Unauthorized access blocked at edge
- [ ] Audit logging enabled
- [ ] Documentation updated
- [ ] Rollback plan documented

## Next Steps

1. **Immediate (Week 1):**
   - Set up Cloudflare Access in staging environment
   - Test with small group of admin users
   - Verify no disruption to workflows

2. **Short-term (Week 2):**
   - Deploy to production
   - Monitor access logs for anomalies
   - Train users on new login flow

3. **Long-term:**
   - Consider device posture checks (if enterprise)
   - Integrate with corporate SSO (if applicable)
   - Regularly review access policies