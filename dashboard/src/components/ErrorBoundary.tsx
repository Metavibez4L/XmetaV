"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
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
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="cyber-card rounded-lg p-8 max-w-md text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-4" style={{ color: '#ff2d5e' }} />
            <h2 className="text-sm font-mono font-bold mb-2" style={{ color: '#ff2d5e' }}>
              [ SYSTEM ERROR ]
            </h2>
            <p className="text-[11px] font-mono mb-4" style={{ color: '#4a6a8a' }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="flex items-center gap-2 mx-auto px-4 py-2 rounded text-[10px] font-mono uppercase tracking-wider cyber-btn"
            >
              <RefreshCw className="h-3 w-3" />
              Reload System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
