"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("success");
    setEmail("");
  };

  return (
    <section className="bg-secondary/20 py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="rounded-2xl border border-border bg-card p-8 text-center md:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-6 w-6" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight font-playfair">
            Get the best watch deals, weekly
          </h2>
          <p className="mt-4 text-muted-foreground">
            One email. No spam. The best price drops, new releases, and buying guides under $500.
          </p>

          {status === "success" ? (
            <p className="mt-8 text-center font-medium text-primary">
              You’re in — check your inbox for a confirmation.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button type="submit" className="shrink-0">
                Subscribe
              </Button>
            </form>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            By subscribing you agree to our Privacy Policy and affiliate disclosure.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
