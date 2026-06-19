"use client";

/**
 * F-030 client side of step-up re-authentication.
 *
 * Exposes:
 *  - `fetchWithStepUp(url, opts)` — a drop-in for `fetchWithCsrf` that, on a
 *    step-up 403, prompts the user to re-verify (password + TOTP when enabled),
 *    re-mints `step_up_at` via POST /api/auth/step-up, then retries the original
 *    request once. Any other response is returned untouched.
 *  - `<StepUpDialog />` — mounted once in the admin layout; it owns the prompt
 *    UI and registers itself as the active prompt handler.
 *
 * The prompt is promise-based and registered at module scope so the non-React
 * `fetchWithStepUp` can drive it. Every code path resolves the pending promise
 * exactly once (success → true; cancel/close/unmount/superseded → false) so a
 * caller's `await fetchWithStepUp(...)` can never hang. If no dialog is mounted,
 * `requestStepUp` resolves false immediately and the original 403 is returned.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { STEP_UP_ENDPOINT, STEP_UP_REQUIRED_HEADER_NAME } from "@/lib/step-up-shared";

// ── Module-level prompt registry ────────────────────────────────────────────
type StepUpPrompt = (reason?: string) => Promise<boolean>;
let activePrompt: StepUpPrompt | null = null;

function registerStepUpPrompt(fn: StepUpPrompt): () => void {
  activePrompt = fn;
  return () => {
    if (activePrompt === fn) activePrompt = null;
  };
}

/**
 * Open the step-up re-auth dialog. Resolves true once the user has successfully
 * re-verified, or false if they cancel — or if no dialog is currently mounted.
 */
export async function requestStepUp(reason?: string): Promise<boolean> {
  if (!activePrompt) return false;
  return activePrompt(reason);
}

/**
 * Drop-in replacement for `fetchWithCsrf` that transparently handles step-up.
 * On a step-up 403 (tagged with the shared header by `requireStepUpAuth`) it
 * prompts for re-verification and retries the request once on success.
 */
export async function fetchWithStepUp(url: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetchWithCsrf(url, opts);
  if (res.status === 403 && res.headers.get(STEP_UP_REQUIRED_HEADER_NAME)) {
    const ok = await requestStepUp();
    if (ok) return fetchWithCsrf(url, opts);
  }
  return res;
}

// ── Dialog (mounted once in the admin layout) ───────────────────────────────
interface PendingPrompt {
  reason?: string;
  resolve: (ok: boolean) => void;
}

export function StepUpDialog() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Mirror `pending` into a ref so the unmount cleanup can cancel it.
  const pendingRef = useRef<PendingPrompt | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const unregister = registerStepUpPrompt(
      (reason) =>
        new Promise<boolean>((resolve) => {
          setPassword("");
          setTotp("");
          setError("");
          setSubmitting(false);
          setPending((prev) => {
            // Cancel any superseded prompt so its awaiter never hangs.
            prev?.resolve(false);
            return { reason, resolve };
          });
        }),
    );
    return () => {
      unregister();
      pendingRef.current?.resolve(false);
    };
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Password is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(STEP_UP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, totp_token: totp || undefined }),
      });
      if (res.ok) {
        toast.success("Identity confirmed.");
        close(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Verification failed. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next && !submitting) close(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it&apos;s you</DialogTitle>
          <DialogDescription>
            {pending?.reason ??
              "This action requires recent verification. Re-enter your password to continue."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
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
            <Label htmlFor="step-up-password">Password</Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="step-up-totp">Authentication code</Label>
            <Input
              id="step-up-totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p className="text-xs text-muted-foreground">
              Required if 2FA is enabled on your account.
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Verifying…
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
