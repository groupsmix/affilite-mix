"use client";

import { useState, useEffect, useCallback } from "react";

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

export function PermissionsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      const data = await res.json();
      const dbSites = (data.sites as SiteOption[]).filter((s) => s.source === "database");
      setSites(dbSites);
      if (dbSites.length > 0 && !selectedSiteId) {
        setSelectedSiteId(dbSites[0].db_id ?? dbSites[0].id);
      }
    }
    setLoading(false);
  }, [selectedSiteId]);

  const loadPermissions = useCallback(async () => {
    if (!selectedSiteId) return;
    const res = await fetch(`/api/admin/permissions?site_id=${selectedSiteId}`);
    if (res.ok) {
      const data = await res.json();
      setRoles(data.roles);
      setPermissions(data.permissions);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (selectedSiteId) {
      void loadPermissions();
    }
  }, [selectedSiteId, loadPermissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  // Group permissions by feature
  const permsByFeature: Record<string, PermissionInfo[]> = {};
  for (const perm of permissions) {
    if (!permsByFeature[perm.feature]) permsByFeature[perm.feature] = [];
    permsByFeature[perm.feature].push(perm);
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
