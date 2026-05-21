// Visual layout adapted from https://github.com/arhamkhnz/next-shadcn-admin-dashboard (MIT).

"use client";

import { useState } from "react";

import { useSearchParams } from "next/navigation";

import Link from "next/link";

import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();

  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");

      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter");

      return;
    }

    if (!/[a-z]/.test(password)) {
      setError("Password must contain at least one lowercase letter");

      return;
    }

    if (!/\d/.test(password)) {
      setError("Password must contain at least one digit");

      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("Password must contain at least one special character");

      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");

      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();

    if (res.ok) {
      setSuccess(true);
    } else {
      setError(data.error ?? "Failed to reset password");
    }

    setLoading(false);
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle>
              <h1 className="text-2xl font-bold">Invalid Link</h1>
            </CardTitle>

            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>

          <CardFooter className="justify-center">
            <Button asChild variant="link">
              <Link href="/admin/login">Back to Login</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle>
              <h1 className="text-2xl font-bold">Password Reset</h1>
            </CardTitle>

            <CardDescription>
              Your password has been reset successfully. You can now sign in with your new password.
            </CardDescription>
          </CardHeader>

          <CardFooter className="justify-center">
            <Button asChild className="w-full">
              <Link href="/admin/login">Sign In</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle>
            <h1 className="text-2xl font-bold">Reset Password</h1>
          </CardTitle>

          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-600">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>

              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, digit, special"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>

              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="justify-center">
          <Link
            href="/admin/login"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Back to Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
