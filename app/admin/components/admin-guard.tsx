import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Server component guard: redirects to login if not authenticated.
 * Returns the admin session payload.
 */
export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}
