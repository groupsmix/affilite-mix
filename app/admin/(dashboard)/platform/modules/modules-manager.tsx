"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ModuleInfo {
  key: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
  dependencies: string[];
  is_enabled: boolean;
  config: Record<string, unknown>;
  site_module_id: string | null;
}

interface SiteOption {
  id: string;
  slug: string;
  name: string;
  db_id?: string;
  source: string;
}

const categoryLabels: Record<string, string> = {
  content: "Content",
  commerce: "Commerce",
  engagement: "Engagement",
  tools: "Tools",
  seo: "SEO",
};

export function ModulesManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  const loadModules = useCallback(async () => {
    if (!selectedSiteId) return;
    const res = await fetch(`/api/admin/modules?site_id=${selectedSiteId}`);
    if (res.ok) {
      const data = await res.json();
      setModules(data.modules);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (selectedSiteId) {
      void loadModules();
    }
  }, [selectedSiteId, loadModules]);

  async function toggleModule(moduleKey: string, enabled: boolean) {
    setSaving(moduleKey);
    setError("");

    const res = await fetchWithCsrf("/api/admin/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: selectedSiteId,
        module_key: moduleKey,
        is_enabled: enabled,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update module");
    } else {
      await loadModules();
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

  // Group modules by category
  const grouped: Record<string, ModuleInfo[]> = {};
  for (const mod of modules) {
    if (!grouped[mod.category]) grouped[mod.category] = [];
    grouped[mod.category].push(mod);
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

      {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Module groups */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, mods]) => (
          <div key={category} className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {categoryLabels[category] ?? category}
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {mods.map((mod) => (
                <div key={mod.key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{mod.name}</p>
                      {mod.defaultEnabled && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          default
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{mod.description}</p>
                    {mod.dependencies.length > 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        Depends on: {mod.dependencies.join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleModule(mod.key, !mod.is_enabled);
                    }}
                    disabled={saving === mod.key}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                      mod.is_enabled ? "bg-blue-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={mod.is_enabled}
                    aria-label={`Toggle ${mod.name}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        mod.is_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
