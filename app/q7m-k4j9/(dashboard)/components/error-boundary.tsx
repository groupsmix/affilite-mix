"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { reportError } from "@/lib/report-error";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  /** Optional callback when the user clicks "Retry" */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div>
          {this.props.fallback}
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Retry loading editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
