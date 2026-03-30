"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ContentRow, CategoryRow, ProductRow, ContentProductRow } from "@/types/database";
import type { ContentTypeConfig } from "@/config/site-definition";
import dynamic from "next/dynamic";
import { ProductLinker } from "./product-linker";
import { ImageUploader } from "../components/image-uploader";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { autoSlug } from "@/lib/auto-slug";
import { toast } from "sonner";
import { ErrorBoundary } from "../components/error-boundary";

const RichEditor = dynamic(() =>
  import("./rich-editor").then((m) => m.RichEditor),
  { loading: () => <div className="h-[300px] animate-pulse rounded-lg border border-gray-300 bg-gray-50" /> }
);

interface ContentFormProps {
  content?: ContentRow;
  categories: CategoryRow[];
  products: ProductRow[];
  linkedProducts?: (ContentProductRow & { product: ProductRow })[];
  contentTypes?: ContentTypeConfig[];
}

const DEFAULT_CONTENT_TYPES: ContentTypeConfig[] = [
  { value: "article", label: "Article", commercial: false, layout: "standard" },
  { value: "review", label: "Review", commercial: true, layout: "sidebar" },
  { value: "comparison", label: "Comparison", commercial: true, layout: "sidebar", minProducts: 2 },
  { value: "guide", label: "Guide", commercial: false, layout: "standard" },
  { value: "blog", label: "Blog", commercial: false, layout: "standard" },
];

export function ContentForm({ content, categories, products, linkedProducts, contentTypes }: ContentFormProps) {
  const siteContentTypes = contentTypes ?? DEFAULT_CONTENT_TYPES;
  const router = useRouter();
  const isEdit = !!content;
  const isDirtyRef = useRef(false);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function markDirty() {
    isDirtyRef.current = true;
  }

  const [title, setTitle] = useState(content?.title ?? "");
  const [slug, setSlug] = useState(content?.slug ?? "");
  const [body, setBody] = useState(content?.body ?? "");
  const [excerpt, setExcerpt] = useState(content?.excerpt ?? "");
  const [featuredImage, setFeaturedImage] = useState(content?.featured_image ?? "");
  const [contentType, setContentType] = useState(content?.type ?? "article");
  const [status, setStatus] = useState(content?.status ?? "draft");
  const [categoryId, setCategoryId] = useState(content?.category_id ?? "");
  const [tagsStr, setTagsStr] = useState((content?.tags ?? []).join(", "));
  const [author, setAuthor] = useState(content?.author ?? "");
  const [publishAt, setPublishAt] = useState(content?.publish_at ?? "");
  const [metaTitle, setMetaTitle] = useState(content?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(content?.meta_description ?? "");
  const [ogImage, setOgImage] = useState(content?.og_image ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Product linker state
  const [links, setLinks] = useState<
    { product_id: string; role: string }[]
  >(
    linkedProducts?.map((lp) => ({
      product_id: lp.product_id,
      role: lp.role,
    })) ?? []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      title,
      slug,
      body,
      excerpt,
      featured_image: featuredImage,
      type: contentType,
      status,
      category_id: categoryId || null,
      tags,
      author: author || null,
      publish_at: publishAt || null,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      og_image: ogImage || null,
    };

    const res = isEdit
      ? await fetchWithCsrf("/api/admin/content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: content?.id, ...payload }),
        })
      : await fetchWithCsrf("/api/admin/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json();
      const msg = data.error ?? "Failed to save";
      setError(msg);
      toast.error(msg);
      setSaving(false);
      return;
    }

    const saved = await res.json();
    const contentId = saved.id ?? content?.id;

    // Save product links
    if (contentId) {
      await fetchWithCsrf("/api/admin/content-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: contentId, links }),
      });
    }

    toast.success(isEdit ? "Content updated" : "Content created");
    isDirtyRef.current = false;
    router.push("/admin/content");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <fieldset disabled={saving} className={`space-y-6 ${saving ? "opacity-60" : ""}`}>
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!isEdit) setSlug(autoSlug(e.target.value));
              markDirty();
            }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Excerpt</label>
        <textarea
          value={excerpt}
          onChange={(e) => { setExcerpt(e.target.value); markDirty(); }}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <ImageUploader
        value={featuredImage}
        onChange={setFeaturedImage}
        label="Featured Image"
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Body</label>
        <ErrorBoundary
          fallback={
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); markDirty(); }}
              rows={12}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
              placeholder="Rich editor failed to load. You can use HTML here instead."
            />
          }
        >
          <RichEditor value={body} onChange={(html) => { setBody(html); markDirty(); }} />
        </ErrorBoundary>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentRow["type"])}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {siteContentTypes.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ContentRow["status"])}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scheduling Section — prominent */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-semibold text-indigo-900">Schedule Publishing</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-indigo-800">Publish Date & Time (UTC)</label>
            <input
              type="datetime-local"
              value={publishAt ? publishAt.slice(0, 16) : ""}
              onChange={(e) => {
                if (!e.target.value) {
                  setPublishAt("");
                  return;
                }
                // Treat the input value as UTC directly (not local timezone)
                const newDate = e.target.value + ":00.000Z";
                setPublishAt(newDate);
                // Auto-set status to "scheduled" when a future publish date is chosen and status is draft
                if (status === "draft") {
                  setStatus("scheduled");
                }
              }}
              className="w-full rounded border border-indigo-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-indigo-600">
              {publishAt
                ? `Scheduled for ${new Date(publishAt).toUTCString()}. Status will be set to "Scheduled" automatically.`
                : "Set a date to schedule publishing. Status will auto-switch to Scheduled."}
            </p>
          </div>
          {publishAt && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setPublishAt("")}
                className="rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Clear Schedule
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Author</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* SEO Meta Fields */}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          SEO &amp; Open Graph Settings
        </summary>
        <div className="space-y-4 border-t border-gray-200 px-4 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Meta Title</label>
            <input
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder={title || "Defaults to content title"}
              maxLength={70}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">{metaTitle.length}/70 characters</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Meta Description</label>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder={excerpt || "Defaults to content excerpt"}
              maxLength={160}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">{metaDescription.length}/160 characters</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">OG Image URL</label>
            <input
              type="text"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder={featuredImage || "Defaults to featured image"}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Override the Open Graph image for social sharing</p>
          </div>
        </div>
      </details>

      {/* Product Linker */}
      <ProductLinker
        products={products}
        links={links}
        onChange={setLinks}
      />

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update" : "Create"}
        </button>
        {isEdit && slug && (
          <a
            href={`/${contentType}/${slug}?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Preview
          </a>
        )}
        <button
          type="button"
          onClick={() => router.push("/admin/content")}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
      </fieldset>
    </form>
  );
}
