"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Appearance,
  ContainerWidth,
  FooterConfig,
  HeaderConfig,
  HeaderTokens,
  LayoutVariant,
  LogoMode,
  NavAlignment,
  Presentation,
  PresentationNavItem,
} from "@/config/presentation";
import {
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_HEADER_TOKENS,
} from "@/config/presentation";

const VARIANTS: LayoutVariant[] = ["standard", "compare", "magazine", "minimal", "directory"];
const LOGO_MODES: LogoMode[] = ["wordmark", "image", "image-and-text"];
const NAV_ALIGNMENTS: NavAlignment[] = ["start", "center", "end"];
const CONTAINER_WIDTHS: ContainerWidth[] = ["standard", "wide", "full"];
const APPEARANCES: Appearance[] = ["light", "dark"];
const MAX_STRIP_ITEMS = 12;

interface VersionSummary {
  id: string;
  version: number | null;
  published_at: string | null;
}

interface PresentationState {
  published: Presentation | null;
  draft: Presentation | null;
  effective: Presentation;
  versions: VersionSummary[];
}

interface Draft {
  headerVariant: LayoutVariant;
  footerVariant: LayoutVariant;
  header: HeaderConfig;
  footer: FooterConfig;
  headerTokens: HeaderTokens;
}

function toDraft(p: Presentation): Draft {
  return {
    headerVariant: p.headerVariant,
    footerVariant: p.footerVariant,
    header: p.header,
    footer: p.footer,
    headerTokens: p.headerTokens,
  };
}

