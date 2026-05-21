import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";

async function run() {
  const sb = getPrivilegedSupabaseClient();
  console.log("Running inactive admin offboarding (A182)...");
  
  // Disable admins who haven't had activity in 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data, error } = await sb
    .from("admin_users" as any)
    .update({ role: "inactive" })
    .lt("last_login", thirtyDaysAgo.toISOString())
    .neq("role", "inactive")
    .select();
    
  if (error) {
    console.error("Failed to offboard admins:", error.message);
    process.exit(1);
  }
  
  console.log(`Offboarded ${data.length} inactive admin accounts.`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
