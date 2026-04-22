"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FormCard,
  StickySaveBar,
  useDirtyTracking,
  useSaveShortcut,
} from "@/components/admin/forms";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { autoSlug } from "@/lib/auto-slug";
import { toast } from "sonner";

import type { ProductRow, CategoryRow } from "@/types/database";
import { ImageUploader } from "../components/image-uploader";
import { ProductDeleteCard } from "./product-delete-card";

const FORM_ID = "product-form";

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "SAR", "AED", "EGP"] as const;
const STATUS_OPTIONS: { value: ProductRow["status"]; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

type ProductFormState = {
  name: string;
  slug: string;
  description: string;
  affiliate_url: string;
  merchant: string;
  image_url: string;
  image_alt: string;
  price: string;
  price_amount: string;
  price_currency: string;
  score: string;
  featured: boolean;
  status: ProductRow["status"];
  category_id: string;
  cta_text: string;
  deal_text: string;
  deal_expires_at: string;
  pros: string;
  cons: string;
};

function toFormState(product?: ProductRow): ProductFormState {
  return {
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    description: product?.description ?? "",
    affiliate_url: product?.affiliate_url ?? "",
    merchant: product?.merchant ?? "",
    image_url: product?.image_url ?? "",
    image_alt: product?.image_alt ?? "",
    price: product?.price ?? "",
    price_amount: product?.price_amount?.toString() ?? "",
    price_currency: product?.price_currency ?? "USD",
    score: product?.score?.toString() ?? "",
    featured: product?.featured ?? false,
    status: product?.status ?? "active",
    category_id: product?.category_id ?? "",
    cta_text: product?.cta_text ?? "",
    deal_text: product?.deal_text ?? "",
    deal_expires_at: product?.deal_expires_at ?? "",
    pros: product?.pros ?? "",
    cons: product?.cons ?? "",
  };
}

type FieldErrors = Partial<Record<keyof ProductFormState, string>>;

function validate(state: ProductFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.name.trim()) errors.name = "Name is required.";
  if (!state.slug.trim()) {
    errors.slug = "Slug is required.";
  } else if (!/^[a-z0-9\u0600-\u06FF-]+$/i.test(state.slug)) {
    errors.slug = "Slug can only contain letters, numbers, and hyphens.";
  }
  if (state.affiliate_url.trim()) {
    try {
      new URL(state.affiliate_url);
    } catch {
      errors.affiliate_url = "Enter a valid URL (e.g. https://example.com).";
    }
  }
  if (state.price_amount.trim()) {
    const amount = Number(state.price_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.price_amount = "Price amount must be a non-negative number.";
    }
  }
  if (state.score.trim()) {
    const score = Number(state.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      errors.score = "Score must be between 0 and 10.";
    }
  }
  return errors;
}

const NO_CATEGORY = "__none__";

