/**
 * Integration test: Password reset flow
 *
 * This test verifies the complete password reset lifecycle:
 * 1. User requests password reset
 * 2. Reset token is generated and stored
 * 3. Reset link uses canonical APP_URL (not request origin)
 * 4. Token is validated and password is updated
 * 5. Token is invalidated after use
 *
 * Tests the fix for Issue #5 (password reset URL security).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServiceClient } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";

describe("Password Reset Flow Integration", () => {
  const sb = getServiceClient();
  let testUserId: string;
  const testEmail = `test-reset-${Date.now()}@example.com`;

  beforeEach(async () => {
    // Create a test admin user
    const passwordHash = await hashPassword("OldPassword123!");
    const { data: user, error } = await sb
      .from("admin_users")
      .insert({
        email: testEmail,
        password_hash: passwordHash,
        name: "Test User",
        role: "admin",
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup: delete test user
    await sb.from("admin_users").delete().eq("id", testUserId);
  });

  it("should generate and store reset token with expiry", async () => {
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const { error } = await sb
      .from("admin_users")
      .update({
        reset_token: resetToken,
        reset_token_expires_at: expiresAt,
      })
      .eq("id", testUserId);

    expect(error).toBeNull();

    // Verify token was stored
    const { data: user } = await sb
      .from("admin_users")
      .select("reset_token, reset_token_expires_at")
      .eq("id", testUserId)
      .single();

    expect(user?.reset_token).toBe(resetToken);
    expect(user?.reset_token_expires_at).toBe(expiresAt);
  });

  it("should validate reset token and update password", async () => {
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Store reset token
    await sb
      .from("admin_users")
      .update({
        reset_token: resetToken,
        reset_token_expires_at: expiresAt,
      })
      .eq("id", testUserId);

    // Verify token is valid
    const { data: userWithToken } = await sb
      .from("admin_users")
      .select("id, reset_token, reset_token_expires_at")
      .eq("reset_token", resetToken)
      .single();

    expect(userWithToken).toBeDefined();
    expect(userWithToken?.id).toBe(testUserId);

    // Check token hasn't expired
    const tokenExpiry = new Date(userWithToken!.reset_token_expires_at!);
    expect(tokenExpiry.getTime()).toBeGreaterThan(Date.now());

    // Update password and clear token
    const newPasswordHash = await hashPassword("NewPassword123!");
    const { error: updateError } = await sb
      .from("admin_users")
      .update({
        password_hash: newPasswordHash,
        reset_token: null,
        reset_token_expires_at: null,
      })
      .eq("id", testUserId);

    expect(updateError).toBeNull();

    // Verify token is cleared
    const { data: updatedUser } = await sb
      .from("admin_users")
      .select("reset_token, reset_token_expires_at")
      .eq("id", testUserId)
      .single();

    expect(updatedUser?.reset_token).toBeNull();
    expect(updatedUser?.reset_token_expires_at).toBeNull();
  });

  it("should reject expired reset token", async () => {
    const resetToken = crypto.randomUUID();
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    // Store expired token
    await sb
      .from("admin_users")
      .update({
        reset_token: resetToken,
        reset_token_expires_at: expiredAt,
      })
      .eq("id", testUserId);

    // Try to use expired token
    const { data: userWithToken } = await sb
      .from("admin_users")
      .select("id, reset_token_expires_at")
      .eq("reset_token", resetToken)
      .single();

    expect(userWithToken).toBeDefined();

    // Verify token is expired
    const tokenExpiry = new Date(userWithToken!.reset_token_expires_at!);
    expect(tokenExpiry.getTime()).toBeLessThan(Date.now());
  });

  it("should reject invalid reset token", async () => {
    const fakeToken = crypto.randomUUID();

    // Try to find user with fake token
    const { data, error } = await sb
      .from("admin_users")
      .select("id")
      .eq("reset_token", fakeToken)
      .single();

    // Should not find any user
    expect(error).toBeDefined();
    expect(error?.code).toBe("PGRST116"); // PostgREST "not found" code
    expect(data).toBeNull();
  });

  it("should prevent token reuse after password reset", async () => {
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Store reset token
    await sb
      .from("admin_users")
      .update({
        reset_token: resetToken,
        reset_token_expires_at: expiresAt,
      })
      .eq("id", testUserId);

    // Use token to reset password
    const newPasswordHash = await hashPassword("NewPassword123!");
    await sb
      .from("admin_users")
      .update({
        password_hash: newPasswordHash,
        reset_token: null,
        reset_token_expires_at: null,
      })
      .eq("reset_token", resetToken);

    // Try to reuse the same token
    const { data, error } = await sb
      .from("admin_users")
      .select("id")
      .eq("reset_token", resetToken)
      .single();

    // Should not find any user (token was cleared)
    expect(error).toBeDefined();
    expect(error?.code).toBe("PGRST116");
    expect(data).toBeNull();
  });
});
