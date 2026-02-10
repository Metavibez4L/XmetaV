"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Menu } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen scanline-overlay">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center h-12 px-4 border-b lg:hidden shrink-0"
          style={{ borderColor: '#00f0ff10', background: '#060b14' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded"
            style={{ color: '#00f0ff88' }}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-sm font-mono font-bold tracking-wider" style={{ color: '#00f0ff' }}>
            XMETAV
          </span>
        </div>

        <main className="flex-1 overflow-auto cyber-bg hex-pattern">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
