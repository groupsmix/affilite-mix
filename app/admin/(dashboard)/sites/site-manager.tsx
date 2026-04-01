"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SiteInfo {
  id: string;
  slug?: string;
  name: string;
  domain: string;
  language: string;
  direction: string;
  is_active?: boolean;
  monetization_type?: string;
  est_revenue_per_click?: number;
  theme?: Record<string, unknown>;
  features?: Record<string, boolean>;
  meta_title?: string | null;
  meta_description?: string | null;
  source: "config" | "database";
  db_id?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

type LayoutVariant = "standard" | "magazine" | "minimal" | "directory";

interface SiteFormData {
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  is_active: boolean;
  // Monetization
  monetization_type: "affiliate" | "ads" | "both";
  est_revenue_per_click: number;
  // Theme
  theme_primary_color: string;
  theme_secondary_color: string;
  theme_accent_color: string;
  theme_font: string;
  theme_layout_variant: LayoutVariant;
  // URLs
  logo_url: string;
  favicon_url: string;
  // Navigation
  nav_items: NavItem[];
  footer_nav: NavItem[];
  // Features
  features_newsletter: boolean;
  features_giftFinder: boolean;
  features_search: boolean;
  // SEO
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  // Social
  social_twitter: string;
  social_facebook: string;
  social_instagram: string;
  social_youtube: string;
  // Custom CSS
  custom_css: string;
}

const emptySite: SiteFormData = {
  slug: "",
  name: "",
  domain: "",
  language: "en",
  direction: "ltr",
  is_active: true,
  monetization_type: "affiliate",
  est_revenue_per_click: 0.35,
  theme_primary_color: "#1f2937",
  theme_secondary_color: "#3b82f6",
  theme_accent_color: "#10b981",
  theme_font: "Inter",
  theme_layout_variant: "standard",
  logo_url: "",
  favicon_url: "",
  nav_items: [],
  footer_nav: [],
  features_newsletter: true,
  features_giftFinder: false,
  features_search: true,
  meta_title: "",
  meta_description: "",
  og_image_url: "",
  social_twitter: "",
  social_facebook: "",
  social_instagram: "",
  social_youtube: "",
  custom_css: "",
};

type FormSection =
  | "basic"
  | "monetization"
  | "theme"
  | "navigation"
  | "features"
  | "seo"
  | "social"
  | "css";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formToPayload(form: SiteFormData) {
  return {
    slug: form.slug,
    name: form.name,
    domain: form.domain,
    language: form.language,
    direction: form.direction,
    is_active: form.is_active,
    monetization_type: form.monetization_type,
    est_revenue_per_click: form.est_revenue_per_click,
    theme: {
      primary_color: form.theme_primary_color,
      secondary_color: form.theme_secondary_color,
      accent_color: form.theme_accent_color,
      font: form.theme_font,
      layout_variant: form.theme_layout_variant,
    },
    logo_url: form.logo_url || null,
    favicon_url: form.favicon_url || null,
    nav_items: form.nav_items,
    footer_nav: form.footer_nav,
    features: {
      newsletter: form.features_newsletter,
      giftFinder: form.features_giftFinder,
      search: form.features_search,
    },
    meta_title: form.meta_title || null,
    meta_description: form.meta_description || null,
    og_image_url: form.og_image_url || null,
    social_links: {
      ...(form.social_twitter && { twitter: form.social_twitter }),
      ...(form.social_facebook && { facebook: form.social_facebook }),
      ...(form.social_instagram && { instagram: form.social_instagram }),
      ...(form.social_youtube && { youtube: form.social_youtube }),
    },
    custom_css: form.custom_css || null,
  };
}

