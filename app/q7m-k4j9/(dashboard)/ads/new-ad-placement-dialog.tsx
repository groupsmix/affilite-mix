"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { AdPlacementType, AdProvider } from "@/types/database";

const PLACEMENT_TYPES: { value: AdPlacementType; label: string }[] = [
  { value: "sidebar", label: "Sidebar" },
  { value: "in_content", label: "In-article" },
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "between_posts", label: "Between posts" },
];

const PROVIDERS: { value: AdProvider; label: string }[] = [
  { value: "adsense", label: "Google AdSense" },
  { value: "carbon", label: "Carbon Ads" },
  { value: "ethicalads", label: "EthicalAds" },
  { value: "custom", label: "Custom HTML" },
];

/**
 * Minimal "Add placement" dialog. Reuses the existing
 * `POST /api/admin/ads` route — no new server surface area. Mirrors the
 * fields from the legacy inline form in `<AdPlacementList>` that this task
 * is retiring.
 */
export function NewAdPlacementDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [placementType, setPlacementType] = useState<AdPlacementType>("sidebar");
  const [provider, setProvider] = useState<AdProvider>("adsense");
  const [adCode, setAdCode] = useState("");
  const [priority, setPriority] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName("");
    setPlacementType("sidebar");
    setProvider("adsense");
    setAdCode("");
    setPriority(0);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetchWithCsrf("/api/admin/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          placement_type: placementType,
          provider,
          ad_code: adCode || null,
          config: {},
          is_active: true,
          priority,
        }),
      });

      if (res.ok) {
        toast.success("Ad placement created");
        setOpen(false);
        resetForm();
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to create ad placement";
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
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>Add placement</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add ad placement</DialogTitle>
          <DialogDescription>
            Create a new ad slot. You can fine-tune the config (including a custom CPM) after it is
            created.
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
          </div>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create placement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