/** Empty token inputs are sent as null (= inherit from the global theme). */
function tokenOrNull(value: string): string | null {
  const s = value.trim();
  return s.length === 0 ? null : s;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function TitleCase({ value }: { value: string }) {
  return <>{value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ")}</>;
}

export function PresentationEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, setState] = useState<PresentationState | null>(null);

  async function load() {
    try {
      const res = await fetchWithCsrf("/api/admin/presentations");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to load design settings");
        return;
      }
      const data = (await res.json()) as PresentationState;
      setState(data);
      setDraft(toDraft(data.draft ?? data.effective));
    } catch {
      toast.error("Failed to load design settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function patchHeader(patch: Partial<HeaderConfig>) {
    setDraft((d) => (d ? { ...d, header: { ...d.header, ...patch } } : d));
  }
  function patchFooter(patch: Partial<FooterConfig>) {
    setDraft((d) => (d ? { ...d, footer: { ...d.footer, ...patch } } : d));
  }
  function patchTokens(patch: Partial<HeaderTokens>) {
    setDraft((d) => (d ? { ...d, headerTokens: { ...d.headerTokens, ...patch } } : d));
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetchWithCsrf("/api/admin/presentations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headerVariant: draft.headerVariant,
          footerVariant: draft.footerVariant,
          headerConfig: draft.header,
          footerConfig: draft.footer,
          headerTokens: draft.headerTokens,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to save draft");
        return;
      }
      toast.success("Draft saved. Publish to make it live.");
      await load();
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: "publish" | "rollback") {
    setActing(true);
    try {
      const res = await fetchWithCsrf("/api/admin/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `Failed to ${action}`);
        return;
      }
      toast.success(
        action === "publish"
          ? "Design published — it is now live."
          : "Rolled back to the previous version.",
      );
      await load();
    } catch {
      toast.error(`Failed to ${action}`);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading design settings…</p>;
  if (!draft || !state) return <p className="text-sm text-muted-foreground">No design data.</p>;

  const strip = draft.header.categoryStrip;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Edits are saved as a draft and only go live when you publish. You can roll back to the
            previous published version in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Live version:{" "}
            <span className="font-medium text-foreground">
              {state.published ? "published" : "none (using code defaults)"}
            </span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => void handleSave()} disabled={saving || acting}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button onClick={() => void handleAction("publish")} disabled={saving || acting}>
              Publish
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleAction("rollback")}
              disabled={saving || acting || state.versions.length === 0}
            >
              Roll back
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Layout</CardTitle>
          <CardDescription>Header and footer designs are chosen independently.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Header design</Label>
            <Select
              value={draft.headerVariant}
              onValueChange={(v) => setDraft({ ...draft, headerVariant: v as LayoutVariant })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIANTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    <TitleCase value={v} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Footer design</Label>
            <Select
              value={draft.footerVariant}
              onValueChange={(v) => setDraft({ ...draft, footerVariant: v as LayoutVariant })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIANTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    <TitleCase value={v} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Logo mode</Label>
              <Select
                value={draft.header.logoMode}
                onValueChange={(v) => patchHeader({ logoMode: v as LogoMode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_MODES.map((v) => (
                    <SelectItem key={v} value={v}>
                      <TitleCase value={v} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nav alignment</Label>
              <Select
                value={draft.header.navAlignment}
                onValueChange={(v) => patchHeader({ navAlignment: v as NavAlignment })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAV_ALIGNMENTS.map((v) => (
                    <SelectItem key={v} value={v}>
                      <TitleCase value={v} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Container width</Label>
              <Select
                value={draft.header.containerWidth}
                onValueChange={(v) => patchHeader({ containerWidth: v as ContainerWidth })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_WIDTHS.map((v) => (
                    <SelectItem key={v} value={v}>
                      <TitleCase value={v} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.header.showSearch}
                onCheckedChange={(c) => patchHeader({ showSearch: c })}
              />
              <span className="text-sm">Show search</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.header.sticky}
                onCheckedChange={(c) => patchHeader({ sticky: c })}
              />
              <span className="text-sm">Sticky header</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.header.showCta}
                onCheckedChange={(c) => patchHeader({ showCta: c })}
              />
              <span className="text-sm">Show CTA button</span>
            </label>
          </div>

          {draft.header.showCta && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CTA label</Label>
                <Input
                  value={draft.header.ctaLabel}
                  maxLength={120}
                  onChange={(e) => patchHeader({ ctaLabel: e.target.value })}
                  placeholder="Compare now"
                />
              </div>
              <div className="space-y-2">
                <Label>CTA link</Label>
                <Input
                  value={draft.header.ctaHref}
                  onChange={(e) => patchHeader({ ctaHref: e.target.value })}
                  placeholder="/comparison or https://…"
                />
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.header.announcement.enabled}
                onCheckedChange={(c) =>
                  patchHeader({ announcement: { ...draft.header.announcement, enabled: c } })
                }
              />
              <span className="text-sm font-medium">Announcement bar</span>
            </label>
            {draft.header.announcement.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Text</Label>
                  <Input
                    value={draft.header.announcement.text}
                    maxLength={200}
                    onChange={(e) =>
                      patchHeader({
                        announcement: { ...draft.header.announcement, text: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link (optional)</Label>
                  <Input
                    value={draft.header.announcement.href ?? ""}
                    onChange={(e) =>
                      patchHeader({
                        announcement: {
                          ...draft.header.announcement,
                          href: tokenOrNull(e.target.value),
                        },
                      })
                    }
                    placeholder="/deals or https://…"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <Switch
                checked={strip.enabled}
                onCheckedChange={(c) => patchHeader({ categoryStrip: { ...strip, enabled: c } })}
              />
              <span className="text-sm font-medium">Category strip</span>
            </label>
            {strip.enabled && (
              <div className="space-y-2">
                {strip.items.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={item.label}
                      maxLength={120}
                      placeholder="Label"
                      onChange={(e) => {
                        const items = [...strip.items];
                        items[i] = { ...item, label: e.target.value };
                        patchHeader({ categoryStrip: { ...strip, items } });
                      }}
                    />
                    <Input
                      value={item.href}
                      placeholder="/category/…"
                      onChange={(e) => {
                        const items = [...strip.items];
                        items[i] = { ...item, href: e.target.value };
                        patchHeader({ categoryStrip: { ...strip, items } });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const items = strip.items.filter((_, idx) => idx !== i);
                        patchHeader({ categoryStrip: { ...strip, items } });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {strip.items.length < MAX_STRIP_ITEMS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const items: PresentationNavItem[] = [
                        ...strip.items,
                        { label: "", href: "" },
                      ];
                      patchHeader({ categoryStrip: { ...strip, items } });
                    }}
                  >
                    Add category
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Header colours &amp; type</CardTitle>
          <CardDescription>
            Leave a field blank to inherit from the site theme. Only colours, lengths and font names
            are accepted — no CSS is stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Appearance</Label>
            <Select
              value={draft.headerTokens.appearance}
              onValueChange={(v) => patchTokens({ appearance: v as Appearance })}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPEARANCES.map((v) => (
                  <SelectItem key={v} value={v}>
                    <TitleCase value={v} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["background", "Background", "#0f172a"],
                ["foreground", "Text colour", "#ffffff"],
                ["accent", "Accent", "#3b82f6"],
                ["border", "Border", "#e5e7eb"],
                ["height", "Height", "64px"],
                ["fontFamily", "Font family", "Inter"],
              ] as const
            ).map(([key, label, ph]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  value={draft.headerTokens[key] ?? ""}
                  placeholder={ph}
                  onChange={(e) => patchTokens({ [key]: tokenOrNull(e.target.value) })}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2">
            <Switch
              checked={draft.footer.showNewsletter}
              onCheckedChange={(c) => patchFooter({ showNewsletter: c })}
            />
            <span className="text-sm">Show newsletter signup</span>
          </label>
          <div className="space-y-2">
            <Label>Container width</Label>
            <Select
              value={draft.footer.containerWidth}
              onValueChange={(v) => patchFooter({ containerWidth: v as ContainerWidth })}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINER_WIDTHS.map((v) => (
                  <SelectItem key={v} value={v}>
                    <TitleCase value={v} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Previous published versions, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No previous versions yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {state.versions.map((v) => (
                <li key={v.id} className="flex justify-between">
                  <span>Version {v.version ?? "—"}</span>
                  <span className="text-muted-foreground">{formatDate(v.published_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Defaults shown when nothing is configured: {DEFAULT_HEADER_CONFIG.logoMode} logo, search{" "}
        {DEFAULT_HEADER_CONFIG.showSearch ? "on" : "off"}, newsletter{" "}
        {DEFAULT_FOOTER_CONFIG.showNewsletter ? "on" : "off"}, {DEFAULT_HEADER_TOKENS.appearance}{" "}
        header.
      </p>
    </div>
  );
}
