"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentRow } from "@/types/database";
import type { CategoryRow } from "@/types/database";
import type { ProductRow } from "@/types/database";
import type { ContentProductRow } from "@/types/database";
import { ProductLinker } from "./product-linker";
import { RichEditor } from "./rich-editor";
import { ImageUploader } from "../components/image-uploader";

interface ContentFormProps {
  content?: ContentRow;
  categories: CategoryRow[];
  products: ProductRow[];
  linkedProducts?: (ContentProductRow & { product: ProductRow })[];
}

export function ContentForm({ content, categories, products, linkedProducts }: ContentFormProps) {
  const router = useRouter();
  const isEdit = !!content;

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

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    };

    const res = isEdit
      ? await fetch("/api/admin/content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: content.id, ...payload }),
        })
      : await fetch("/api/admin/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }

    const saved = await res.json();
    const contentId = saved.id ?? content?.id;

    // Save product links
    if (contentId) {
      await fetch("/api/admin/content-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: contentId, links }),
      });
    }

    router.push("/admin/content");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
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
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Excerpt</label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
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
        <RichEditor value={body} onChange={setBody} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="article">Article</option>
            <option value="review">Review</option>
            <option value="comparison">Comparison</option>
            <option value="guide">Guide</option>
            <option value="blog">Blog</option>
            <option value="brand-spotlight">Brand Spotlight</option>
            <option value="occasion">Occasion</option>
            <option value="budget">Budget</option>
            <option value="recipient">Recipient</option>
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
    </form>
  );
}
