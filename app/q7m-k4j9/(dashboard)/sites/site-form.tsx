"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ModulesManager } from "@/app/q7m-k4j9/(dashboard)/platform/modules/modules-manager";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SiteFormData {
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  monetization_type: "affiliate" | "ads" | "both";
  homepage_template:
    | "standard"
    | "cinematic"
    | "minimal"
    | "editorial"
    | "top10"
    | "compare"
    | "showcase";
  product_card_style: "standard" | "compact" | "detailed";
  meta_title: string;
  meta_description: string;
  theme: {
    primaryColor: string;
    accentColor: string;
    accentTextColor: string;
  };
  features: Record<string, boolean>;
}

interface SiteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  mode: "create" | "edit";
  initialData?: Partial<Omit<SiteFormData, "theme">> & {
    id?: string;
    db_id?: string;
    theme?: Record<string, string>;
  };
  isSuperAdmin?: boolean;
}

const HOMEPAGE_TEMPLATES = [
  {
    value: "standard",
    label: "Standard",
    description: "Classic grid layout with hero, categories, products, and content",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    description: "Full-screen hero with gradient backdrop and editorial sections",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Clean, centered design with pill-style categories",
  },
  {
    value: "editorial",
    label: "Editorial",
    description: "Magazine-style grid with featured hero and side stories",
  },
  {
    value: "top10",
    label: "Top 10 List",
    description: "Numbered product ranking with horizontal content list",
  },
  {
    value: "compare",
    label: "Compare",
    description: "Side-by-side product comparison layout for comparison sites",
  },
  {
    value: "showcase",
    label: "Showcase",
    description: "Immersive 3D product hero with scroll-driven animation",
  },
] as const;

const PRODUCT_CARD_STYLES = [
  {
    value: "standard",
    label: "Standard",
    description: "Vertical card with image, price, and CTA button",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Horizontal row layout — image left, details right",
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Expanded card with description, pros/cons inline",
  },
] as const;

const FEATURE_FLAGS = [
  { key: "blog", label: "Blog", description: "Database-driven blog posts" },
  { key: "newsletter", label: "Newsletter", description: "Email signup and subscriber management" },
  { key: "searchModal", label: "Search", description: "Full-text search modal" },
  { key: "comparisons", label: "Comparisons", description: "Product comparison tables" },
  { key: "deals", label: "Deals", description: "Deal badges and expiring offers" },
  { key: "giftFinder", label: "Gift Finder", description: "Interactive gift recommendation quiz" },
  { key: "brandSpotlights", label: "Brand Spotlights", description: "Dedicated brand pages" },
  { key: "rssFeed", label: "RSS Feed", description: "Auto-generated RSS/Atom feed" },
  { key: "scheduling", label: "Scheduling", description: "Scheduled publish/archive for content" },
  { key: "cookieConsent", label: "Cookie Consent", description: "GDPR/CCPA cookie consent banner" },
  {
    key: "taxonomyPages",
    label: "Taxonomy Pages",
    description: "Budget, occasion, recipient browse pages",
  },
] as const;

