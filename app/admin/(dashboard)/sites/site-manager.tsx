"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface SiteInfo {
  id: string;
  slug?: string;
  name: string;
  domain: string;
  language: string;
  direction: string;
  source: "config" | "database";
  db_id?: string;
}

interface SiteFormData {
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
}

const emptySite: SiteFormData = {
  slug: "",
  name: "",
  domain: "",
  language: "en",
  direction: "ltr",
};

export function SiteManager() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteInfo | null>(null);
  const [form, setForm] = useState<SiteFormData>(emptySite);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    setLoading(true);
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites);
    }
    setLoading(false);
  }

  function openCreateForm() {
    setEditingSite(null);
    setForm(emptySite);
    setError("");
    setShowForm(true);
  }

  function openEditForm(site: SiteInfo) {
    setEditingSite(site);
    setForm({
      slug: site.slug ?? site.id,
      name: site.name,
      domain: site.domain,
      language: site.language,
      direction: site.direction as "ltr" | "rtl",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (editingSite) {
      // Update existing site
      const res = await fetchWithCsrf("/api/admin/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSite.db_id ?? editingSite.id,
          name: form.name,
          domain: form.domain,
          language: form.language,
          direction: form.direction,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update site");
        setSaving(false);
        return;
      }
    } else {
      // Create new site
      const res = await fetchWithCsrf("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create site");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    await loadSites();
  }

  async function handleDelete(site: SiteInfo) {
    if (!confirm(`Delete "${site.name}"? This will remove all associated data.`)) return;

    const res = await fetchWithCsrf(`/api/admin/sites?id=${site.db_id ?? site.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadSites();
    }
  }

  async function handleSelect(siteId: string) {
    setSelectingId(siteId);
    const res = await fetchWithCsrf("/api/admin/sites/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    if (res.ok) {
      router.push("/admin");
    }
    setSelectingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-400">Loading sites...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Action bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">{sites.length} site(s) registered</p>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Site
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {editingSite ? `Edit: ${editingSite.name}` : "Add New Site"}
          </h2>
          {error && (
            <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="my-niche-site"
                  pattern="[a-z0-9-]+"
                  disabled={!!editingSite}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-400">Lowercase, hyphens only. Cannot change after creation.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My Niche Site"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Domain</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="my-niche.com"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Language</label>
                <input
                  type="text"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  placeholder="en"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Direction</label>
                <select
                  value={form.direction}
                  onChange={(e) => setForm({ ...form, direction: e.target.value as "ltr" | "rtl" })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="ltr">Left-to-Right (LTR)</option>
                  <option value="rtl">Right-to-Left (RTL)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingSite ? "Update Site" : "Create Site"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sites list */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sites.map((site) => (
          <div
            key={site.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white">
                  {site.name[0].toUpperCase()}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{site.name}</h3>
                  <p className="text-sm text-gray-500">{site.domain}</p>
                  <div className="mt-1 flex gap-2">
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {site.language}
                    </span>
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {site.direction.toUpperCase()}
                    </span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      site.source === "database"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {site.source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => handleSelect(site.id)}
                disabled={selectingId === site.id}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {selectingId === site.id ? "Switching..." : "Select"}
              </button>
              {site.source === "database" && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditForm(site)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(site)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {sites.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No sites configured yet.</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-2 text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first site
          </button>
        </div>
      )}
    </div>
  );
}
