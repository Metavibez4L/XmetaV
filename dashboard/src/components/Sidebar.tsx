"use client";

import React, { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { LayoutDashboard, MessageSquare, Users, LogOut, Hexagon, X, Network, Zap, Wallet, Fingerprint, Coins, Terminal, Swords, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, shortcut: "01", key: "1" },
  { href: "/intent", label: "Intent", icon: Zap, shortcut: "02", key: "2" },
  { href: "/consciousness", label: "Consciousness", icon: Brain, shortcut: "03", key: "3" },
  { href: "/agent", label: "Agent Chat", icon: MessageSquare, shortcut: "04", key: "4" },
  { href: "/swarms", label: "Swarms", icon: Network, shortcut: "05", key: "5" },
  { href: "/fleet", label: "Fleet", icon: Users, shortcut: "06", key: "6" },
  { href: "/payments", label: "Payments", icon: Wallet, shortcut: "07", key: "7" },
  { href: "/identity", label: "Identity", icon: Fingerprint, shortcut: "08", key: "8" },
  { href: "/token", label: "$XMETAV", icon: Coins, shortcut: "09", key: "9" },
  { href: "/logs", label: "Logs", icon: Terminal, shortcut: "10", key: "0" },
  { href: "/arena", label: "Arena", icon: Swords, shortcut: "11" },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar = React.memo(function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }, [supabase]);

  // Keyboard navigation: Ctrl+1/2/3 for nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const item = NAV_ITEMS.find((n) => n.key === e.key);
      if (item) {
        e.preventDefault();
        window.location.href = item.href;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4 gap-2 shrink-0" style={{ borderColor: '#00f0ff15' }}>
        <Hexagon className="h-5 w-5" style={{ color: '#00f0ff' }} />
        <span className="text-lg font-bold tracking-[0.15em] font-mono neon-glow" style={{ color: '#00f0ff' }}>
          XMETAV
        </span>
        {/* Close button for mobile */}
        {onClose && (
          <button onClick={onClose} className="ml-auto lg:hidden">
            <X className="h-4 w-4" style={{ color: '#4a6a8a' }} />
          </button>
        )}
      </div>

      {/* Status */}
      <div className="px-4 py-2 border-b shrink-0" style={{ borderColor: '#00f0ff08' }}>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#39ff14', boxShadow: '0 0 6px #39ff14' }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#39ff1466' }}>
            System Active
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2 mt-1 overflow-auto">
        <div className="px-3 mb-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: '#00f0ff33' }}>
            Navigation
          </span>
        </div>
        {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "group flex items-center gap-3 rounded px-3 py-2.5 text-sm font-mono transition-all duration-200 relative",
                active ? "text-[#00f0ff]" : "text-[#4a6a8a] hover:text-[#00f0ff99]"
              )}
              style={active ? {
                background: 'linear-gradient(90deg, #00f0ff08, transparent)',
                borderLeft: '2px solid #00f0ff',
                boxShadow: 'inset 4px 0 15px -5px #00f0ff22',
              } : {
                borderLeft: '2px solid transparent',
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <span className="text-[9px] opacity-40 font-mono">{shortcut}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sign Out */}
      <div className="p-2 border-t shrink-0" style={{ borderColor: '#00f0ff08' }}>
        <button
          onClick={handleSignOut}
          className="group flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-mono transition-colors text-[#4a6a8a] hover:text-[#ff2d5e]"
          style={{ borderLeft: '2px solid transparent' }}
        >
          <LogOut className="h-4 w-4 shrink-0 transition-colors" />
          <span>Disconnect</span>
        </button>
      </div>
    </>
  );

  // Mobile overlay drawer
  if (open) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
        <aside className="fixed left-0 top-0 z-50 h-full w-64 flex flex-col bg-[#05080f] border-r lg:hidden" style={{ borderColor: '#00f0ff15' }}>
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside className="sticky top-0 z-30 h-screen w-64 shrink-0 hidden lg:flex flex-col bg-[#05080f] border-r" style={{ borderColor: '#00f0ff15' }}>
      {sidebarContent}
    </aside>
  );
});
