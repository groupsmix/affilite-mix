"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { AffiliateNetworkConfig, AvailableNetwork } from "./page";

interface Props {
  configured: AffiliateNetworkConfig[];
  available: AvailableNetwork[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}

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
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this network configuration?")) return;
    try {
      await fetchWithCsrf("/api/admin/affiliate-networks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      void onRefresh();
    } catch {
      setError("Failed to delete");
    }
  }

  const configuredNetworkKeys = new Set(configured.map((c) => c.network));

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
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
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : configured.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">
            No affiliate networks configured yet. Add one below.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {configured.map((net) => (
              <div key={net.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{net.meta?.name ?? net.network}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      net.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {net.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{net.meta?.description}</p>
                <p className="mt-2 text-xs text-gray-400">
                  <strong>Best for:</strong> {net.meta?.bestFor}
                </p>
                {net.publisher_id && (
                  <p className="mt-1 text-xs text-gray-400">
                    <strong>Publisher ID:</strong> {net.publisher_id}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      void handleDelete(net.id);
                    }}
                    className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Add Network"}
        </button>

        {showForm && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <h3 className="font-semibold text-blue-900">Add Affiliate Network</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Network</label>
                <select
                  value={formNetwork}
                  onChange={(e) => setFormNetwork(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {available
                    .filter((n) => !configuredNetworkKeys.has(n.network))
                    .map((n) => (
                      <option key={n.network} value={n.network}>
                        {n.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Publisher ID</label>
                <input
                  type="text"
                  value={formPublisherId}
                  onChange={(e) => setFormPublisherId(e.target.value)}
                  placeholder="Your publisher/partner ID"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  API Key (env var name)
                </label>
                <input
                  type="text"
                  value={formApiKeyRef}
                  onChange={(e) => setFormApiKeyRef(e.target.value)}
                  placeholder="e.g. CJ_API_KEY"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={() => {
                void handleSave();
              }}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Network"}
            </button>
          </div>
        )}
      </div>

      {/* Available networks reference */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Available Networks</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Network</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Best For</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Env Variable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {available.map((net) => (
                <tr key={net.network}>
                  <td className="px-4 py-2 font-medium text-gray-900">{net.name}</td>
                  <td className="px-4 py-2 text-gray-500">{net.bestFor}</td>
                  <td className="px-4 py-2">
                    {configuredNetworkKeys.has(net.network) ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Configured
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Not configured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{net.envKeyName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
