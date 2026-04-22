"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProductRow, CategoryRow } from "@/types/database";
import { ImageUploader } from "../components/image-uploader";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { autoSlug } from "@/lib/auto-slug";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProductFormProps {
  product?: ProductRow;
  categories: CategoryRow[];
}

const SELECT_CLASSES =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

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
      toast.success(isEdit ? "Product updated" : "Product created");
      isDirtyRef.current = false;
      router.push("/admin/products");
      router.refresh();
    } else {
      const data = await res.json();
      const msg = data.error ?? "Failed to save";
      setError(msg);
      toast.error(msg);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={saving} className={`space-y-6 ${saving ? "opacity-60" : ""}`}>
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Main</CardTitle>
            <CardDescription>
              Core product details shown on listings and the product page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-name">Name</Label>
                <Input
                  id="prod-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!isEdit) setSlug(autoSlug(e.target.value));
                    markDirty();
                  }}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-slug">Slug</Label>
                <Input
                  id="prod-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    markDirty();
                  }}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                }}
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-affiliate-url">Affiliate URL</Label>
                <Input
                  id="prod-affiliate-url"
                  type="url"
                  value={affiliateUrl}
                  onChange={(e) => {
                    setAffiliateUrl(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-merchant">Merchant</Label>
                <Input
                  id="prod-merchant"
                  type="text"
                  value={merchant}
                  onChange={(e) => {
                    setMerchant(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-price">Price (display)</Label>
                <Input
                  id="prod-price"
                  type="text"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. $29.99"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-price-amount">Price Amount</Label>
                <Input
                  id="prod-price-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceAmount}
                  onChange={(e) => {
                    setPriceAmount(e.target.value);
                    markDirty();
                  }}
                  placeholder="29.99"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-currency">Currency</Label>
                <select
                  id="prod-currency"
                  value={priceCurrency}
                  onChange={(e) => {
                    setPriceCurrency(e.target.value);
                    markDirty();
                  }}
                  className={SELECT_CLASSES}
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

            <div className="space-y-1.5">
              <Label htmlFor="prod-category">Category</Label>
              <select
                id="prod-category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  markDirty();
                }}
                className={SELECT_CLASSES}
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-cta">CTA Text</Label>
                <Input
                  id="prod-cta"
                  type="text"
                  value={ctaText}
                  onChange={(e) => {
                    setCtaText(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Get 50% Off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-deal">Deal Badge</Label>
                <Input
                  id="prod-deal"
                  type="text"
                  value={dealText}
                  onChange={(e) => {
                    setDealText(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. 20% Off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-deal-expires">Deal Expires (UTC)</Label>
                <Input
                  id="prod-deal-expires"
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
                />
                {dealExpiresAt && (
                  <p className="text-xs text-muted-foreground">
                    Expires at: {new Date(dealExpiresAt).toUTCString()}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-score">Score (0–10)</Label>
              <Input
                id="prod-score"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={score}
                onChange={(e) => {
                  setScore(e.target.value);
                  markDirty();
                }}
                className="sm:max-w-[200px]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-pros">Pros (one per line)</Label>
                <Textarea
                  id="prod-pros"
                  value={pros}
                  onChange={(e) => {
                    setPros(e.target.value);
                    markDirty();
                  }}
                  rows={3}
                  placeholder={"Great battery life\nExcellent display\nAffordable price"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-cons">Cons (one per line)</Label>
                <Textarea
                  id="prod-cons"
                  value={cons}
                  onChange={(e) => {
                    setCons(e.target.value);
                    markDirty();
                  }}
                  rows={3}
                  placeholder={"No wireless charging\nBulky design"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>
              SEO and accessibility details used for search engines and screen readers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageUploader value={imageUrl} onChange={setImageUrl} label="Product Image" />

              <div className="space-y-1.5">
                <Label htmlFor="prod-image-alt">Image Alt Text</Label>
                <Input
                  id="prod-image-alt"
                  type="text"
                  value={imageAlt}
                  onChange={(e) => {
                    setImageAlt(e.target.value);
                    markDirty();
                  }}
                  placeholder="Describe the product image for screen readers"
                />
                <p className="text-xs text-muted-foreground">
                  Describe the product image for screen readers and SEO.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status & Publishing</CardTitle>
            <CardDescription>
              Controls whether the product is visible on the public site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prod-status">Status</Label>
              <select
                id="prod-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as ProductRow["status"]);
                  markDirty();
                }}
                className={`${SELECT_CLASSES} sm:max-w-[240px]`}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="prod-featured"
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => {
                  setIsFeatured(e.target.checked);
                  markDirty();
                }}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="prod-featured" className="font-normal">
                Featured product
              </Label>
            </div>
          </CardContent>
        </Card>

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
