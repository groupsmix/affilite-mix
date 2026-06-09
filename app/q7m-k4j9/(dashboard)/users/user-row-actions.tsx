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
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

import type { UsersTableRow } from "./users-table";

type DialogKind = "edit" | "toggleActive" | "resetPassword" | "delete" | null;

export interface UserRowActionsProps {
  user: UsersTableRow;
  /** Current session user id — used to prevent self-destructive actions. */
  currentUserId: string | null;
  /** True when this user is the only active super_admin left in the table. */
  isLastActiveSuperAdmin: boolean;
}

/**
 * Row actions dropdown for the admin users table.
 *
 * All actions call the existing `/api/admin/users/*` surface — no route or
 * payload changes. Client-side permission gating (self-delete, last active
 * super_admin demotion/deactivation) mirrors the server checks in
 * `app/api/admin/users/route.ts` to avoid round-trips for obvious cases.
 */
export function UserRowActions({
  user,
  currentUserId,
  isLastActiveSuperAdmin,
}: UserRowActionsProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  const isSelf = currentUserId !== null && currentUserId === user.id;
  const cannotDeactivate = user.is_active && isLastActiveSuperAdmin;
  const cannotDelete =
    isSelf || (user.is_active && user.role === "super_admin" && isLastActiveSuperAdmin);

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
          <DropdownMenuItem onSelect={() => setDialog("toggleActive")} disabled={cannotDeactivate}>
            {user.is_active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("resetPassword")}>
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
            disabled={cannotDelete}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        open={dialog === "edit"}
        onOpenChange={(next) => setDialog(next ? "edit" : null)}
      />
      <ToggleActiveDialog
        user={user}
        open={dialog === "toggleActive"}
        onOpenChange={(next) => setDialog(next ? "toggleActive" : null)}
      />
      <ResetPasswordDialog
        user={user}
        open={dialog === "resetPassword"}
        onOpenChange={(next) => setDialog(next ? "resetPassword" : null)}
      />
      <DeleteUserDialog
        user={user}
        open={dialog === "delete"}
        onOpenChange={(next) => setDialog(next ? "delete" : null)}
      />
    </>
  );
}

interface BaseDialogProps {
  user: UsersTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditUserDialog({ user, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UsersTableRow["role"]>(user.role);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(user.name);
    setRole(user.role);
    setError("");
    setSaving(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetchWithCsrf("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, name, role }),
      });

      if (res.ok) {
        toast.success("User updated");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to update user";
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
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit admin user</DialogTitle>
          <DialogDescription>
            Update the name or role for <strong>{user.email}</strong>.
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
            <Label htmlFor={`edit-user-email-${user.id}`}>Email</Label>
            <Input id={`edit-user-email-${user.id}`} value={user.email} disabled readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-user-name-${user.id}`}>Name</Label>
            <Input
              id={`edit-user-name-${user.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-user-role-${user.id}`}>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UsersTableRow["role"])}>
              <SelectTrigger id={`edit-user-role-${user.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super admin</SelectItem>
              </SelectContent>
            </Select>
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

function ToggleActiveDialog({ user, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const nextActive = !user.is_active;
  const verb = nextActive ? "Activate" : "Deactivate";

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetchWithCsrf("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, is_active: nextActive }),
      });

      if (res.ok) {
        toast.success(nextActive ? "User activated" : "User deactivated");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `Failed to ${verb.toLowerCase()} user`);
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
            {verb} {user.email}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {nextActive
              ? "Reactivating will allow this user to sign in again."
              : "Deactivating will immediately block this user from signing in. They can be reactivated later."}
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

function ResetPasswordDialog({ user, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setPassword("");
    setConfirm("");
    setError("");
    setSaving(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithCsrf("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, password }),
      });

      if (res.ok) {
        toast.success("Password reset");
        onOpenChange(false);
        reset();
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Failed to reset password";
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
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{user.email}</strong>. Share it with the user through a
            secure channel.
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
            <Label htmlFor={`reset-pw-${user.id}`}>New password</Label>
            <Input
              id={`reset-pw-${user.id}`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`reset-pw-confirm-${user.id}`}>Confirm password</Label>
            <Input
              id={`reset-pw-confirm-${user.id}`}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user, open, onOpenChange }: BaseDialogProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("User deleted");
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to delete user");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the admin user and their site memberships. This action cannot
            be undone.
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
