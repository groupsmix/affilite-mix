/**
 * F-011: RLS Policy Verification Script
 *
 * This script queries pg_policies to provide evidence of the current
 * RLS state for audit purposes. It checks whether policies include
 * tenant filtering (site_id) or are just service-role passthrough.
 *
 * Usage:
 *   npx tsx scripts/verify-rls-policies.ts
 *
 * Expected output for F-011 evidence:
 * - List of all RLS policies on tenant tables
 * - Whether each policy includes site_id filtering
 * - Classification as "service-role-passthrough" vs "tenant-filtered"
 */

import { createClient } from "@supabase/supabase-js";

interface PolicyInfo {
  schemaname: string;
  tablename: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
  has_site_id_filter: boolean;
  classification: "tenant-filtered" | "service-role-passthrough" | "anon-only";
}

async function verifyRLSPolicies(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<PolicyInfo[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Query all RLS policies
  const { data: policies, error } = await supabase.rpc("get_all_rls_policies", {
    // This RPC would need to be created, or we use a direct query
  });

  // For now, use the pg_policies view directly
  const { data: pgPolicies, error: pgError } = await supabase
    .from("pg_policies")
    .select("*")
    .order("tablename", "policyname");

  if (pgError) {
    console.error("Failed to query pg_policies:", pgError);
    throw pgError;
  }

  // Classify each policy
  const classifiedPolicies: PolicyInfo[] = (pgPolicies || []).map((policy: any) => {
    const qual = policy.qual || "";
    const withCheck = policy.with_check || "";
    const combined = `${qual} ${withCheck}`.toLowerCase();

    // Check if policy includes site_id filtering
    const hasSiteIdFilter =
      combined.includes("site_id") ||
      combined.includes("current_setting") ||
      combined.includes("auth.uid") ||
      combined.includes("auth.email");

    // Classify the policy
    let classification: PolicyInfo["classification"];
    if (combined.includes("service_role")) {
      classification = "service-role-passthrough";
    } else if (combined.includes("anon") || combined.includes("authenticated")) {
      classification = "anon-only";
    } else {
      classification = "tenant-filtered";
    }

    return {
      schemaname: policy.schemaname,
      tablename: policy.tablename,
      policyname: policy.policyname,
      qual: policy.qual,
      with_check: policy.with_check,
      has_site_id_filter,
      classification,
    };
  });

  return classifiedPolicies;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment variables");
    console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log("F-011: RLS Policy Verification");
  console.log("=".repeat(80));
  console.log();

  try {
    const policies = await verifyRLSPolicies(supabaseUrl, serviceRoleKey);

    console.log(`Found ${policies.length} RLS policies\n`);

    // Group by table
    const byTable = policies.reduce((acc, policy) => {
      const key = `${policy.schemaname}.${policy.tablename}`;
      if (!acc[key]) acc[key] = [];
      acc[key]!.push(policy);
      return acc;
    }, {} as Record<string, PolicyInfo[]>);

    // Print findings
    let passthroughCount = 0;
    let tenantFilteredCount = 0;

    for (const [table, tablePolicies] of Object.entries(byTable)) {
      console.log(`Table: ${table}`);
      console.log("-".repeat(80));

      for (const policy of tablePolicies) {
        const icon = policy.classification === "tenant-filtered" ? "✓" : "⚠";
        console.log(`  ${icon} ${policy.policyname}`);
        console.log(`     Classification: ${policy.classification}`);
        console.log(`     Has site_id filter: ${policy.has_site_id_filter ? "Yes" : "No"}`);
        if (policy.qual) {
          console.log(`     USING: ${policy.qual.substring(0, 100)}${policy.qual.length > 100 ? "..." : ""}`);
        }
        if (policy.with_check) {
          console.log(`     WITH CHECK: ${policy.with_check.substring(0, 100)}${policy.with_check.length > 100 ? "..." : ""}`);
        }
        console.log();

        if (policy.classification === "service-role-passthrough") {
          passthroughCount++;
        } else if (policy.classification === "tenant-filtered") {
          tenantFilteredCount++;
        }
      }
    }

    console.log("=".repeat(80));
    console.log("Summary");
    console.log("=".repeat(80));
    console.log(`Total policies: ${policies.length}`);
    console.log(`Service-role passthrough: ${passthroughCount}`);
    console.log(`Tenant-filtered: ${tenantFilteredCount}`);
    console.log();

    if (passthroughCount > 0) {
      console.log("⚠️  WARNING: Found service-role passthrough policies");
      console.log("   These policies do not enforce tenant isolation at the DB level.");
      console.log("   Tenant isolation relies entirely on application-layer guards.");
      console.log();
      console.log("   Evidence for F-011: RLS is NOT defense-in-depth today.");
    } else {
      console.log("✓ All policies include tenant filtering");
      console.log("  RLS provides defense-in-depth tenant isolation.");
    }

    // Output JSON for automated evidence collection
    console.log();
    console.log("=".repeat(80));
    console.log("JSON Evidence (copy for audit report)");
    console.log("=".repeat(80));
    console.log(JSON.stringify({ policies, summary: { total: policies.length, passthroughCount, tenantFilteredCount } }, null, 2));
  } catch (error) {
    console.error("Verification failed:", error);
    process.exit(1);
  }
}

// For local testing without Supabase connection, provide mock data
if (process.env.MOCK_RLS_VERIFICATION === "true") {
  console.log("MOCK MODE: Using sample data from migration 00003_rls_defense_in_depth.sql");
  console.log();

  const mockPolicies: PolicyInfo[] = [
    {
      schemaname: "public",
      tablename: "categories",
      policyname: "service_full_access_categories",
      qual: "auth.role() = 'service_role'",
      with_check: "auth.role() = 'service_role'",
      has_site_id_filter: false,
      classification: "service-role-passthrough",
    },
    {
      schemaname: "public",
      tablename: "products",
      policyname: "service_full_access_products",
      qual: "auth.role() = 'service_role'",
      with_check: "auth.role() = 'service_role'",
      has_site_id_filter: false,
      classification: "service-role-passthrough",
    },
    {
      schemaname: "public",
      tablename: "content",
      policyname: "service_full_access_content",
      qual: "auth.role() = 'service_role'",
      with_check: "auth.role() = 'service_role'",
      has_site_id_filter: false,
      classification: "service-role-passthrough",
    },
    {
      schemaname: "public",
      tablename: "affiliate_clicks",
      policyname: "service_full_access_clicks",
      qual: "auth.role() = 'service_role'",
      with_check: "auth.role() = 'service_role'",
      has_site_id_filter: false,
      classification: "service-role-passthrough",
    },
    {
      schemaname: "public",
      tablename: "audit_log",
      policyname: "service_full_access_audit_log",
      qual: "auth.role() = 'service_role'",
      with_check: "auth.role() = 'service_role'",
      has_site_id_filter: false,
      classification: "service-role-passthrough",
    },
  ];

  console.log("=".repeat(80));
  console.log("F-011: RLS Policy Verification (MOCK DATA)");
  console.log("=".repeat(80));
  console.log();

  let passthroughCount = 0;
  for (const policy of mockPolicies) {
    const icon = policy.classification === "tenant-filtered" ? "✓" : "⚠";
    console.log(`${icon} ${policy.tablename}.${policy.policyname}`);
    console.log(`   Classification: ${policy.classification}`);
    console.log(`   Has site_id filter: ${policy.has_site_id_filter ? "Yes" : "No"}`);
    console.log(`   USING: ${policy.qual}`);
    console.log();
    if (policy.classification === "service-role-passthrough") passthroughCount++;
  }

  console.log("=".repeat(80));
  console.log("Summary");
  console.log("=".repeat(80));
  console.log(`Total policies: ${mockPolicies.length}`);
  console.log(`Service-role passthrough: ${passthroughCount}`);
  console.log(`Tenant-filtered: 0`);
  console.log();
  console.log("⚠️  EVIDENCE FOR F-011: All tenant table policies are service-role passthrough.");
  console.log("   RLS does NOT provide defense-in-depth tenant isolation.");
  console.log("   Tenant isolation relies entirely on application-layer guards (F-002).");
  console.log();
  console.log("JSON Evidence:");
  console.log(JSON.stringify({ policies: mockPolicies, summary: { total: mockPolicies.length, passthroughCount, tenantFilteredCount: 0 } }, null, 2));
} else {
  main();
}
