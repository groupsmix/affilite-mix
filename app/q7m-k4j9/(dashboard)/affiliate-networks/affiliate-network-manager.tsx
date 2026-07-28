"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { NETWORK_CONFIGS } from "@/lib/affiliate/networks";
import type { AffiliateNetworkConfig, AvailableNetwork } from "./page";

interface Props {
  configured: AffiliateNetworkConfig[];
  available: AvailableNetwork[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}

/**
 * F-019 (rc4 catalogRendersEmpty): the affiliate-network catalog is app-defined
 * (`NETWORK_CONFIGS`). When the DB-derived `available` list is momentarily empty
 * (registry unseeded / fetch returned nothing), fall back to the static catalog
 * so the "Available Networks" reference table always renders its registered
 * networks instead of an empty table.
 */
const STATIC_AVAILABLE_NETWORKS: AvailableNetwork[] = Object.values(NETWORK_CONFIGS).map((n) => ({
  network: n.network,
  name: n.name,
  description: n.description,
  bestFor: n.bestFor,
  baseUrl: n.baseUrl,
  requiresApiKey: n.requiresApiKey,
  envKeyName: n.envKeyName,
}));

export function AffiliateNetworkManager({ configured, available, loading, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formNetwork, setFormNetwork] = useState("cj");
  const [formPublisherId, setFormPublisherId] = useState("");
  const [formApiKeyRef, setFormApiKeyRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/admin/affiliate-networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: formNetwork,
          publisher_id: formPublisherId,
          api_key_ref: formApiKeyRef,
          is_active: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      setSuccessMsg("Network saved!");
      setShowForm(false);
      setFormPublisherId("");
      setFormApiKeyRef("");
      void onRefresh();
    } catch {
      // fail-open: best-effort
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this network configuration?")) return;
    setError(null);
    try {
      // T3-F7: check res.ok — a non-OK response previously fell through to
      // onRefresh() as if the delete succeeded; only a thrown network error
      // surfaced the catch block.
      const res = await fetchWithCsrf("/api/admin/affiliate-networks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        // R15.1 / R15.4: surface the server-provided error message when present,
        // otherwise fall back to a generic delete-failure message. The target
        // item is retained because onRefresh() is not called on a non-OK
        // response (the list is sourced from props).
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Failed to delete");
        return;
      }
      // R15.2: clear any existing error and treat the delete as a success,
      // refreshing the list so the removed item disappears.
      setError(null);
      void onRefresh();
    } catch {
      // R15.5: a network failure (fetchWithCsrf rejects / no response) must
      // surface an error rather than silently dropping out of the handler, and
      // the item must remain in the list (onRefresh is not called).
      setError("The delete could not be completed. Please try again.");
    }
  }

  function isPlaceholderNetwork(c: AffiliateNetworkConfig): boolean {
    const pid = c.publisher_id?.trim().toLowerCase() ?? "";
    return (
      pid.length === 0 ||
      pid === "partner123" ||
      pid === "example" ||
      pid === "placeholder" ||
      pid === "test"
    );
  }

  const visibleConfigured = configured.filter((c) => !isPlaceholderNetwork(c));
  const configuredNetworkKeys = new Set(visibleConfigured.map((c) => c.network));

  // Always render the app-defined catalog: use the DB-derived list when present,
  // otherwise fall back to the static `NETWORK_CONFIGS` catalog.
  const availableNetworks = available.length > 0 ? available : STATIC_AVAILABLE_NETWORKS;

  const selectedNetwork = availableNetworks.find((n) => n.network === formNetwork);
  const selectedRequiresApiKey = selectedNetwork?.requiresApiKey ?? false;

  return (
    <div className="space-y-4">
      {/* What configuring a network does — set expectations honestly. */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-3 text-sm text-gray-600 dark:text-gray-400">
        <p>
          <strong className="text-gray-800 dark:text-gray-200">How this works:</strong> your product
          links are set <strong>per product</strong> (each product&rsquo;s affiliate URL) and are
          served through the tracked <code className="rounded bg-muted px-1">/r/</code> redirect.
          Registering a network here does <strong>not</strong> rewrite those links — it records
          which networks you use and, for supported networks, enables automated commission-report
          imports. A network&rsquo;s link domain must be on the affiliate allow-list for its links
          to work.
        </p>
      </div>
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-300">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Configured networks */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Active Networks</h2>
        {loading ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : visibleConfigured.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 py-8 text-center text-gray-500 dark:text-gray-400">
            No affiliate networks configured yet. Add one below.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleConfigured.map((net) => (
              <div
                key={net.id}
                className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {net.meta?.name ?? net.network}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      net.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {net.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {net.meta?.description}
                </p>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-600">
                  <strong>Best for:</strong> {net.meta?.bestFor}
                </p>
                {net.publisher_id && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">
                    <strong>Publisher ID:</strong> {net.publisher_id}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      void handleDelete(net.id);
                    }}
                    className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add network form */}
      <div>
        <button
          onClick={() => {
            setShowForm(!showForm);
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Add Network"}
        </button>

        {showForm && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
            <h3 className="font-semibold text-blue-900">Add Affiliate Network</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Network
                </label>
                <select
                  value={formNetwork}
                  onChange={(e) => setFormNetwork(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
                >
                  {availableNetworks
                    .filter((n) => !configuredNetworkKeys.has(n.network))
                    .map((n) => (
                      <option key={n.network} value={n.network}>
                        {n.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Publisher ID
                </label>
                <input
                  type="text"
                  value={formPublisherId}
                  onChange={(e) => setFormPublisherId(e.target.value)}
                  placeholder="Your publisher/partner ID"
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
                />
              </div>
              {selectedRequiresApiKey && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Commission-report key (Worker secret name)
                  </label>
                  <input
                    type="text"
                    value={formApiKeyRef}
                    onChange={(e) => setFormApiKeyRef(e.target.value)}
                    placeholder={selectedNetwork?.envKeyName || "e.g. CJ_API_KEY"}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">
                    Optional. Only used by the commission-report importer. Enter the <em>name</em>{" "}
                    of the Worker secret that holds the API key (e.g.{" "}
                    <code className="rounded bg-muted px-1">{selectedNetwork?.envKeyName}</code>) —
                    never paste the key itself here.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                void handleSave();
              }}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Network"}
            </button>
          </div>
        )}
      </div>

      {/* Available networks reference */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Available Networks</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                  Network
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                  Best For
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                  Commission import
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:bg-gray-900">
              {availableNetworks.map((net) => (
                <tr key={net.network}>
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {net.name}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{net.bestFor}</td>
                  <td className="px-4 py-2">
                    {configuredNetworkKeys.has(net.network) ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Configured
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        Not configured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {net.requiresApiKey ? net.envKeyName : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