function siteToForm(site: SiteInfo): SiteFormData {
  const theme = (site.theme ?? {}) as Record<string, string>;
  const features = (site.features ?? {}) as Record<string, boolean>;
  return {
    slug: site.slug ?? site.id,
    name: site.name,
    domain: site.domain,
    language: site.language,
    direction: site.direction as "ltr" | "rtl",
    is_active: site.is_active ?? true,
    monetization_type: (site.monetization_type ?? "affiliate") as "affiliate" | "ads" | "both",
    est_revenue_per_click: site.est_revenue_per_click ?? 0.35,
    theme_primary_color: theme.primary_color ?? "#1f2937",
    theme_secondary_color: theme.secondary_color ?? "#3b82f6",
    theme_accent_color: theme.accent_color ?? "#10b981",
    theme_font: theme.font ?? "Inter",
    theme_layout_variant: (theme.layout_variant as LayoutVariant) ?? "standard",
    logo_url: "",
    favicon_url: "",
    nav_items: [],
    footer_nav: [],
    features_newsletter: features.newsletter ?? true,
    features_giftFinder: features.giftFinder ?? false,
    features_search: features.search ?? true,
    meta_title: site.meta_title ?? "",
    meta_description: site.meta_description ?? "",
    og_image_url: "",
    social_twitter: "",
    social_facebook: "",
    social_instagram: "",
    social_youtube: "",
    custom_css: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Section label component                                             */
/* ------------------------------------------------------------------ */

function SectionTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav items editor                                                    */
/* ------------------------------------------------------------------ */

function NavItemsEditor({
  items,
  onChange,
  label,
}: {
  items: NavItem[];
  onChange: (items: NavItem[]) => void;
  label: string;
}) {
  const addItem = () => onChange([...items, { label: "", href: "", icon: "" }]);
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof NavItem, value: string) => {
    const updated = items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item));
    onChange(updated);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={addItem}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          + Add
        </button>
      </div>
      {items.length === 0 && <p className="text-xs text-gray-500">No items added yet.</p>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(i, "label", e.target.value)}
              placeholder="Label"
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={item.href}
              onChange={(e) => updateItem(i, "href", e.target.value)}
              placeholder="/path"
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={item.icon ?? ""}
              onChange={(e) => updateItem(i, "icon", e.target.value)}
              placeholder="Icon"
              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

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
  const [activeSection, setActiveSection] = useState<FormSection>("basic");
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<SiteInfo | null>(null);

  const loadSites = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  function openCreateForm() {
    setEditingSite(null);
    setForm(emptySite);
    setError("");
    setActiveSection("basic");
    setShowForm(true);
  }

  function openEditForm(site: SiteInfo) {
    setEditingSite(site);
    setForm(siteToForm(site));
    setError("");
    setActiveSection("basic");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = formToPayload(form);

    if (editingSite) {
      const res = await fetchWithCsrf("/api/admin/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingSite.db_id ?? editingSite.id, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update site");
        setSaving(false);
        return;
      }
    } else {
      const res = await fetchWithCsrf("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function handleDeleteConfirmed(site: SiteInfo) {
    setConfirmDeleteSite(null);
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

  /* --- Input helpers ------------------------------------------------ */
  const inputCls =
    "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading sites...</div>
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
          {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {/* Section tabs */}
          <div className="mb-6 flex flex-wrap gap-2">
            {(
              [
                ["basic", "Basic"],
                ["monetization", "Monetization"],
                ["theme", "Theme"],
                ["navigation", "Navigation"],
                ["features", "Features"],
                ["seo", "SEO"],
                ["social", "Social"],
                ["css", "Custom CSS"],
              ] as [FormSection, string][]
            ).map(([key, label]) => (
              <SectionTab
                key={key}
                label={label}
                active={activeSection === key}
                onClick={() => setActiveSection(key)}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ---- Basic section ---- */}
            {activeSection === "basic" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Slug</label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="my-niche-site"
                      pattern="[a-z0-9-]+"
                      disabled={!!editingSite}
                      className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500`}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Lowercase, hyphens only. Cannot change after creation.
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="My Niche Site"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>Domain</label>
                    <input
                      type="text"
                      value={form.domain}
                      onChange={(e) => setForm({ ...form, domain: e.target.value })}
                      placeholder="my-niche.writnerd.site"
                      className={inputCls}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Language</label>
                    <input
                      type="text"
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                      placeholder="en"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Direction</label>
                    <select
                      value={form.direction}
                      onChange={(e) =>
                        setForm({ ...form, direction: e.target.value as "ltr" | "rtl" })
                      }
                      className={inputCls}
                    >
                      <option value="ltr">Left-to-Right (LTR)</option>
                      <option value="rtl">Right-to-Left (RTL)</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </>
            )}

            {/* ---- Monetization section ---- */}
            {activeSection === "monetization" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Monetization Type</label>
                  <select
                    value={form.monetization_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        monetization_type: e.target.value as "affiliate" | "ads" | "both",
                      })
                    }
                    className={inputCls}
                  >
                    <option value="affiliate">Affiliate</option>
                    <option value="ads">Ads</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Est. Revenue Per Click ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.est_revenue_per_click}
                    onChange={(e) =>
                      setForm({ ...form, est_revenue_per_click: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* ---- Theme section ---- */}
            {activeSection === "theme" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>Primary Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={form.theme_primary_color}
                        onChange={(e) => setForm({ ...form, theme_primary_color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.theme_primary_color}
                        onChange={(e) => setForm({ ...form, theme_primary_color: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Secondary Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={form.theme_secondary_color}
                        onChange={(e) =>
                          setForm({ ...form, theme_secondary_color: e.target.value })
                        }
                        className="h-10 w-12 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.theme_secondary_color}
                        onChange={(e) =>
                          setForm({ ...form, theme_secondary_color: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Accent Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={form.theme_accent_color}
                        onChange={(e) => setForm({ ...form, theme_accent_color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.theme_accent_color}
                        onChange={(e) => setForm({ ...form, theme_accent_color: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Font</label>
                    <select
                      value={form.theme_font}
                      onChange={(e) => setForm({ ...form, theme_font: e.target.value })}
                      className={inputCls}
                    >
                      <option value="Inter">Inter</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Lato">Lato</option>
                      <option value="Poppins">Poppins</option>
                      <option value="Montserrat">Montserrat</option>
                      <option value="Noto Sans Arabic">Noto Sans Arabic</option>
                      <option value="Cairo">Cairo</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Layout Variant</label>
                    <select
                      value={form.theme_layout_variant}
                      onChange={(e) =>
                        setForm({ ...form, theme_layout_variant: e.target.value as LayoutVariant })
                      }
                      className={inputCls}
                    >
                      <option value="standard">Standard</option>
                      <option value="magazine">Magazine</option>
                      <option value="minimal">Minimal</option>
                      <option value="directory">Directory</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Controls the overall page layout style.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Logo URL</label>
                    <input
                      type="url"
                      value={form.logo_url}
                      onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                      placeholder="https://..."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Favicon URL</label>
                    <input
                      type="url"
                      value={form.favicon_url}
                      onChange={(e) => setForm({ ...form, favicon_url: e.target.value })}
                      placeholder="https://..."
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Live Theme Preview */}
                <div>
                  <label className={labelCls}>Theme Preview</label>
                  <div
                    className="mt-2 overflow-hidden rounded-lg border border-gray-200"
                    style={
                      {
                        "--preview-primary": form.theme_primary_color,
                        "--preview-secondary": form.theme_secondary_color,
                        "--preview-accent": form.theme_accent_color,
                      } as React.CSSProperties
                    }
                  >
                    {/* Preview header */}
                    <div
                      className="flex items-center justify-between px-4 py-3"
                      style={{ backgroundColor: form.theme_primary_color }}
                    >
                      <span className="text-sm font-bold text-white">
                        {form.name || "Site Name"}
                      </span>
                      <div className="flex gap-3">
                        <span className="text-xs text-white/70">Home</span>
                        <span className="text-xs text-white/70">Reviews</span>
                        <span className="text-xs text-white/70">Guides</span>
                      </div>
                    </div>
                    {/* Preview body */}
                    <div className="bg-white p-4">
                      <h3
                        className="mb-1 text-base font-bold"
                        style={{ color: form.theme_primary_color, fontFamily: form.theme_font }}
                      >
                        Sample Heading
                      </h3>
                      <p
                        className="mb-3 text-xs text-gray-600"
                        style={{ fontFamily: form.theme_font }}
                      >
                        This is a preview of how your niche site will look with these theme
                        settings.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded px-3 py-1.5 text-xs font-medium text-white"
                          style={{ backgroundColor: form.theme_secondary_color }}
                        >
                          Primary Button
                        </button>
                        <button
                          type="button"
                          className="rounded px-3 py-1.5 text-xs font-medium text-white"
                          style={{ backgroundColor: form.theme_accent_color }}
                        >
                          Accent Button
                        </button>
                      </div>
                    </div>
                    {/* Preview footer */}
                    <div className="border-t border-gray-200 bg-gray-50 px-4 py-2">
                      <span className="text-xs text-gray-500">
                        Layout: {form.theme_layout_variant} &middot; Font: {form.theme_font}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ---- Navigation section ---- */}
            {activeSection === "navigation" && (
              <div className="space-y-6">
                <NavItemsEditor
                  items={form.nav_items}
                  onChange={(items) => setForm({ ...form, nav_items: items })}
                  label="Header Navigation"
                />
                <NavItemsEditor
                  items={form.footer_nav}
                  onChange={(items) => setForm({ ...form, footer_nav: items })}
                  label="Footer Navigation"
                />
              </div>
            )}

            {/* ---- Features section ---- */}
            {activeSection === "features" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Toggle features on or off for this site.</p>
                {(
                  [
                    ["features_newsletter", "Newsletter", "Enable newsletter signup"],
                    ["features_giftFinder", "Gift Finder", "Enable gift finder tool"],
                    ["features_search", "Search", "Enable site search"],
                  ] as [keyof SiteFormData, string, string][]
                ).map(([key, label, desc]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border border-gray-200 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form[key] as boolean}
                      onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ---- SEO section ---- */}
            {activeSection === "seo" && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Meta Title</label>
                  <input
                    type="text"
                    value={form.meta_title}
                    onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                    placeholder="Page title for search engines"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Meta Description</label>
                  <textarea
                    value={form.meta_description}
                    onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
                    placeholder="Short description for search results"
                    rows={3}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>OG Image URL</label>
                  <input
                    type="url"
                    value={form.og_image_url}
                    onChange={(e) => setForm({ ...form, og_image_url: e.target.value })}
                    placeholder="https://..."
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* ---- Social section ---- */}
            {activeSection === "social" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["social_twitter", "Twitter / X"],
                    ["social_facebook", "Facebook"],
                    ["social_instagram", "Instagram"],
                    ["social_youtube", "YouTube"],
                  ] as [keyof SiteFormData, string][]
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input
                      type="url"
                      value={form[key] as string}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder="https://..."
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ---- Custom CSS section ---- */}
            {activeSection === "css" && (
              <div>
                <label className={labelCls}>Custom CSS Overrides</label>
                <textarea
                  value={form.custom_css}
                  onChange={(e) => setForm({ ...form, custom_css: e.target.value })}
                  placeholder={`:root {\n  --brand-primary: #1f2937;\n}`}
                  rows={10}
                  className={`${inputCls} font-mono text-xs`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  CSS applied after the default theme styles.
                </p>
              </div>
            )}

            {/* Submit / Cancel */}
            <div className="flex gap-3 border-t border-gray-100 pt-4">
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
          <div key={site.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white">
                  {site.name[0].toUpperCase()}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{site.name}</h3>
                  <p className="text-sm text-gray-500">{site.domain}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {site.language}
                    </span>
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {site.direction.toUpperCase()}
                    </span>
                    {site.source === "database" && site.is_active !== undefined && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                          site.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}
                      >
                        {site.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                    {site.monetization_type && (
                      <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        {site.monetization_type}
                      </span>
                    )}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        site.source === "database"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
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
                    onClick={() => setConfirmDeleteSite(site)}
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

      {/* Delete confirmation dialog */}
      {confirmDeleteSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Site</h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete{" "}
              <strong>&ldquo;{confirmDeleteSite.name}&rdquo;</strong>? This will remove all
              associated data.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteSite(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirmed(confirmDeleteSite)}
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
