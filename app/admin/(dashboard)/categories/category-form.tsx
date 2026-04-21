"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StickySaveBar, useDirtyTracking, useSaveShortcut } from "@/components/admin/forms";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { CategoryRow, TaxonomyType } from "@/types/database";
import { toast } from "sonner";

import { CategoryDeleteCard } from "./category-delete-card";

const FORM_ID = "category-form";

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  taxonomy_type: TaxonomyType;
};

function toFormState(category?: CategoryRow): CategoryFormState {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
    taxonomy_type: category?.taxonomy_type ?? "general",
  };
}

function autoSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-|-$/g, "");
}

type FieldErrors = Partial<Record<keyof CategoryFormState, string>>;

function validate(state: CategoryFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.name.trim()) errors.name = "Name is required.";
  if (!state.slug.trim()) errors.slug = "Slug is required.";
  else if (!/^[a-z0-9\u0600-\u06FF-]+$/i.test(state.slug)) {
    errors.slug = "Slug can only contain letters, numbers, and hyphens.";
  }
  return errors;
}

const TAXONOMY_OPTIONS: { value: TaxonomyType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "budget", label: "Budget" },
  { value: "occasion", label: "Occasion" },
  { value: "recipient", label: "Recipient" },
  { value: "brand", label: "Brand" },
];

export function CategoryForm({ category }: { category?: CategoryRow }) {
  const router = useRouter();
  const isEdit = !!category;

  const [state, setState] = useState<CategoryFormState>(() => toFormState(category));
  const [savedState, setSavedState] = useState<CategoryFormState>(() => toFormState(category));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");

  const isDirty = useDirtyTracking(state, savedState);

  const hasValidationErrors = useMemo(() => Object.keys(validate(state)).length > 0, [state]);

  function update<K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
    // Clear the field error as soon as the user starts fixing it.
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
      taxonomy_type: state.taxonomy_type,
    };

    try {
      const res = isEdit
        ? await fetchWithCsrf("/api/admin/categories", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: category!.id, ...payload }),
          })
        : await fetchWithCsrf("/api/admin/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        toast.success(isEdit ? "Category updated" : "Category created");
        setSavedState(state);
        router.push("/admin/categories");
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
  }, [category, isEdit, router, state]);

  useSaveShortcut(() => {
    if (saving || hasValidationErrors) return;
    void handleSave();
  }, saving);

  function handleCancel() {
    router.push("/admin/categories");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSave();
  }

  return (
    <div className="space-y-6 pb-6">
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6" noValidate>
        {formError && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {formError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Basic information displayed on the category page and in navigation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={state.name}
                onChange={(e) => {
                  const value = e.target.value;
                  update("name", value);
                  if (!isEdit) update("slug", autoSlug(value));
                }}
                aria-invalid={!!fieldErrors.name || undefined}
                aria-describedby={fieldErrors.name ? "cat-name-error" : undefined}
                autoComplete="off"
              />
              {fieldErrors.name && (
                <p id="cat-name-error" className="text-destructive text-sm mt-1">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={state.slug}
                onChange={(e) => update("slug", e.target.value)}
                aria-invalid={!!fieldErrors.slug || undefined}
                aria-describedby={fieldErrors.slug ? "cat-slug-error" : "cat-slug-hint"}
                autoComplete="off"
              />
              {fieldErrors.slug ? (
                <p id="cat-slug-error" className="text-destructive text-sm mt-1">
                  {fieldErrors.slug}
                </p>
              ) : (
                <p id="cat-slug-hint" className="text-sm text-muted-foreground mt-1">
                  URL-friendly identifier used in the category page path.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-description">Description</Label>
              <Textarea
                id="cat-description"
                value={state.description}
                onChange={(e) => update("description", e.target.value)}
                rows={4}
                placeholder="Category description shown on the public category page"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
            <CardDescription>
              How this category is used when organising products and content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="cat-taxonomy">Taxonomy type</Label>
              <Select
                value={state.taxonomy_type}
                onValueChange={(value) => update("taxonomy_type", value as TaxonomyType)}
              >
                <SelectTrigger id="cat-taxonomy" className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Select a taxonomy type" />
                </SelectTrigger>
                <SelectContent>
                  {TAXONOMY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </form>

      {isEdit && category && <CategoryDeleteCard id={category.id} name={category.name} />}

      <StickySaveBar
        formId={FORM_ID}
        isDirty={isDirty}
        saving={saving}
        saveLabel={isEdit ? "Save changes" : "Create category"}
        onCancel={handleCancel}
      />
    </div>
  );
}
