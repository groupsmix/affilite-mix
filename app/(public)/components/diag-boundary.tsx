"use client";

import React from "react";

// TEMPORARY DIAGNOSTIC error boundary — catches render-phase errors during SSR
// and prints the real message+stack into the HTML so we can read it via curl.
// Remove after debugging.
export class DiagBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <pre data-diag="render-error" style={{ whiteSpace: "pre-wrap", padding: 16 }}>
          {"DIAG_RENDER_ERROR\nNAME: "}
          {this.state.error?.name}
          {"\nMESSAGE: "}
          {this.state.error?.message}
          {"\nSTACK:\n"}
          {this.state.error?.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}