const DEFAULT_FORM_DATA: SiteFormData = {
  slug: "",
  name: "",
  domain: "",
  language: "en",
  direction: "ltr",
  monetization_type: "affiliate",
  homepage_template: "standard",
  product_card_style: "standard",
  meta_title: "",
  meta_description: "",
  theme: {
    primaryColor: "#1f2937",
    accentColor: "#3b82f6",
    accentTextColor: "#2563eb",
  },
  features: {
    blog: true,
    newsletter: true,
    searchModal: true,
    comparisons: true,
    scheduling: true,
    rssFeed: true,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SiteFormDialog({
  open,
  onOpenChange,
  onSuccess,
  mode,
  initialData,
  isSuperAdmin = false,
}: SiteFormProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SiteFormData>(() => {
    if (mode === "edit" && initialData) {
      const theme = (initialData.theme ?? {}) as Record<string, string>;
      return {
        slug: initialData.slug ?? "",
        name: initialData.name ?? "",
        domain: initialData.domain ?? "",
        language: initialData.language ?? "en",
        direction: initialData.direction ?? "ltr",
        monetization_type: initialData.monetization_type ?? "affiliate",
        homepage_template: initialData.homepage_template ?? "standard",
        product_card_style: initialData.product_card_style ?? "standard",
        meta_title: initialData.meta_title ?? "",
        meta_description: initialData.meta_description ?? "",
        theme: {
          primaryColor: theme.primaryColor ?? theme.primary_color ?? "#1f2937",
          accentColor: theme.accentColor ?? theme.accent_color ?? "#3b82f6",
          accentTextColor: theme.accentTextColor ?? theme.accent_text_color ?? "#2563eb",
        },
        features: initialData.features ?? DEFAULT_FORM_DATA.features,
      };
    }
    return { ...DEFAULT_FORM_DATA };
  });

  const updateField = useCallback(
    <K extends keyof SiteFormData>(key: K, value: SiteFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateTheme = useCallback((key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      theme: { ...prev.theme, [key]: value },
    }));
  }, []);

  const toggleFeature = useCallback((key: string) => {
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.domain.trim()) {
      toast.error("Name and domain are required");
      return;
    }

    if (mode === "create" && !form.slug.trim()) {
      toast.error("Slug is required");
      return;
    }

    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        domain: form.domain,
        language: form.language,
        direction: form.direction,
        monetization_type: form.monetization_type,
        homepage_template: form.homepage_template,
        product_card_style: form.product_card_style,
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        theme: form.theme,
        features: form.features,
      };

      if (mode === "create") {
        payload.slug = form.slug;

        const res = await fetchWithCsrf("/api/admin/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          toast.success(`Created "${form.name}"`);
          onSuccess();
          onOpenChange(false);
        } else {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? "Failed to create site");
        }
      } else {
        const id = initialData?.db_id ?? initialData?.id;
        if (!id) {
          toast.error("Cannot update: missing site ID");
          return;
        }
        payload.id = id;

        const res = await fetchWithCsrf("/api/admin/sites", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          toast.success(`Updated "${form.name}"`);
          onSuccess();
          onOpenChange(false);
        } else {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? "Failed to update site");
        }
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }, [form, mode, initialData, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Site" : `Edit ${form.name || "Site"}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Configure your new site — template, features, and branding."
              : "Update site configuration. Changes take effect on next deploy cache refresh."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ── Basic Info ──────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Basic Info
            </h3>

            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="site-slug">Slug</Label>
                <Input
                  id="site-slug"
                  placeholder="my-niche-site"
                  value={form.slug}
                  onChange={(e) =>
                    updateField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase, hyphens only. Cannot be changed after creation.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="site-name">Site Name</Label>
                <Input
                  id="site-name"
                  placeholder="BrewPerfect"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-domain">Domain</Label>
                <Input
                  id="site-domain"
                  placeholder="brewperfect.com"
                  value={form.domain}
                  onChange={(e) => updateField("domain", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => {
                    updateField("language", v);
                    if (v === "ar") updateField("direction", "rtl");
                    else updateField("direction", "ltr");
                  }}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => updateField("direction", v as "ltr" | "rtl")}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ltr">LTR</SelectItem>
                    <SelectItem value="rtl">RTL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monetization</Label>
                <Select
                  value={form.monetization_type}
                  onValueChange={(v) =>
                    updateField("monetization_type", v as "affiliate" | "ads" | "both")
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="affiliate">Affiliate</SelectItem>
                    <SelectItem value="ads">Ads</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="site-meta-title">Meta Title</Label>
                <Input
                  id="site-meta-title"
                  placeholder="BrewPerfect — Coffee Equipment Reviews"
                  value={form.meta_title}
                  onChange={(e) => updateField("meta_title", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-meta-desc">Meta Description</Label>
                <Textarea
                  id="site-meta-desc"
                  placeholder="Expert coffee gear reviews and brewing guides"
                  rows={2}
                  value={form.meta_description}
                  onChange={(e) => updateField("meta_description", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Templates ──────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Templates
            </h3>

            <div className="space-y-3">
              <Label>Homepage Layout</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOMEPAGE_TEMPLATES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => updateField("homepage_template", t.value)}
                    disabled={saving}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      form.homepage_template === t.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200"
                        : "border-gray-200 dark:border-gray-800 hover:border-gray-400"
                    }`}
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Product Card Style</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {PRODUCT_CARD_STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => updateField("product_card_style", s.value)}
                    disabled={saving}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      form.product_card_style === s.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200"
                        : "border-gray-200 dark:border-gray-800 hover:border-gray-400"
                    }`}
                  >
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Theme ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Theme Colors
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="theme-primary">Primary</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="theme-primary"
                    value={form.theme.primaryColor}
                    onChange={(e) => updateTheme("primaryColor", e.target.value)}
                    disabled={saving}
                    className="h-9 w-12 cursor-pointer rounded border"
                  />
                  <Input
                    value={form.theme.primaryColor}
                    onChange={(e) => updateTheme("primaryColor", e.target.value)}
                    disabled={saving}
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-accent">Accent</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="theme-accent"
                    value={form.theme.accentColor}
                    onChange={(e) => updateTheme("accentColor", e.target.value)}
                    disabled={saving}
                    className="h-9 w-12 cursor-pointer rounded border"
                  />
                  <Input
                    value={form.theme.accentColor}
                    onChange={(e) => updateTheme("accentColor", e.target.value)}
                    disabled={saving}
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-accent-text">Accent Text</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="theme-accent-text"
                    value={form.theme.accentTextColor}
                    onChange={(e) => updateTheme("accentTextColor", e.target.value)}
                    disabled={saving}
                    className="h-9 w-12 cursor-pointer rounded border"
                  />
                  <Input
                    value={form.theme.accentTextColor}
                    onChange={(e) => updateTheme("accentTextColor", e.target.value)}
                    disabled={saving}
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Feature Flags ─────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Feature Flags
            </h3>
            <p className="text-xs text-muted-foreground">
              Toggle features per site. Disabled features won&apos;t render any UI or routes for
              this site.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURE_FLAGS.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.description}</div>
                  </div>
                  <Switch
                    checked={!!form.features[f.key]}
                    onCheckedChange={() => toggleFeature(f.key)}
                    disabled={saving}
                    aria-label={`Toggle ${f.label}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {mode === "edit" && isSuperAdmin && initialData?.db_id && (
            <>
              <Separator />
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Modules
                </h3>
                <p className="text-xs text-muted-foreground">
                  Enable or disable modules for this site. Only super admins can change module
                  toggles.
                </p>
                <ModulesManager siteId={initialData.db_id} />
              </section>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Create Site" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
