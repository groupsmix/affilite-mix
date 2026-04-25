import { ApiRouteAuditRegistry } from '../docs/API_AUDIT';

describe('Route Metadata Audit', () => {
  it('must contain entries for all major routes', () => {
    const login = ApiRouteAuditRegistry.find(r => r.path === "/api/auth/login");
    expect(login).toBeDefined();
    expect(login?.rateLimit).toBe("strict");
    expect(login?.csrf).toBe("required");
  });

  it('all POST routes must specify CSRF strategy', () => {
    ApiRouteAuditRegistry.forEach(route => {
      if (route.method === "POST") {
        expect(route.csrf).toBeDefined();
      }
    });
  });
});
