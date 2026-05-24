#!/usr/bin/env node
/**
 * Reset admin password script
 * Usage: SUPABASE_SERVICE_ROLE_KEY=<key> NEXT_PUBLIC_SUPABASE_URL=<url> npx tsx scripts/reset-admin-password.ts <email> <new_password>
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: reset-admin-password.ts <email> <new_password>");
  process.exit(1);
}

const email = args[0];
const newPassword = args[1];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function resetPassword() {
  try {
    // Find the user
    const { data: user, error: findError } = await supabase
      .from("admin_users")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .single();

    if (findError || !user) {
      console.error(`Error: Admin user with email ${email} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email}`);

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update the password
    const { error: updateError } = await supabase
      .from("admin_users")
      .update({
        password_hash: passwordHash,
        login_failed_attempts: 0,
        login_locked_until: null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating password:", updateError);
      process.exit(1);
    }

    console.log(`✓ Password reset successfully for ${email}`);
    console.log(`\nNew credentials:`);
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${newPassword}`);
    console.log(`\nLogin at: https://wristnerd.xyz/admin/login`);
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
}

resetPassword();
