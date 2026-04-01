"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface PageInfo {
  id: string;
  slug: string;
  title: string;
  body: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PageFormData {
  slug: string;
  title: string;
  body: string;
  is_published: boolean;
  sort_order: number;
}

const emptyForm: PageFormData = {
  slug: "",
  title: "",
  body: "",
  is_published: false,
  sort_order: 0,
};

const inputCls =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";

export function PageManager() {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<PageInfo | null>(null);
  const [form, setForm] = useState<PageFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeletePage, setConfirmDeletePage] = useState<PageInfo | null>(null);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetchWithCsrf("/api/admin/pages", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPages(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  function openCreateForm() {
    setEditingPage(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  }

  function openEditForm(page: PageInfo) {
    setEditingPage(page);
    setForm({
      slug: page.slug,
      title: page.title,
      body: page.body,
      is_published: page.is_published,
      sort_order: page.sort_order,
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingPage) {
        const res = await fetchWithCsrf(`/api/admin/pages/${editingPage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to update page");
          return;
        }
      } else {
        const res = await fetchWithCsrf("/api/admin/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to create page");
          return;
        }
      }
      setShowForm(false);
      await loadPages();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed(page: PageInfo) {
    setConfirmDeletePage(null);
    try {
      await fetchWithCsrf(`/api/admin/pages/${page.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadPages();
    } catch {
      // silent
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const newPages = [...pages];
    [newPages[index - 1], newPages[index]] = [newPages[index], newPages[index - 1]];
    const reordered = newPages.map((p, i) => ({ id: p.id, sort_order: i }));
    setPages(newPages);
    try {
      await fetchWithCsrf("/api/admin/pages/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pages: reordered }),
      });
    } catch {
      // silent — reload to reset
      await loadPages();
    }
  }

  async function handleMoveDown(index: number) {
    if (index >= pages.length - 1) return;
    const newPages = [...pages];
    [newPages[index], newPages[index + 1]] = [newPages[index + 1], newPages[index]];
    const reordered = newPages.map((p, i) => ({ id: p.id, sort_order: i }));
    setPages(newPages);
    try {
      await fetchWithCsrf("/api/admin/pages/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pages: reordered }),
      });
    } catch {
      await loadPages();
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading pages...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pages.length} page(s)</p>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New Page
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {editingPage ? "Edit Page" : "Create Page"}
          </h2>
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="About Us"
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-"),
                    })
                  }
                  placeholder="about-us"
                  className={inputCls}
                  required
                />
                <p className="mt-1 text-xs text-gray-400">URL: /p/{form.slug || "slug"}</p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Body (HTML)</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="<p>Page content goes here...</p>"
                rows={12}
                className={`${inputCls} font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-gray-400">
                Supports HTML. A rich text editor (TipTap) can be integrated for a better editing
                experience.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_published"
                  checked={form.is_published}
                  onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="is_published" className="text-sm text-gray-700">
                  Published
                </label>
              </div>
              <div>
                <label className="text-sm text-gray-700">Sort Order: </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingPage ? "Update Page" : "Create Page"}
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

      {/* Pages list */}
      {pages.length === 0 && !showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No custom pages yet.</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-2 text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first page
          </button>
        </div>
      )}

      {pages.length > 0 && (
        <div className="space-y-2">
          {pages.map((page, index) => (
            <div
              key={page.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 3.293l-4.354 4.354a.5.5 0 01-.707-.707l5.007-5.008a.5.5 0 01.708 0l5.007 5.008a.5.5 0 01-.707.707L8 3.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index >= pages.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 12.707l4.354-4.354a.5.5 0 01.707.707l-5.007 5.008a.5.5 0 01-.708 0L2.339 9.06a.5.5 0 01.707-.707L8 12.707z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900">{page.title}</h3>
                  <p className="text-xs text-gray-500">/p/{page.slug}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                    page.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {page.is_published ? "Published" : "Draft"}
                </span>
                <button
                  type="button"
                  onClick={() => openEditForm(page)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeletePage(page)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Delete confirmation dialog */}
      {confirmDeletePage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Page</h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete{" "}
              <strong>&ldquo;{confirmDeletePage.title}&rdquo;</strong>? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeletePage(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirmed(confirmDeletePage)}
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
