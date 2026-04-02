"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface FeatureFlag {
  id: string;
  site_id: string;
  flag_key: string;
  is_enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

interface SiteOption {
  id: string;
  slug: string;
  name: string;
  db_id?: string;
  source: string;
}

export function FeatureFlagsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");

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

  const loadFlags = useCallback(async () => {
    if (!selectedSiteId) return;
    const res = await fetch(`/api/admin/feature-flags?site_id=${selectedSiteId}`);
    if (res.ok) {
      const data = await res.json();
      setFlags(data.flags);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (selectedSiteId) {
      loadFlags();
    }
  }, [selectedSiteId, loadFlags]);

  async function toggleFlag(flagKey: string, enabled: boolean) {
    setSaving(flagKey);
    setError("");

    const res = await fetchWithCsrf("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: selectedSiteId,
        flag_key: flagKey,
        is_enabled: enabled,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update feature flag");
    } else {
      await loadFlags();
    }
    setSaving(null);
  }

  async function addFlag() {
    if (!newFlagKey.trim()) return;
    setSaving("new");
    setError("");

    const res = await fetchWithCsrf("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: selectedSiteId,
        flag_key: newFlagKey.trim(),
        is_enabled: false,
        description: newFlagDesc.trim(),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add feature flag");
    } else {
      setNewFlagKey("");
      setNewFlagDesc("");
      setShowAddForm(false);
      await loadFlags();
    }
    setSaving(null);
  }

  async function deleteFlag(flagKey: string) {
    setSaving(flagKey);
    const res = await fetchWithCsrf(
      `/api/admin/feature-flags?site_id=${selectedSiteId}&flag_key=${flagKey}`,
      { method: "DELETE" },
    );

    if (res.ok) {
      await loadFlags();
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-500">No database-managed sites found. Create a site first.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Site selector */}
      <div className="mb-6 flex items-end gap-4">
        <div>
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
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Flag
        </button>
      </div>

      {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Add flag form */}
      {showAddForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">New Feature Flag</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Flag Key</label>
              <input
                type="text"
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value)}
                placeholder="e.g. enable_dark_mode"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={newFlagDesc}
                onChange={(e) => setNewFlagDesc(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={addFlag}
              disabled={saving === "new"}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving === "new" ? "Adding..." : "Add Flag"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Flags list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {flags.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No feature flags configured for this site.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{flag.flag_key}</p>
                  {flag.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{flag.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFlag(flag.flag_key, !flag.is_enabled)}
                    disabled={saving === flag.flag_key}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                      flag.is_enabled ? "bg-blue-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={flag.is_enabled}
                    aria-label={`Toggle ${flag.flag_key}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        flag.is_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFlag(flag.flag_key)}
                    disabled={saving === flag.flag_key}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