interface ProductFormProps {
  product?: ProductRow;
  categories: CategoryRow[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const router = useRouter();
  const isEdit = !!product;

  const [state, setState] = useState<ProductFormState>(() => toFormState(product));
  const [savedState, setSavedState] = useState<ProductFormState>(() => toFormState(product));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");

  const isDirty = useDirtyTracking(state, savedState);
  const hasValidationErrors = useMemo(() => Object.keys(validate(state)).length > 0, [state]);

  function update<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  const handleSave = useCallback(async () => {
    const errors = validate(state);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setFormError("");

    const payload = {
      name: state.name,
      slug: state.slug,
      description: state.description,
      affiliate_url: state.affiliate_url,
      image_url: state.image_url,
      image_alt: state.image_alt,
      price: state.price,
      price_amount: state.price_amount ? Number(state.price_amount) : null,
      price_currency: state.price_currency,
      merchant: state.merchant,
      score: state.score ? Number(state.score) : null,
      featured: state.featured,
      status: state.status,
      category_id: state.category_id || null,
      cta_text: state.cta_text,
      deal_text: state.deal_text,
      deal_expires_at: state.deal_expires_at || null,
      pros: state.pros,
      cons: state.cons,
    };

    try {
      const res = isEdit
        ? await fetchWithCsrf("/api/admin/products", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: product!.id, ...payload }),
          })
        : await fetchWithCsrf("/api/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        toast.success(isEdit ? "Product updated" : "Product created");
        setSavedState(state);
        router.push("/admin/products");
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to save";
        setFormError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "Failed to save";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [product, isEdit, router, state]);

  useSaveShortcut(() => {
    if (saving || hasValidationErrors) return;
    void handleSave();
  }, saving);

  function handleCancel() {
    router.push("/admin/products");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSave();
  }

  const errorClass = "text-destructive text-sm mt-1";
  const hintClass = "text-sm text-muted-foreground mt-1";

  return (
    <div className="space-y-6 pb-6">
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6" noValidate>
        <fieldset disabled={saving} className={cn("space-y-6", saving && "opacity-60")}>
          {formError && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <FormCard
            title="Basics"
            description="Core product information displayed on listings and the product page."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-name">Name</Label>
                <Input
                  id="prod-name"
                  value={state.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    update("name", value);
                    if (!isEdit) update("slug", autoSlug(value));
                  }}
                  aria-invalid={!!fieldErrors.name || undefined}
                  aria-describedby={fieldErrors.name ? "prod-name-error" : undefined}
                  autoComplete="off"
                />
                {fieldErrors.name && (
                  <p id="prod-name-error" className={errorClass}>
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-slug">Slug</Label>
                <Input
                  id="prod-slug"
                  value={state.slug}
                  onChange={(e) => update("slug", e.target.value)}
                  aria-invalid={!!fieldErrors.slug || undefined}
                  aria-describedby={fieldErrors.slug ? "prod-slug-error" : "prod-slug-hint"}
                  autoComplete="off"
                />
                {fieldErrors.slug ? (
                  <p id="prod-slug-error" className={errorClass}>
                    {fieldErrors.slug}
                  </p>
                ) : (
                  <p id="prod-slug-hint" className={hintClass}>
                    URL-friendly identifier used in the product page path.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                value={state.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
              />
            </div>
          </FormCard>

          <FormCard title="Offer" description="Affiliate destination and promotional details.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-affiliate-url">Affiliate URL</Label>
                <Input
                  id="prod-affiliate-url"
                  type="url"
                  value={state.affiliate_url}
                  onChange={(e) => update("affiliate_url", e.target.value)}
                  aria-invalid={!!fieldErrors.affiliate_url || undefined}
                  aria-describedby={
                    fieldErrors.affiliate_url ? "prod-affiliate-url-error" : undefined
                  }
                  placeholder="https://example.com/ref/..."
                  autoComplete="off"
                />
                {fieldErrors.affiliate_url && (
                  <p id="prod-affiliate-url-error" className={errorClass}>
                    {fieldErrors.affiliate_url}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-merchant">Merchant</Label>
                <Input
                  id="prod-merchant"
                  value={state.merchant}
                  onChange={(e) => update("merchant", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-cta">CTA text</Label>
                <Input
                  id="prod-cta"
                  value={state.cta_text}
                  onChange={(e) => update("cta_text", e.target.value)}
                  placeholder="e.g. Get 50% Off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-deal">Deal badge</Label>
                <Input
                  id="prod-deal"
                  value={state.deal_text}
                  onChange={(e) => update("deal_text", e.target.value)}
                  placeholder="e.g. 20% Off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-deal-expires">Deal expires (UTC)</Label>
                <Input
                  id="prod-deal-expires"
                  type="datetime-local"
                  value={state.deal_expires_at ? state.deal_expires_at.slice(0, 16) : ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      update("deal_expires_at", "");
                    } else {
                      update("deal_expires_at", e.target.value + ":00.000Z");
                    }
                  }}
                />
                {state.deal_expires_at && (
                  <p className={hintClass}>
                    Expires at: {new Date(state.deal_expires_at).toUTCString()}
                  </p>
                )}
              </div>
            </div>
          </FormCard>

          <FormCard
            title="Pricing"
            description="Price display and structured amount used for sorting and filters."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-price">Price (display)</Label>
                <Input
                  id="prod-price"
                  value={state.price}
                  onChange={(e) => update("price", e.target.value)}
                  placeholder="e.g. $29.99"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-price-amount">Price amount</Label>
                <Input
                  id="prod-price-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={state.price_amount}
                  onChange={(e) => update("price_amount", e.target.value)}
                  aria-invalid={!!fieldErrors.price_amount || undefined}
                  aria-describedby={
                    fieldErrors.price_amount ? "prod-price-amount-error" : undefined
                  }
                  placeholder="29.99"
                />
                {fieldErrors.price_amount && (
                  <p id="prod-price-amount-error" className={errorClass}>
                    {fieldErrors.price_amount}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-currency">Currency</Label>
                <Select
                  value={state.price_currency}
                  onValueChange={(value) => update("price_currency", value)}
                >
                  <SelectTrigger id="prod-currency" className="w-full">
                    <SelectValue placeholder="Select a currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormCard>

          <FormCard
            title="Evaluation"
            description="Editorial scoring and pros/cons surfaced on the product page."
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="prod-score">Score (0–10)</Label>
                <Input
                  id="prod-score"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={state.score}
                  onChange={(e) => update("score", e.target.value)}
                  aria-invalid={!!fieldErrors.score || undefined}
                  aria-describedby={fieldErrors.score ? "prod-score-error" : undefined}
                />
                {fieldErrors.score && (
                  <p id="prod-score-error" className={errorClass}>
                    {fieldErrors.score}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 pb-1 text-sm">
                <Checkbox
                  id="prod-featured"
                  checked={state.featured}
                  onCheckedChange={(checked) => update("featured", checked === true)}
                />
                <span>Featured product</span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-pros">Pros (one per line)</Label>
                <Textarea
                  id="prod-pros"
                  value={state.pros}
                  onChange={(e) => update("pros", e.target.value)}
                  rows={4}
                  placeholder={"Great battery life\nExcellent display\nAffordable price"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-cons">Cons (one per line)</Label>
                <Textarea
                  id="prod-cons"
                  value={state.cons}
                  onChange={(e) => update("cons", e.target.value)}
                  rows={4}
                  placeholder={"No wireless charging\nBulky design"}
                />
              </div>
            </div>
          </FormCard>

          <FormCard
            title="Relationships"
            description="How this product is classified and surfaced across the site."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-category">Category</Label>
                <Select
                  value={state.category_id ? state.category_id : NO_CATEGORY}
                  onValueChange={(value) =>
                    update("category_id", value === NO_CATEGORY ? "" : value)
                  }
                >
                  <SelectTrigger id="prod-category" className="w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-status">Status</Label>
                <Select
                  value={state.status}
                  onValueChange={(value) => update("status", value as ProductRow["status"])}
                >
                  <SelectTrigger id="prod-status" className="w-full">
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormCard>

          <FormCard
            title="Media"
            description="Primary product image displayed on listings and the product page."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageUploader
                id="prod-image"
                value={state.image_url}
                onChange={(url) => update("image_url", url)}
                label="Product image"
              />
              <div className="space-y-1.5">
                <Label htmlFor="prod-image-alt">Image alt text</Label>
                <Input
                  id="prod-image-alt"
                  value={state.image_alt}
                  onChange={(e) => update("image_alt", e.target.value)}
                  placeholder="Describe the product image for screen readers"
                />
                <p className={hintClass}>Describe the product image for screen readers and SEO.</p>
              </div>
            </div>
          </FormCard>
        </fieldset>
      </form>

      {isEdit && product && <ProductDeleteCard id={product.id} name={product.name} />}

      <StickySaveBar
        formId={FORM_ID}
        isDirty={isDirty}
        saving={saving}
        disabled={hasValidationErrors}
        saveLabel={isEdit ? "Save changes" : "Create product"}
        onCancel={handleCancel}
      />
    </div>
  );
}
