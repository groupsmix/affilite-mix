"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
}

interface UserSiteRole {
  id: string;
  user_id: string;
  site_id: string;
  role_id: string;
  created_at: string;
}

export function PermissionsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [assignments, setAssignments] = useState<UserSiteRole[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment form + mutation state
  const [formUserId, setFormUserId] = useState<string>("");
  const [formRoleName, setFormRoleName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      const data = await res.json();
      const dbSites = (data.sites as SiteOption[]).filter((s) => s.source === "database");
      setSites(dbSites);
      if (dbSites.length > 0 && !selectedSiteId) {
        setSelectedSiteId(dbSites[0]!.db_id ?? dbSites[0]!.id);
      }
    }
    setLoading(false);
  }, [selectedSiteId]);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = (await res.json()) as AdminUser[];
      setUsers(Array.isArray(data) ? data : []);
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
      setAssignments(data.site_user_roles ?? []);
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

  async function assignRole() {
    if (!selectedSiteId || !formUserId || !formRoleName) return;
    setSaving(true);
    setError("");

    const res = await fetchWithCsrf("/api/admin/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: formUserId,
        site_id: selectedSiteId,
        role_name: formRoleName,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to assign role");
    } else {
      setFormUserId("");
      setFormRoleName("");
      await loadPermissions();
    }
    setSaving(false);
  }

  async function removeAssignment(userId: string) {
    setRemoving(userId);
    setError("");

    const res = await fetchWithCsrf(
      `/api/admin/permissions?user_id=${encodeURIComponent(userId)}&site_id=${encodeURIComponent(selectedSiteId)}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove role");
    } else {
      await loadPermissions();
    }
    setRemoving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  // Lookup maps for rendering assignments by user email + role label.
  const usersById = new Map(users.map((u) => [u.id, u]));
  const rolesById = new Map(roles.map((r) => [r.id, r]));

  // Group permissions by feature
  const permsByFeature: Record<string, PermissionInfo[]> = {};
  for (const perm of permissions) {
    if (!permsByFeature[perm.feature]) permsByFeature[perm.feature] = [];
    permsByFeature[perm.feature]!.push(perm);
  }

  return (
    <div>
      {/* Site selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">Select Site</label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="w-full max-w-xs rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {sites.map((site) => (
            <option key={site.db_id ?? site.id} value={site.db_id ?? site.id}>
              {site.name} ({site.slug ?? site.id})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Role assignments — the actual management surface */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Role Assignments</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Who has which role on this site. Super admins and owners bypass these checks.
            </p>
          </div>
        </div>

        {/* Assign form */}
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-gray-600">User</label>
            <select
              value={formUserId}
              onChange={(e) => setFormUserId(e.target.value)}
              className="w-56 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                  {u.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-gray-600">Role</label>
            <select
              value={formRoleName}
              onChange={(e) => setFormRoleName(e.target.value)}
              className="w-56 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void assignRole()}
            disabled={saving || !formUserId || !formRoleName}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Assigning…" : "Assign role"}
          </button>
        </div>

        {/* Assignment list */}
        {assignments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            No role assignments for this site yet. Assign one above.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {assignments.map((a) => {
              const user = usersById.get(a.user_id);
              const role = rolesById.get(a.role_id);
              return (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user?.email ?? a.user_id}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {role?.label ?? "Unknown role"}
                      </span>
                      {role && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {role.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeAssignment(a.user_id)}
                    disabled={removing === a.user_id}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {removing === a.user_id ? "Removing…" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles reference */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Available Roles</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {roles.map((role) => (
            <div key={role.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{role.label}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {role.name}
                </span>
                {role.is_system && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    system
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions reference */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Permission Matrix</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Features and actions available in the permission system.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(permsByFeature).map(([feature, perms]) => (
            <div key={feature} className="px-5 py-3">
              <p className="mb-1 text-sm font-medium capitalize text-gray-900">{feature}</p>
              <div className="flex flex-wrap gap-1.5">
                {perms.map((perm) => (
                  <span
                    key={perm.id}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
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
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No database-managed sites found. Create a site first to manage permissions.
        </div>
      )}
    </div>
  );
}
