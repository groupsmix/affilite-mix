"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { MODULE_REGISTRY } from "@/lib/module-registry";
import { resolveDefaultSiteId } from "@/lib/admin/default-site";

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

/**
 * F-018 (rc4): the static, app-defined module catalog. When the per-site
 * `GET /api/admin/modules` fetch fails (e.g. DB unavailable), the region below
 * the site selector must NOT render blank — we fall back to this seeded
 * `MODULE_REGISTRY` so every available module still renders (with its default
 * enabled state) alongside an explicit error banner.
 */
function registryFallbackModules(): ModuleInfo[] {
  return MODULE_REGISTRY.map((def) => ({
    key: def.key,
    name: def.name,
    description: def.description,
    category: def.category,
    defaultEnabled: def.defaultEnabled,
    dependencies: [...def.dependencies],
    is_enabled: false,
    config: {},
    site_module_id: null,
  }));
}

interface ModulesManagerProps {
  siteId?: string;
}

export function ModulesManager({ siteId }: ModulesManagerProps) {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(siteId ?? "");
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(!siteId);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      const data = await res.json();
      const dbSites = (data.sites as SiteOption[]).filter(
        (s) => s.source === "database" || s.source === "config",
      );
      setSites(dbSites);
      if (dbSites.length > 0 && !selectedSiteId) {
        // F-013 (rc4): default to the globally active site, falling back to the
        // first DB site only when there is no active site.
        const defaultId = await resolveDefaultSiteId(dbSites);
        if (defaultId) setSelectedSiteId(defaultId);
      }
    }
    setLoading(false);
  }, [selectedSiteId]);

  // M4: tracks the in-flight target site so a response that arrives after the
  // user switched sites is discarded instead of rendering under the wrong site.
  const activeSiteIdRef = useRef<string>(siteId ?? "");

  const loadModules = useCallback(async () => {
    if (!selectedSiteId) return;
    const requestedSiteId = selectedSiteId;
    setModulesLoading(true);
    setModulesError("");
    try {
      const res = await fetch(`/api/admin/modules?site_id=${encodeURIComponent(requestedSiteId)}`);
      // M4: drop a stale response if the active site changed while in flight.
      if (requestedSiteId !== activeSiteIdRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules);
      } else {
        // F-018: never render blank below the selector — fall back to the
        // seeded static catalog and surface an explicit error state.
        setModules(registryFallbackModules());
        setModulesError(
          "Couldn't load this site's module settings. Showing the default module catalog.",
        );
      }
    } catch {
      if (requestedSiteId !== activeSiteIdRef.current) return;
      setModules(registryFallbackModules());
      setModulesError(
        "Couldn't load this site's module settings. Showing the default module catalog.",
      );
    } finally {
      if (requestedSiteId === activeSiteIdRef.current) setModulesLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    if (siteId) return;
    void loadSites();
  }, [loadSites, siteId]);

  useEffect(() => {
    if (siteId && siteId !== selectedSiteId) {
      setSelectedSiteId(siteId);
      activeSiteIdRef.current = siteId;
      return;
    }
    activeSiteIdRef.current = selectedSiteId;
    if (selectedSiteId) {
      void loadModules();
    }
  }, [selectedSiteId, loadModules, siteId]);

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

  if (!siteId && loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!siteId && sites.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No database-managed sites found. Create a site first.
        </p>
      </div>
    );
  }

  // Group modules by category
  const grouped: Record<string, ModuleInfo[]> = {};
  for (const mod of modules) {
    if (!grouped[mod.category]) grouped[mod.category] = [];
    grouped[mod.category]!.push(mod);
  }

  return (
    <div>
      {!siteId && (
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
      )}

      {error && (
        <div className="mb-4 rounded bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* F-018: explicit error state — the static catalog still renders below. */}
      {modulesError && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
          {modulesError}
        </div>
      )}

      {/* Post-selector region: loading → empty → module groups. */}
      {modulesLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading modules...</div>
        </div>
      ) : modules.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No modules available for this site.</p>
        </div>
      ) : (
        /* Module groups */
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, mods]) => (
            <div
              key={category}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
            >
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {categoryLabels[category] ?? category}
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {mods.map((mod) => (
                  <div key={mod.key} className="flex items-center justify-between px-5 py-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {mod.name}
                        </p>
                        {mod.defaultEnabled && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                            default
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {mod.description}
                      </p>
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
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-900 shadow ring-0 transition duration-200 ease-in-out ${
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
      )}
    </div>
  );
}
