"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

/** A live feature backed by `sites.features` — toggling it gates the feature. */
interface LiveFeature {
  key: string;
  label: string;
  description: string;
  is_enabled: boolean;
}

/** A custom flag stored in `site_feature_flags` for a team's own code to read. */
interface CustomFlag {
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

function Toggle({
  enabled,
  disabled,
  onClick,
  label,
}: {
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? "bg-blue-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function FeatureFlagsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [features, setFeatures] = useState<LiveFeature[]>([]);
  const [flags, setFlags] = useState<CustomFlag[]>([]);
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
        setSelectedSiteId(dbSites[0]!.db_id ?? dbSites[0]!.id);
      }
    }
    setLoading(false);
  }, [selectedSiteId]);

  // M4: tracks the in-flight target site so a response that arrives after the
  // user switched sites is discarded instead of rendering under the wrong site.
  const activeSiteIdRef = useRef<string>("");

  const loadData = useCallback(async () => {
    if (!selectedSiteId) return;
    const requestedSiteId = selectedSiteId;
    const res = await fetch(
      `/api/admin/feature-flags?site_id=${encodeURIComponent(requestedSiteId)}`,
    );
    // M4: drop a stale response if the active site changed while in flight.
    if (requestedSiteId !== activeSiteIdRef.current) return;
    if (res.ok) {
      const data = await res.json();
      setFeatures(data.features ?? []);
      setFlags(data.flags ?? []);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    activeSiteIdRef.current = selectedSiteId;
    if (selectedSiteId) {
      void loadData();
    }
  }, [selectedSiteId, loadData]);

  async function setFlag(flagKey: string, enabled: boolean) {
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
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update feature flag");
    } else {
      await loadData();
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
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add feature flag");
    } else {
      setNewFlagKey("");
      setNewFlagDesc("");
      setShowAddForm(false);
      await loadData();
    }
    setSaving(null);
  }

  async function deleteFlag(flagKey: string) {
    setSaving(flagKey);
    const res = await fetchWithCsrf(
      // L5: encode both query params.
      `/api/admin/feature-flags?site_id=${encodeURIComponent(selectedSiteId)}&flag_key=${encodeURIComponent(flagKey)}`,
      { method: "DELETE" },
    );

    if (res.ok) {
      await loadData();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete feature flag");
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

      {/* Live site features */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Site Features</h2>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              live
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            These control real features on this site. Changes take effect within a few seconds of
            toggling.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {features.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{f.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{f.description}</p>
                <code className="mt-1 inline-block text-[11px] text-gray-400">
                  features.{f.key}
                </code>
              </div>
              <Toggle
                enabled={f.is_enabled}
                disabled={saving === f.key}
                onClick={() => void setFlag(f.key, !f.is_enabled)}
                label={`Toggle ${f.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Custom flags */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Custom Flags</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                stored only
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Arbitrary keys stored for your own code to read. They don&apos;t change the site on
              their own.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {showAddForm ? "Cancel" : "Add flag"}
          </button>
        </div>

        {showAddForm && (
          <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-gray-600">Flag key</label>
              <input
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value)}
                placeholder="e.g. experimental_checkout"
                className="w-56 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-gray-600">Description</label>
              <input
                value={newFlagDesc}
                onChange={(e) => setNewFlagDesc(e.target.value)}
                placeholder="Optional"
                className="w-64 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => void addFlag()}
              disabled={saving === "new" || !newFlagKey.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === "new" ? "Adding…" : "Add flag"}
            </button>
          </div>
        )}

        {flags.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            No custom flags for this site.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{flag.flag_key}</p>
                  {flag.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{flag.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Toggle
                    enabled={flag.is_enabled}
                    disabled={saving === flag.flag_key}
                    onClick={() => void setFlag(flag.flag_key, !flag.is_enabled)}
                    label={`Toggle ${flag.flag_key}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void deleteFlag(flag.flag_key);
                    }}
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
