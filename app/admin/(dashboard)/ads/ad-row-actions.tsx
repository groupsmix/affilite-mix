"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { AdPlacementType, AdProvider } from "@/types/database";

import type { AdsTableRow } from "./ads-table";

type DialogKind = "edit" | "toggleActive" | "delete" | null;

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

export interface AdRowActionsProps {
  placement: AdsTableRow;
}

/**
 * Row actions dropdown for the admin ad placements table.
 *
 * All actions call the existing `/api/admin/ads/*` surface (PUT / DELETE on
 * `/api/admin/ads/[id]`) — no route or payload changes. Delete is guarded by
 * an AlertDialog confirmation; on success each action shows a toast and
 * triggers a `router.refresh()` so the server-rendered table re-fetches.
 */
export function AdRowActions({ placement }: AdRowActionsProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Row actions">
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("toggleActive")}>
            {placement.is_active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditAdDialog
        placement={placement}
        open={dialog === "edit"}
        onOpenChange={(next) => setDialog(next ? "edit" : null)}
      />
      <ToggleActiveDialog
        placement={placement}
        open={dialog === "toggleActive"}
        onOpenChange={(next) => setDialog(next ? "toggleActive" : null)}
      />
      <DeleteAdDialog
        placement={placement}
        open={dialog === "delete"}
        onOpenChange={(next) => setDialog(next ? "delete" : null)}
      />
    </>
  );
}

interface BaseDialogProps {
  placement: AdsTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditAdDialog({ placement, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(placement.name);
  const [placementType, setPlacementType] = useState<AdPlacementType>(placement.placement_type);
  const [provider, setProvider] = useState<AdProvider>(placement.provider);
  const [adCode, setAdCode] = useState("");
  const [priority, setPriority] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(placement.name);
    setPlacementType(placement.placement_type);
    setProvider(placement.provider);
    setAdCode("");
    setPriority(0);
    setLoaded(false);
    setError("");
    setSaving(false);
  }

  // Load ad_code + priority on first open — they are not part of AdsTableRow
  // (which only carries the columns the table needs). Falls back silently if
  // the fetch fails; name/slot/provider are still editable.
  async function ensureLoaded() {
    if (loaded) return;
    try {
      const res = await fetch("/api/admin/ads");
      if (res.ok) {
        const rows = (await res.json()) as {
          id: string;
          ad_code: string | null;
          priority: number;
        }[];
        const row = rows.find((r) => r.id === placement.id);
        if (row) {
          setAdCode(row.ad_code ?? "");
          setPriority(row.priority ?? 0);
        }
      }
    } catch {
      // Non-fatal — the form still lets the admin save the other fields.
    } finally {
      setLoaded(true);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetchWithCsrf(`/api/admin/ads/${placement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          placement_type: placementType,
          provider,
          ad_code: adCode || null,
          priority,
        }),
      });

      if (res.ok) {
        toast.success("Ad placement updated");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to update ad placement";
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
        if (next) void ensureLoaded();
        else reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit ad placement</DialogTitle>
          <DialogDescription>
            Update the configuration for <strong>{placement.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="grid gap-4"
        >
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`edit-ad-name-${placement.id}`}>Key</Label>
            <Input
              id={`edit-ad-name-${placement.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`edit-ad-slot-${placement.id}`}>Slot</Label>
              <Select
                value={placementType}
                onValueChange={(value) => setPlacementType(value as AdPlacementType)}
              >
                <SelectTrigger id={`edit-ad-slot-${placement.id}`}>
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
              <Label htmlFor={`edit-ad-provider-${placement.id}`}>Provider</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as AdProvider)}>
                <SelectTrigger id={`edit-ad-provider-${placement.id}`}>
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
            <Label htmlFor={`edit-ad-priority-${placement.id}`}>Priority</Label>
            <Input
              id={`edit-ad-priority-${placement.id}`}
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-ad-code-${placement.id}`}>Ad code</Label>
            <Textarea
              id={`edit-ad-code-${placement.id}`}
              value={adCode}
              onChange={(e) => setAdCode(e.target.value)}
              rows={5}
              placeholder="Paste your ad code (HTML/JS snippet) here…"
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActiveDialog({ placement, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const nextActive = !placement.is_active;
  const verb = nextActive ? "Activate" : "Deactivate";

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/ads/${placement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });

      if (res.ok) {
        toast.success(nextActive ? "Ad placement activated" : "Ad placement deactivated");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `Failed to ${verb.toLowerCase()} ad placement`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verb} {placement.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {nextActive
              ? "Reactivating will start serving this ad on the public site again."
              : "Deactivating will immediately stop serving this ad on the public site. It can be reactivated later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={saving}
            className={cn(!nextActive && buttonVariants({ variant: "destructive" }))}
          >
            {saving ? `${verb.replace(/e$/, "")}ing…` : verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAdDialog({ placement, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/ads/${placement.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Ad placement deleted");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to delete ad placement");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {placement.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the ad placement and immediately stops serving the ad on the
            public site. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={deleting}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
