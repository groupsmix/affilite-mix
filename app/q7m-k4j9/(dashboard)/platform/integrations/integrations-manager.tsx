"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { STATIC_INTEGRATION_PROVIDERS } from "@/lib/integrations/provider-catalog";
import { resolveDefaultSiteId } from "@/lib/admin/default-site";

interface IntegrationInfo {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  is_builtin: boolean;
  is_enabled: boolean;
  site_config: Record<string, unknown>;
  site_integration_id: string | null;
}

interface SiteOption {
  id: string;
  slug: string;
  name: string;
  db_id?: string;
  source: string;
}

const categoryLabels: Record<string, string> = {
  affiliate_network: "Affiliate Networks",
  analytics: "Analytics",
  email: "Email Marketing",
  storage: "Storage",
  bot_protection: "Bot Protection",
  search: "Search",
  cdn: "CDN",
  other: "Other",
};

export function IntegrationsManager() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
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
  const activeSiteIdRef = useRef<string>("");

  const loadIntegrations = useCallback(async () => {
    if (!selectedSiteId) return;
    const requestedSiteId = selectedSiteId;
    // L5: encode the site id in the query string.
    const res = await fetch(
      `/api/admin/integrations?site_id=${encodeURIComponent(requestedSiteId)}`,
    );
    // M4: drop a stale response if the active site changed while in flight.
    if (requestedSiteId !== activeSiteIdRef.current) return;
    if (res.ok) {
      const data = await res.json();
      setIntegrations(data.integrations);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    activeSiteIdRef.current = selectedSiteId;
    if (selectedSiteId) {
      void loadIntegrations();
    }
  }, [selectedSiteId, loadIntegrations]);

  async function toggleIntegration(providerKey: string, enabled: boolean) {
    setSaving(providerKey);
    setError("");

    const res = await fetchWithCsrf("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: selectedSiteId,
        provider_key: providerKey,
        is_enabled: enabled,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update integration");
    } else {
      await loadIntegrations();
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No database-managed sites found. Create a site first.
        </p>
      </div>
    );
  }

  // F-019 (rc4 catalogRendersEmpty): Integrations is an app-defined static
  // catalog. When the DB registry is momentarily empty / unseeded (e.g.
  // migration 00028 not yet applied), fall back to the static provider catalog
  // so the page always renders the registered providers with their toggles
  // instead of collapsing to "No integration providers available". Toggling a
  // static-fallback provider still posts against the selected site; the next
  // load reflects the persisted state once the registry is populated.
  const displayIntegrations: IntegrationInfo[] =
    integrations.length > 0
      ? integrations
      : STATIC_INTEGRATION_PROVIDERS.map((provider) => ({
          id: provider.key,
          key: provider.key,
          name: provider.name,
          category: provider.category,
          description: provider.description,
          is_builtin: provider.is_builtin,
          is_enabled: false,
          site_config: {},
          site_integration_id: null,
        }));

  // Group integrations by category
  const grouped: Record<string, IntegrationInfo[]> = {};
  for (const integ of displayIntegrations) {
    if (!grouped[integ.category]) grouped[integ.category] = [];
    grouped[integ.category]!.push(integ);
  }

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

      {error && (
        <div className="mb-4 rounded bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Integration groups */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, integs]) => (
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
              {integs.map((integ) => (
                <div key={integ.key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {integ.name}
                      </p>
                      {integ.is_builtin && (
                        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                          built-in
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {integ.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleIntegration(integ.key, !integ.is_enabled);
                    }}
                    disabled={saving === integ.key}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                      integ.is_enabled ? "bg-blue-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={integ.is_enabled}
                    aria-label={`Toggle ${integ.name}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-900 shadow ring-0 transition duration-200 ease-in-out ${
                        integ.is_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {displayIntegrations.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No integration providers available.
        </div>
      )}
    </div>
  );
}
