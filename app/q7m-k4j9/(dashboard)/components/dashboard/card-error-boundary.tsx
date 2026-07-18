"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { reportError } from "@/lib/report-error";

interface CardErrorBoundaryProps {
  children: ReactNode;
  /** Human-readable card name, used in the graceful fallback copy. */
  title: string;
}

interface CardErrorBoundaryState {
  hasError: boolean;
}

/**
 * Per-card resilient boundary for the super_admin Dashboard grid.
 *
 * `NicheHealthCard` / `RevenuePerSiteCard` are async Server Components that
 * load cross-site data (`listSites()`, `getNicheHealthStats()`,
 * `getRevenuePerSite()`). If any of those throw — e.g. an undeployed RPC or an
 * unprovisioned DB — the throw would otherwise escalate past the page into the
 * admin-dashboard error boundary (a blank crash). Wrapping each card in this
 * boundary lets the individual card degrade to a non-fatal "could not load"
 * panel while the rest of the Dashboard index renders normally.
 *
 * This mirrors the graceful "still usable + banner" pattern that
 * `safeAdminData` / `AdminDataError` provide for the page's own loaders, but at
 * the component-render level (which is where async Server Component errors must
 * be caught).
 */
export class CardErrorBoundary extends Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
  constructor(props: CardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): CardErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="py-6 text-center">
            <h2 className="text-base font-semibold text-amber-950">
              {this.props.title} could not load
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-amber-900 dark:text-amber-200">
              This card is temporarily unavailable, so it has been hidden instead of crashing the
              dashboard. Try again after the database or migration issue is fixed.
            </p>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
