"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { resolveDefaultSiteId } from "@/lib/admin/default-site";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface RoleInfo {
  id: string;
  name: string;
  label: string;
  description: string;
  is_system: boolean;
}

interface PermissionInfo {
  id: string;
  feature: string;
  action: string;
  description: string;
}

interface SiteOption {
  id: string;
  slug: string;
  name: string;
  db_id?: string;
  source: string;
}

// Shape returned by listSiteUserRoles() (USER_SITE_ROLE_COLUMNS) via
// GET /api/admin/permissions?site_id=...
interface SiteUserRole {
  id: string;
  user_id: string;
  site_id: string;
  role_id: string;
  created_at: string;
}

interface AdminUserOption {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function PermissionsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // F-012: assign/revoke state.
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [assignments, setAssignments] = useState<SiteUserRole[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleName, setSelectedRoleName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sites");
      if (res.ok) {
        const data = await res.json();
        const dbSites = (data.sites as SiteOption[]).filter((s) => s.source === "database");
        setSites(dbSites);
        if (dbSites.length > 0 && !selectedSiteId) {
          // F-013 (rc4): default to the globally active site, falling back to the
          // first DB site only when there is no active site.
          const defaultId = await resolveDefaultSiteId(dbSites);
          if (defaultId) setSelectedSiteId(defaultId);
        }
      }
    } catch {
      // Network error — loading false so the UI unblocks; sites list stays empty.
    }
    setLoading(false);
  }, [selectedSiteId]);

  // F-012: load the admin users that can be granted a role.
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? (data as AdminUserOption[]) : [];
        setUsers(list);
      }
    } catch {
      // Network error — user list stays empty; assign form will show no options.
    }
  }, []);

  // M4: tracks the in-flight target site so a response that arrives after the
  // user switched sites is discarded instead of rendering under the wrong site.
  const activeSiteIdRef = useRef<string>("");

  const loadPermissions = useCallback(async () => {
    if (!selectedSiteId) return;
    const requestedSiteId = selectedSiteId;
    const res = await fetch(
      `/api/admin/permissions?site_id=${encodeURIComponent(requestedSiteId)}`,
    );
    // M4: drop a stale response if the active site changed while in flight.
    if (requestedSiteId !== activeSiteIdRef.current) return;
    if (res.ok) {
      const data = await res.json();
      setRoles(data.roles);
      setPermissions(data.permissions);
      // F-012: current site_user_roles for the selected site (may be absent).
      setAssignments(Array.isArray(data.site_user_roles) ? data.site_user_roles : []);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    void loadSites();
    void loadUsers();
  }, [loadSites, loadUsers]);

  useEffect(() => {
    activeSiteIdRef.current = selectedSiteId;
    if (selectedSiteId) {
      void loadPermissions();
    }
  }, [selectedSiteId, loadPermissions]);

  // F-012: assign a role to the selected user for the selected site.
  const handleAssign = useCallback(async () => {
    setActionError(null);
    setActionMessage(null);
    if (!selectedUserId || !selectedSiteId || !selectedRoleName) {
      setActionError("Select a user and a role first.");
      return;
    }
    setSubmitting(true);
    try {
      // BUG-1: must use fetchWithCsrf — bare fetch() gets rejected with
      // 403 "missing CSRF token" in production for all non-GET /api/ routes.
      const res = await fetchWithCsrf("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedUserId,
          site_id: selectedSiteId,
          role_name: selectedRoleName,
        }),
      });
      if (res.ok) {
        setActionMessage("Role assigned.");
        await loadPermissions();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Failed to assign role.");
      }
    } catch {
      setActionError("Failed to assign role.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedUserId, selectedSiteId, selectedRoleName, loadPermissions]);

  // F-012: revoke a user's role for the selected site.
  const handleRevoke = useCallback(
    async (userId: string) => {
      setActionError(null);
      setActionMessage(null);
      if (!userId || !selectedSiteId) {
        setActionError("Select a user first.");
        return;
      }
      setSubmitting(true);
      try {
        // BUG-1: must use fetchWithCsrf — bare fetch() gets rejected with
        // 403 "missing CSRF token" in production for all non-GET /api/ routes.
        const res = await fetchWithCsrf(
          `/api/admin/permissions?user_id=${encodeURIComponent(userId)}&site_id=${encodeURIComponent(selectedSiteId)}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setActionMessage("Role revoked.");
          await loadPermissions();
        } else {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error ?? "Failed to revoke role.");
        }
      } catch {
        setActionError("Failed to revoke role.");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedSiteId, loadPermissions],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Group permissions by feature
  const permsByFeature: Record<string, PermissionInfo[]> = {};
  for (const perm of permissions) {
    if (!permsByFeature[perm.feature]) permsByFeature[perm.feature] = [];
    permsByFeature[perm.feature]!.push(perm);
  }

  const usersById = new Map(users.map((u) => [u.id, u]));
  const rolesById = new Map(roles.map((r) => [r.id, r]));

  return (
    <div>
      {/* Site selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Site
        </label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="w-full max-w-xs rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {sites.map((site) => (
            <option key={site.db_id ?? site.id} value={site.db_id ?? site.id}>
              {site.name} ({site.slug ?? site.id})
            </option>
          ))}
        </select>
      </div>

      {/* F-012: Assign a role to a user */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Assign Role to User
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Grant or revoke a role for a user on the selected site.
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="permission-user-select"
                className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                User
              </label>
              <select
                id="permission-user-select"
                name="user_id"
                aria-label="Select user"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-56 rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="permission-role-select"
                className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                Role
              </label>
              <select
                id="permission-role-select"
                name="role_name"
                aria-label="Select role"
                value={selectedRoleName}
                onChange={(e) => setSelectedRoleName(e.target.value)}
                className="w-56 rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a role…</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.label} ({role.name})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={submitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign
            </button>
            <button
              type="button"
              onClick={() => void handleRevoke(selectedUserId)}
              disabled={submitting}
              className="rounded border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
          {actionError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>
          )}
          {actionMessage && <p className="mt-3 text-sm text-green-600">{actionMessage}</p>}
        </div>
      </div>

      {/* F-012: Current assignments for the selected site */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Current Assignments
          </h2>
        </div>
        {assignments.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No role assignments for this site yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {assignments.map((assignment) => {
              const user = usersById.get(assignment.user_id);
              const role = rolesById.get(assignment.role_id);
              return (
                <div key={assignment.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {user
                        ? user.name
                          ? `${user.name} (${user.email})`
                          : user.email
                        : assignment.user_id}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {role ? `${role.label} (${role.name})` : assignment.role_id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(assignment.user_id)}
                    disabled={submitting}
                    className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles reference */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Available Roles
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {roles.map((role) => (
            <div key={role.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{role.label}</p>
                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {role.name}
                </span>
                {role.is_system && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                    system
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions reference */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Permission Matrix
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Features and actions available in the permission system.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(permsByFeature).map(([feature, perms]) => (
            <div key={feature} className="px-5 py-3">
              <p className="mb-1 text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
                {feature}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {perms.map((perm) => (
                  <span
                    key={perm.id}
                    className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                    title={perm.description}
                  >
                    {perm.action}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sites.length === 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No database-managed sites found. Create a site first to manage permissions.
        </div>
      )}
    </div>
  );
}
