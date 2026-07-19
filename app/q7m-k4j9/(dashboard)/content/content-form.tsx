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

import { sanitizeHtml } from "@/lib/sanitize-html";

import { toast } from "sonner";

import { useCallback } from "react";

import { ErrorBoundary } from "../components/error-boundary";

const RichEditor = dynamic(() => import("./rich-editor").then((m) => m.RichEditor), {
  loading: () => (
    <div className="h-[300px] animate-pulse rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50" />
  ),
});

interface ContentFormProps {
  content?: ContentRow;

  categories: CategoryRow[];

  products: ProductRow[];

  linkedProducts?: (ContentProductRow & { product: ProductRow })[];

  contentTypes?: ContentTypeConfig[];

  /** Public domain for the site being edited, so previews open on the correct tenant. */
  siteDomain?: string;
}

const DEFAULT_CONTENT_TYPES: ContentTypeConfig[] = [
  { value: "article", label: "Article", commercial: false, layout: "standard" },

  { value: "review", label: "Review", commercial: true, layout: "sidebar" },

  { value: "comparison", label: "Comparison", commercial: true, layout: "sidebar", minProducts: 2 },

  { value: "guide", label: "Guide", commercial: false, layout: "standard" },

  { value: "blog", label: "Blog", commercial: false, layout: "standard" },
];

