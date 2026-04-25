import { test, expect } from '@playwright/test';

test.describe('Cross-Tenant Database and Authorization', () => {
  test('site A cannot read site B products', async ({ request }) => {
    // Assert 401/403 or empty array
  });

  test('site A cannot write site B content', async ({ request }) => {
    // Assert 403
  });

  test('deleted/archived records unavailable to anonymous users', async ({ request }) => {
    // Assert 404
  });

  test('super_admin exceptions are explicit and allowed', async ({ request }) => {
    // Assert 200
  });

  test('internal endpoints reject public callers', async ({ request }) => {
    const response = await request.post('/api/internal/resolve-site');
    expect(response.status()).toBe(401);
  });
});
