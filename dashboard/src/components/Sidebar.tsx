"use client";

import React, { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { LayoutDashboard, MessageSquare, Users, LogOut, Hexagon, X, Network } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, shortcut: "01", key: "1" },
  { href: "/agent", label: "Agent Chat", icon: MessageSquare, shortcut: "02", key: "2" },
  { href: "/swarms", label: "Swarms", icon: Network, shortcut: "03", key: "3" },
  { href: "/fleet", label: "Fleet", icon: Users, shortcut: "04", key: "4" },
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
              <Icon className={cn("h-4 w-4 transition-all", active && "drop-shadow-[0_0_4px_#00f0ff88]")} />
              <span className="flex-1 text-xs tracking-wide">{label}</span>
              <span className={cn(
                "text-[9px] transition-opacity",
                active ? "opacity-60" : "opacity-0 group-hover:opacity-30"
              )}>
                {shortcut}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t shrink-0" style={{ borderColor: '#00f0ff10' }}>
        <div className="px-3 py-1 mb-1">
          <div className="text-[8px] font-mono" style={{ color: '#00f0ff15' }}>
            &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 rounded px-3 py-2 text-xs font-mono transition-all duration-200 hover:text-[#ff2d8a] group"
          style={{ color: '#4a6a8a', borderLeft: '2px solid transparent' }}
        >
          <LogOut className="h-3.5 w-3.5 group-hover:drop-shadow-[0_0_4px_#ff2d8a88] transition-all" />
          <span className="tracking-wide">Disconnect</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex h-screen w-56 flex-col border-r shrink-0"
        style={{ background: 'linear-gradient(180deg, #060b14 0%, #05080f 100%)', borderColor: '#00f0ff12' }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-56 flex-col lg:hidden"
            style={{ background: 'linear-gradient(180deg, #060b14 0%, #05080f 100%)', borderRight: '1px solid #00f0ff12' }}
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
});