export function ContentForm({
  content,

  categories,

  products,

  linkedProducts,

  contentTypes,

  siteDomain,
}: ContentFormProps) {
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

  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const [generatingPreview, setGeneratingPreview] = useState(false);

  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handlePreview = useCallback(async () => {
    if (!slug) return;

    // Always generate a short-lived preview token. Token-based preview avoids
    // relying on the admin session cookie being sent by the browser when the
    // dashboard opens a new tab, which can fail for Strict SameSite cookies on
    // some navigations and surface as a 404.
    setGeneratingPreview(true);

    try {
      const res = await fetchWithCsrf("/api/admin/preview-token", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ slug, contentType }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate preview link");

        return;
      }

      const previewHost = siteDomain ? `https://${siteDomain.replace(/^https?:\/\//, "")}` : "";
      window.open(
        `${previewHost}/${contentType}/${slug}?preview=true&token=${data.token}`,
        "_blank",
      );
    } catch {
      // fail-open: best-effort
      toast.error("Failed to generate preview link");
    } finally {
      setGeneratingPreview(false);
    }
  }, [slug, contentType, siteDomain]);

  // Product linker state

  const [links, setLinks] = useState<{ product_id: string; role: string }[]>(
    linkedProducts?.map((lp) => ({
      product_id: lp.product_id,

      role: lp.role,
    })) ?? [],
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

    // M1/H4: wrap in try/catch/finally so a network error can never leave the
    // form permanently disabled, and check the product-link PUT result instead
    // of firing-and-forgetting (which silently lost links while still reporting
    // success).
    try {
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
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to save";
        setError(msg);
        toast.error(msg);
        return;
      }

      const saved = (await res.json().catch(() => ({}))) as { id?: string };
      const contentId = saved.id ?? content?.id;

      // M1: the content row is saved at this point. The product-link PUT can
      // still fail on its own — check its result so a failure surfaces clearly
      // and keeps the user on the page to retry, rather than dropping the links
      // silently while showing a success toast.
      let linksSaved = true;
      if (contentId) {
        const linkRes = await fetchWithCsrf("/api/admin/content-products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_id: contentId, links }),
        });
        linksSaved = linkRes.ok;
      }

      if (!linksSaved) {
        const msg =
          "Content was saved, but its linked products could not be updated. Please try saving again to retry the product links.";
        setError(msg);
        toast.warning(msg);
        return;
      }

      toast.success(isEdit ? "Content updated" : "Content created");
      isDirtyRef.current = false;
      router.push("/q7m-k4j9/content");
      router.refresh();
    } catch {
      const msg = "Network error — please check your connection and try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="max-w-3xl space-y-6"
    >
      <fieldset disabled={saving} className={`space-y-6 ${saving ? "opacity-60" : ""}`}>
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="content-title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Title
            </label>

            <input
              id="content-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);

                if (!isEdit) setSlug(autoSlug(e.target.value));

                markDirty();
              }}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label
              htmlFor="content-slug"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Slug
            </label>

            <input
              id="content-slug"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);

                markDirty();
              }}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="content-excerpt"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Excerpt
          </label>

          <textarea
            id="content-excerpt"
            value={excerpt}
            onChange={(e) => {
              setExcerpt(e.target.value);

              markDirty();
            }}
            rows={2}
            className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <ImageUploader value={featuredImage} onChange={setFeaturedImage} label="Featured Image" />

        <div>
          <label
            htmlFor="content-body"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Body
          </label>

          <ErrorBoundary
            fallback={
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);

                  markDirty();
                }}
                rows={12}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Rich editor failed to load. You can use HTML here instead."
              />
            }
          >
            <RichEditor
              value={body}
              products={products}
              onChange={(html) => {
                setBody(html);

                markDirty();
              }}
            />
          </ErrorBoundary>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="content-type"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Type
            </label>

            <select
              id="content-type"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentRow["type"])}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {siteContentTypes.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="content-status"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Status
            </label>

            <select
              id="content-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentRow["status"])}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>

              <option value="review">Review</option>

              <option value="scheduled">Scheduled</option>

              <option value="published">Published</option>

              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="content-category"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Category
            </label>

            <select
              id="content-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">No category</option>

              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scheduling Section — prominent */}

        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

            <h3 className="text-sm font-semibold text-indigo-900">Schedule Publishing</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-indigo-800">
                Publish Date & Time (UTC)
              </label>

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
                className="w-full rounded border border-indigo-300 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            <label
              htmlFor="content-author"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Author
            </label>

            <input
              id="content-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="content-tags"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tags (comma-separated)
            </label>

            <input
              id="content-tags"
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* SEO Meta Fields */}

        <details className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50">
            SEO &amp; Open Graph Settings
          </summary>

          <div className="space-y-4 border-t border-gray-200 dark:border-gray-800 px-4 py-4">
            <div>
              <label
                htmlFor="content-meta-title"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Meta Title
              </label>

              <input
                id="content-meta-title"
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || "Defaults to content title"}
                maxLength={70}
                className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {metaTitle.length}/70 characters
              </p>
            </div>

            <div>
              <label
                htmlFor="content-meta-desc"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Meta Description
              </label>

              <textarea
                id="content-meta-desc"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder={excerpt || "Defaults to content excerpt"}
                maxLength={160}
                rows={2}
                className="w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {metaDescription.length}/160 characters
              </p>
            </div>

            <ImageUploader
              value={ogImage ?? ""}
              onChange={setOgImage}
              label="OG Image URL"
              placeholder={featuredImage || "Defaults to featured image"}
            />

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Override the Open Graph image for social sharing
            </p>
          </div>
        </details>

        {/* Version History */}

        {isEdit && content?.body_previous && (
          <details
            className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20"
            open={showVersionHistory}
            onToggle={(e) => setShowVersionHistory((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100">
              Version History
            </summary>

            <div className="border-t border-amber-200 px-4 py-4">
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                Previous version of the body content (before last edit):
              </p>

              <div
                className="mb-3 max-h-48 overflow-auto rounded border border-amber-200 bg-white dark:bg-gray-900 p-3 text-sm text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body_previous) }}
              />

              <button
                type="button"
                onClick={() => setShowRestoreConfirm(true)}
                className="rounded-md border border-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-200"
              >
                Restore Previous Version
              </button>

              {showRestoreConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="mx-4 w-full max-w-sm rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl">
                    <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Restore Previous Version
                    </h3>

                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      Are you sure you want to restore the previous version? Your current body
                      content will be replaced.
                    </p>

                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowRestoreConfirm(false)}
                        className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBody(content?.body_previous ?? "");

                          markDirty();

                          setShowRestoreConfirm(false);

                          toast.success("Previous version restored. Save to persist.");
                        }}
                        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-amber-700"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Product Linker */}

        <ProductLinker products={products} links={links} onChange={setLinks} />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>

          {isEdit && slug && (
            <button
              type="button"
              onClick={() => {
                void handlePreview();
              }}
              disabled={generatingPreview}
              className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 disabled:opacity-50"
            >
              {generatingPreview ? "Generating..." : "Preview"}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push("/q7m-k4j9/content")}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
