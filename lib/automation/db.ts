// Automation control-plane DB access.
//
// The automation tables (automation_service_accounts / _tokens / _runs /
// _actions / _policies) are RLS-locked to service_role (migration
// 2026071505). The automation API gateway has no browser cookie, no
// x-site-id header and no admin session — it authenticates a bearer token
// and then reads/writes these global control-plane tables on behalf of a
// single site. A tenant-scoped client therefore returns zero rows / is
// RLS-denied, mirroring lib/dal/admin-api-tokens.ts.
//
// This module is the SINGLE sanctioned importer of the privileged gateway
// for the automation subsystem, so it is the only automation file on the
// SERVICE_ROLE_IMPORT_ALLOWLIST. Every automation DAL + route reaches the
// privileged client through here, after the route layer has already
// authenticated + scope-checked the bearer token.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import type { DalClientGetter } from "@/lib/dal/dal-client";

/** Privileged client getter for the automation control plane. */
export const getAutomationDbClient: DalClientGetter = () =>
  getPrivilegedSupabaseClient("automation");
