"use client";

import React, { useState, useMemo } from "react";
import type { MemoryCrystal } from "@/lib/types";
import { CrystalCard } from "./CrystalCard";
import { CRYSTAL_COLORS } from "@/hooks/useMemoryCrystals";
import { Grid3X3, List, Filter, Star, Swords } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface InventoryProps {
  crystals: MemoryCrystal[];
  onSelect?: (crystal: MemoryCrystal) => void;
  onEquip?: (crystal: MemoryCrystal) => void;
  onSummon?: (crystal: MemoryCrystal) => void;
  selectedId?: string;
}

type SortKey = "star" | "level" | "xp" | "name" | "type" | "recent";
type FilterType = "all" | "milestone" | "decision" | "incident" | "equipped" | "legendary" | "fused";

/* ── Component ─────────────────────────────────────────────── */

export const CrystalInventory = React.memo(function CrystalInventory({
  crystals,
  onSelect,
  onEquip,
  onSummon,
  selectedId,
}: InventoryProps) {
  const [view, setView] = useState<"grid" | "compact">("grid");
  const [sort, setSort] = useState<SortKey>("star");
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(() => {
    let list = [...crystals];

    // Filter
    switch (filter) {
      case "milestone": list = list.filter((c) => c.crystal_type === "milestone"); break;
      case "decision": list = list.filter((c) => c.crystal_type === "decision"); break;
      case "incident": list = list.filter((c) => c.crystal_type === "incident"); break;
      case "equipped": list = list.filter((c) => c.equipped_by); break;
      case "legendary": list = list.filter((c) => c.is_legendary); break;
      case "fused": list = list.filter((c) => c.is_fused); break;
    }

    // Sort
    switch (sort) {
      case "star": list.sort((a, b) => b.star_rating - a.star_rating || b.xp - a.xp); break;
      case "level": list.sort((a, b) => b.level - a.level); break;
      case "xp": list.sort((a, b) => b.xp - a.xp); break;
      case "name": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "type": list.sort((a, b) => a.crystal_type.localeCompare(b.crystal_type)); break;
      case "recent": list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }

    return list;
  }, [crystals, filter, sort]);

  // Stats
  const totalXP = crystals.reduce((s, c) => s + c.xp, 0);
  const avgStar = crystals.length > 0
    ? (crystals.reduce((s, c) => s + c.star_rating, 0) / crystals.length).toFixed(1)
    : "0";
  const equipped = crystals.filter((c) => c.equipped_by).length;
  const legendaryCount = crystals.filter((c) => c.is_legendary).length;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "#05080fcc",
        border: "1px solid #00f0ff15",
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #00f0ff10" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "#fbbf24" }}>💎</span>
          <h3 className="text-xs font-mono font-bold tracking-wider" style={{ color: "#00f0ff" }}>
            CRYSTAL INVENTORY
          </h3>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#4a6a8a", background: "#00f0ff08" }}>
            {crystals.length} crystals
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid #00f0ff15" }}>
            <button
              onClick={() => setView("grid")}
              className="px-2 py-1 transition-all"
              style={{
                background: view === "grid" ? "#00f0ff15" : "transparent",
                color: view === "grid" ? "#00f0ff" : "#4a6a8a",
              }}
            >
              <Grid3X3 className="h-3 w-3" />
            </button>
            <button
              onClick={() => setView("compact")}
              className="px-2 py-1 transition-all"
              style={{
                background: view === "compact" ? "#00f0ff15" : "transparent",
                color: view === "compact" ? "#00f0ff" : "#4a6a8a",
              }}
            >
              <List className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 flex gap-4 text-[9px] font-mono" style={{ borderBottom: "1px solid #00f0ff08" }}>
        <div style={{ color: "#4a6a8a" }}>
          Total XP: <span style={{ color: "#00f0ff" }}>{totalXP.toLocaleString()}</span>
        </div>
        <div style={{ color: "#4a6a8a" }}>
          Avg ★: <span style={{ color: "#fbbf24" }}>{avgStar}</span>
        </div>
        <div style={{ color: "#4a6a8a" }}>
          <Swords className="h-2.5 w-2.5 inline mr-0.5" />
          Equipped: <span style={{ color: "#39ff14" }}>{equipped}</span>
        </div>
        {legendaryCount > 0 && (
          <div style={{ color: "#4a6a8a" }}>
            <Star className="h-2.5 w-2.5 inline mr-0.5" />
            Legendary: <span style={{ color: "#fbbf24" }}>{legendaryCount}</span>
          </div>
        )}
      </div>

      {/* Filter + Sort */}
      <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: "1px solid #00f0ff08" }}>
        <Filter className="h-3 w-3" style={{ color: "#4a6a8a" }} />
        {(["all", "milestone", "decision", "incident", "equipped", "legendary", "fused"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded transition-all"
            style={{
              color: filter === f ? "#00f0ff" : "#4a6a8a",
              background: filter === f ? "#00f0ff10" : "transparent",
              border: `1px solid ${filter === f ? "#00f0ff22" : "transparent"}`,
            }}
          >
            {f}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-[8px] font-mono px-1 py-0.5 rounded bg-transparent"
            style={{ color: "#00f0ff88", border: "1px solid #00f0ff15" }}
          >
            <option value="star">★ Rating</option>
            <option value="level">Level</option>
            <option value="xp">XP</option>
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="recent">Recent</option>
          </select>
        </div>
      </div>

      {/* Crystal Grid */}
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl mb-2">💎</div>
            <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              {crystals.length === 0
                ? "No crystals yet — anchor a memory to create your first"
                : "No crystals match this filter"}
            </div>
          </div>
        ) : view === "compact" ? (
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((c) => (
              <CrystalCard
                key={c.id}
                crystal={c}
                compact
                selected={c.id === selectedId}
                onClick={onSelect}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((c) => (
              <CrystalCard
                key={c.id}
                crystal={c}
                selected={c.id === selectedId}
                onClick={onSelect}
                onEquip={onEquip}
                onSummon={onSummon}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
