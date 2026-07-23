"use client";

import * as React from "react";
import { Button } from "./Button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error.name, error.message, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
          <AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
          <h2 className="text-lg font-weight-emphasis">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-text-secondary">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <Button onClick={this.handleRetry} leadingIcon={<RefreshCw className="h-4 w-4" />}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
