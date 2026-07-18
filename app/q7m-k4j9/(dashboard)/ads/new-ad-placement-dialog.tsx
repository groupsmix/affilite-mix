"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { AdPlacementRow, AdPlacementType, AdProvider } from "@/types/database";
import { ImageUploader } from "../components/image-uploader";

const PLACEMENT_TYPES: { value: AdPlacementType; label: string }[] = [
  { value: "sidebar", label: "Sidebar" },
  { value: "in_content", label: "In-article" },
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "between_posts", label: "Between posts" },
];

const PROVIDERS: { value: AdProvider; label: string }[] = [
  { value: "image", label: "Image / banner (self-served)" },
  { value: "adsense", label: "Google AdSense" },
  { value: "carbon", label: "Carbon Ads" },
  { value: "ethicalads", label: "EthicalAds" },
  { value: "custom", label: "Custom HTML" },
];

interface NewAdPlacementDialogProps {
  ad?: AdPlacementRow | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

/**
 * Ad placement dialog. Supports both creating a new placement and editing an
 * existing one via the optional `ad` prop. Reuses `POST /api/admin/ads` and
 * `PUT /api/admin/ads/:id`.
 */
export function NewAdPlacementDialog({
  ad,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  children,
}: NewAdPlacementDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const onOpenChange = onOpenChangeProp ?? setInternalOpen;

  const isEdit = Boolean(ad);

  const [name, setName] = useState("");
  const [placementType, setPlacementType] = useState<AdPlacementType>("sidebar");
  const [provider, setProvider] = useState<AdProvider>("image");
  const [adCode, setAdCode] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isImage = provider === "image";

  function resetForm() {
    if (ad) {
      const cfg = (ad.config ?? {}) as Record<string, unknown>;
      setName(ad.name);
      setPlacementType(ad.placement_type);
      setProvider(ad.provider);
      setAdCode(ad.ad_code ?? "");
      setImageUrl(typeof cfg.image_url === "string" ? cfg.image_url : "");
      setClickUrl(typeof cfg.click_url === "string" ? cfg.click_url : "");
      setAlt(typeof cfg.alt === "string" ? cfg.alt : "");
      setPriority(ad.priority ?? 0);
      setIsActive(ad.is_active);
    } else {
      setName("");
      setPlacementType("sidebar");
      setProvider("image");
      setAdCode("");
      setImageUrl("");
      setClickUrl("");
      setAlt("");
      setPriority(0);
      setIsActive(true);
    }
    setError("");
  }

  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const body = isImage
      ? {
          name,
          placement_type: placementType,
          provider,
          ad_code: null,
          config: { ...(ad?.config ?? {}), image_url: imageUrl, click_url: clickUrl, alt },
          is_active: isActive,
          priority,
        }
      : {
          name,
          placement_type: placementType,
          provider,
          ad_code: adCode || null,
          config: ad?.config ?? {},
          is_active: isActive,
          priority,
        };
    const url = isEdit && ad ? `/api/admin/ads/${ad.id}` : "/api/admin/ads";

    try {
      const res = await fetchWithCsrf(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(isEdit ? "Ad placement updated" : "Ad placement created");
        onOpenChange(false);
        if (!isEdit) resetForm();
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to save ad placement";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      {children || (
        <DialogTrigger asChild>
          <Button>Add placement</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit ad placement" : "Add ad placement"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this ad slot. Changes take effect immediately on the public site."
              : "Create a new ad slot. You can fine-tune the config (including a custom CPM) after it is created."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="grid gap-4"
        >
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="new-ad-name">Key</Label>
            <Input
              id="new-ad-name"
              type="text"
              autoComplete="off"
              placeholder="e.g. sidebar-top, in-content-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-ad-placement-type">Slot</Label>
              <Select
                value={placementType}
                onValueChange={(value) => setPlacementType(value as AdPlacementType)}
              >
                <SelectTrigger id="new-ad-placement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENT_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-ad-provider">Provider</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as AdProvider)}>
                <SelectTrigger id="new-ad-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-ad-priority">Priority</Label>
            <Input
              id="new-ad-priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>
          {isImage ? (
            <>
              <ImageUploader
                value={imageUrl}
                onChange={setImageUrl}
                label="Ad image"
                placeholder="Upload a banner/creative"
                id="new-ad-image"
              />
              <p className="-mt-2 text-xs text-muted-foreground">
                For a CPA/affiliate offer, download the network&apos;s banner and upload it here
                (creatives must be hosted on this site&apos;s own CDN to display), then paste the
                offer&apos;s tracking link below as the click-through URL.
              </p>
              <p className="text-xs text-muted-foreground">
                Renders in whichever slot you pick: header, footer, in-article, sidebar (article
                pages), or between posts (listing pages).
              </p>
              <div className="grid gap-2">
                <Label htmlFor="new-ad-click-url">Click-through URL</Label>
                <Input
                  id="new-ad-click-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/landing-page"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Where the ad links when clicked (opens in a new tab, marked
                  rel=&quot;sponsored&quot;).
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-ad-alt">Alt text</Label>
                <Input
                  id="new-ad-alt"
                  type="text"
                  placeholder="Describe the ad for screen readers"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="new-ad-code">Ad code</Label>
              <Textarea
                id="new-ad-code"
                rows={4}
                placeholder="Paste your ad code (HTML/JS snippet) here…"
                value={adCode}
                onChange={(e) => setAdCode(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Note: script/HTML ad networks are stored but not yet rendered on the public site.
                Use “Image / banner” for ads that display today.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="new-ad-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            />
            <Label htmlFor="new-ad-active" className="text-sm font-normal">
              Active placement
            </Label>
          </div>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create placement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
