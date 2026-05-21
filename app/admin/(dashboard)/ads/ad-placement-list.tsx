"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";
import type { AdPlacementRow, AdPlacementType, AdProvider } from "@/types/database";

const PLACEMENT_TYPES: { value: AdPlacementType; label: string }[] = [
  { value: "sidebar", label: "Sidebar" },
  { value: "in_content", label: "In Content" },
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "between_posts", label: "Between Posts" },
];

const PROVIDERS: { value: AdProvider; label: string }[] = [
  { value: "adsense", label: "Google AdSense" },
  { value: "carbon", label: "Carbon Ads" },
  { value: "ethicalads", label: "EthicalAds" },
  { value: "custom", label: "Custom HTML" },
];

interface AdPlacementListProps {
  placements: AdPlacementRow[];
}

export function AdPlacementList({ placements }: AdPlacementListProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [placementType, setPlacementType] = useState<AdPlacementType>("sidebar");
  const [provider, setProvider] = useState<AdProvider>("adsense");
  const [adCode, setAdCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(0);

  function resetForm() {
    setName("");
    setPlacementType("sidebar");
    setProvider("adsense");
    setAdCode("");
    setIsActive(true);
    setPriority(0);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(ad: AdPlacementRow) {
    setName(ad.name);
    setPlacementType(ad.placement_type);
    setProvider(ad.provider);
    setAdCode(ad.ad_code ?? "");
    setIsActive(ad.is_active);
    setPriority(ad.priority);
    setEditingId(ad.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      placement_type: placementType,
      provider,
      ad_code: adCode || null,
      config: {},
      is_active: isActive,
      priority,
    };

    try {
      const url = editingId ? `/api/admin/ads/${editingId}` : "/api/admin/ads";
      const method = editingId ? "PUT" : "POST";

      const res = await fetchWithCsrf(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingId ? "Ad placement updated" : "Ad placement created");
        resetForm();
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to save ad placement");
    }
    setSaving(false);
  }

  async function handleDeleteConfirmed(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);

    try {
      const res = await fetchWithCsrf(`/api/admin/ads/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Ad placement deleted");
        router.refresh();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete ad placement");
    }
    setDeletingId(null);
  }

  async function handleToggleActive(ad: AdPlacementRow) {
    const res = await fetchWithCsrf(`/api/admin/ads/${ad.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !ad.is_active }),
    });

    if (res.ok) {
      toast.success(ad.is_active ? "Ad deactivated" : "Ad activated");
      router.refresh();
    } else {
      toast.error("Failed to toggle status");
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New Ad Placement
        </button>
      </div>

      {/* Placement type visual diagram */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Placement Guide</h3>
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-blue-400" /> Header
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-purple-400" /> Sidebar
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-400" /> In Content
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-orange-400" /> Between Posts
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-400" /> Footer
          </div>
        </div>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {editingId ? "Edit Ad Placement" : "New Ad Placement"}
          </h3>
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ad-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="ad-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. sidebar-top, in-content-1"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="ad-placement-type"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Placement Type
                </label>
                <select
                  id="ad-placement-type"
                  value={placementType}
                  onChange={(e) => setPlacementType(e.target.value as AdPlacementType)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PLACEMENT_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ad-provider"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Provider
                </label>
                <select
                  id="ad-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as AdProvider)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="ad-priority"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Priority
                </label>
                <input
                  id="ad-priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Lower numbers appear first</p>
              </div>
            </div>

            <div>
              <label htmlFor="ad-code" className="mb-1 block text-sm font-medium text-gray-700">
                Ad Code / Snippet
              </label>
              <textarea
                id="ad-code"
                value={adCode}
                onChange={(e) => setAdCode(e.target.value)}
                rows={5}
                placeholder="Paste your ad code (HTML/JS snippet) here..."
                className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Active
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {placements.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No ad placements configured yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Create ad placements for sites with &quot;ads&quot; or &quot;both&quot; monetization
            type.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {placements.map((ad) => (
              <div key={ad.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-medium text-gray-900">{ad.name}</h3>
                  <button
                    onClick={() => {
                      void handleToggleActive(ad);
                    }}
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      ad.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {ad.is_active ? "Active" : "Inactive"}
                  </button>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                    {ad.placement_type}
                  </span>
                  <span>{ad.provider}</span>
                  <span className="text-xs text-gray-500">Priority: {ad.priority}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(ad)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(ad.id)}
                    disabled={deletingId === ad.id}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === ad.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Type</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Provider</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Priority</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {placements.map((ad) => (
                  <tr key={ad.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ad.name}</td>
                    <td className="px-4 py-3 text-gray-500">{ad.placement_type}</td>
                    <td className="px-4 py-3 text-gray-500">{ad.provider}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          void handleToggleActive(ad);
                        }}
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          ad.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {ad.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{ad.priority}</td>
                    <td className="flex gap-2 px-4 py-3">
                      <button
                        onClick={() => startEdit(ad)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(ad.id)}
                        disabled={deletingId === ad.id}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === ad.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Ad Placement</h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete this ad placement? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleDeleteConfirmed(confirmDeleteId);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
