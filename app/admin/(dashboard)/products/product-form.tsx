"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProductRow, CategoryRow } from "@/types/database";
import { ImageUploader } from "../components/image-uploader";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ProductFormProps {
  product?: ProductRow;
  categories: CategoryRow[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const router = useRouter();
  const isEdit = !!product;
  const isDirtyRef = useRef(false);

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

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [affiliateUrl, setAffiliateUrl] = useState(product?.affiliate_url ?? "");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [imageAlt, setImageAlt] = useState(product?.image_alt ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [priceAmount, setPriceAmount] = useState<string>(product?.price_amount?.toString() ?? "");
  const [priceCurrency, setPriceCurrency] = useState(product?.price_currency ?? "USD");
  const [merchant, setMerchant] = useState(product?.merchant ?? "");
  const [score, setScore] = useState<string>(product?.score?.toString() ?? "");
  const [isFeatured, setIsFeatured] = useState(product?.featured ?? false);
  const [status, setStatus] = useState(product?.status ?? "active");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [ctaText, setCtaText] = useState(product?.cta_text ?? "");
  const [dealText, setDealText] = useState(product?.deal_text ?? "");
  const [dealExpiresAt, setDealExpiresAt] = useState(product?.deal_expires_at ?? "");
  const [pros, setPros] = useState(product?.pros ?? "");
  const [cons, setCons] = useState(product?.cons ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const payload = {
      name,
      slug,
      description,
      affiliate_url: affiliateUrl,
      image_url: imageUrl,
      image_alt: imageAlt,
      price,
      price_amount: priceAmount ? Number(priceAmount) : null,
      price_currency: priceCurrency,
      merchant,
      score: score ? Number(score) : null,
      featured: isFeatured,
      status,
      category_id: categoryId || null,
      cta_text: ctaText,
      deal_text: dealText,
      deal_expires_at: dealExpiresAt || null,
      pros,
      cons,
    };

    const res = isEdit
      ? await fetchWithCsrf("/api/admin/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: product.id, ...payload }),
        })
      : await fetchWithCsrf("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (res.ok) {
      isDirtyRef.current = false;
      router.push("/admin/products");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <fieldset disabled={saving} className={`space-y-4 ${saving ? "opacity-60" : ""}`}>
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
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
        <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Affiliate URL</label>
          <input
            type="url"
            value={affiliateUrl}
            onChange={(e) => { setAffiliateUrl(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

      </div>

      <ImageUploader
        value={imageUrl}
        onChange={setImageUrl}
        label="Product Image"
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Image Alt Text</label>
        <input
          type="text"
          value={imageAlt}
          onChange={(e) => { setImageAlt(e.target.value); markDirty(); }}
          placeholder="Describe the product image for screen readers"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">Describe the product image for screen readers and SEO.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Price (display)</label>
          <input
            type="text"
            value={price}
            onChange={(e) => { setPrice(e.target.value); markDirty(); }}
            placeholder="e.g. $29.99"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Price Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceAmount}
            onChange={(e) => { setPriceAmount(e.target.value); markDirty(); }}
            placeholder="29.99"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
          <select
            value={priceCurrency}
            onChange={(e) => { setPriceCurrency(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
            <option value="EGP">EGP</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Merchant</label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => { setMerchant(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Score (0–10)</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={score}
            onChange={(e) => { setScore(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as ProductRow["status"]); markDirty(); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CTA Text</label>
          <input
            type="text"
            value={ctaText}
            onChange={(e) => { setCtaText(e.target.value); markDirty(); }}
            placeholder="e.g. Get 50% Off"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Deal Badge</label>
          <input
            type="text"
            value={dealText}
            onChange={(e) => { setDealText(e.target.value); markDirty(); }}
            placeholder="e.g. 20% Off"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Deal Expires (UTC)</label>
          <input
            type="datetime-local"
            value={dealExpiresAt ? dealExpiresAt.slice(0, 16) : ""}
            onChange={(e) => {
              if (!e.target.value) {
                setDealExpiresAt("");
              } else {
                // Treat the input value as UTC directly (not local timezone)
                setDealExpiresAt(e.target.value + ":00.000Z");
              }
              markDirty();
            }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {dealExpiresAt && (
            <p className="mt-1 text-xs text-gray-500">
              Expires at: {new Date(dealExpiresAt).toUTCString()}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Pros (one per line)</label>
          <textarea
            value={pros}
            onChange={(e) => { setPros(e.target.value); markDirty(); }}
            rows={3}
            placeholder={"Great battery life\nExcellent display\nAffordable price"}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Cons (one per line)</label>
          <textarea
            value={cons}
            onChange={(e) => { setCons(e.target.value); markDirty(); }}
            rows={3}
            placeholder={"No wireless charging\nBulky design"}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => { setIsFeatured(e.target.checked); markDirty(); }}
            className="rounded border-gray-300"
          />
          Featured
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
      </fieldset>
    </form>
  );
}
