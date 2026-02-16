"use client";

import { useState, useCallback } from "react";
import { useMemoryCrystals } from "@/hooks/useMemoryCrystals";
import {
  CrystalInventory,
  FusionChamber,
  SummonOverlay,
  LimitBreakBanner,
  MemoryCosmos,
  QuestTracker,
} from "@/components/crystals";
import type { MemoryCrystal } from "@/lib/types";
import { Gem, RefreshCw, Loader2 } from "lucide-react";

export default function MemoryCosmosPage() {
  const {
    crystals,
    fusions,
    summons,
    activeLimitBreak,
    achievements,
    dailyQuests,
    loading,
    error,
    refresh,
    fuseCrystals,
    summonCrystal,
    equipCrystal,
    unequipCrystal,
  } = useMemoryCrystals();

  const [selectedCrystal, setSelectedCrystal] = useState<MemoryCrystal | null>(null);
  const [summonTarget, setSummonTarget] = useState<MemoryCrystal | null>(null);

  const handleEquip = useCallback(
    async (crystal: MemoryCrystal) => {
      if (crystal.equipped_by) {
        await unequipCrystal(crystal.id);
      } else {
        await equipCrystal(crystal.id, crystal.agent_id);
      }
    },
    [equipCrystal, unequipCrystal]
  );

  const handleSummon = useCallback((crystal: MemoryCrystal) => {
    setSummonTarget(crystal);
  }, []);

  const handleSummonExecute = useCallback(
    async (crystalId: string, context: string) => {
      await summonCrystal(crystalId, context);
    },
    [summonCrystal]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Gem className="h-5 w-5" style={{ color: "#a855f7" }} />
            <h1
              className="text-xl font-bold font-mono tracking-wider"
              style={{ color: "#a855f7", textShadow: "0 0 20px #a855f744" }}
            >
              MEMORY COSMOS
            </h1>
          </div>
          <p
            className="text-[11px] font-mono mt-1"
            style={{ color: "#4a6a8a" }}
          >
            // crystal materia · fusion chamber · memory summons · the cosmos
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <Loader2
              className="h-4 w-4 animate-spin"
              style={{ color: "#a855f744" }}
            />
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono transition-all hover:border-[#a855f744]"
            style={{
              color: "#a855f788",
              border: "1px solid #a855f722",
              background: "#05080fcc",
            }}
          >
            <RefreshCw className="h-3 w-3" />
            REFRESH
          </button>
        </div>
      </div>

      {error && (
        <div
          className="px-4 py-2 rounded text-[10px] font-mono"
          style={{
            color: "#ef4444",
            background: "#ef444410",
            border: "1px solid #ef444422",
          }}
        >
          {error}
        </div>
      )}

      {/* Limit Break Banner (if active) */}
      <LimitBreakBanner limitBreak={activeLimitBreak} />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "CRYSTALS", value: crystals.length, color: "#00f0ff", icon: "💎" },
          { label: "FUSIONS", value: fusions.length, color: "#a855f7", icon: "🔮" },
          { label: "SUMMONS", value: summons.length, color: "#ff006e", icon: "🦋" },
          {
            label: "LEGENDARY",
            value: crystals.filter((c) => c.is_legendary).length,
            color: "#fbbf24",
            icon: "⚡",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg px-4 py-3"
            style={{
              background: "#05080fcc",
              border: `1px solid ${stat.color}15`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                {stat.label}
              </span>
              <span className="text-sm">{stat.icon}</span>
            </div>
            <div className="text-2xl font-mono font-bold mt-1" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Memory Cosmos (explorable world) */}
      <MemoryCosmos
        crystals={crystals}
        onSelect={(crystal) => setSelectedCrystal(crystal)}
      />

      {/* Crystal Inventory */}
      <CrystalInventory
        crystals={crystals}
        selectedId={selectedCrystal?.id}
        onSelect={setSelectedCrystal}
        onEquip={handleEquip}
        onSummon={handleSummon}
      />

      {/* Fusion Chamber */}
      <FusionChamber crystals={crystals} onFuse={fuseCrystals} />

      {/* Quests & Achievements */}
      <QuestTracker achievements={achievements} dailyQuests={dailyQuests} />

      {/* Summon Overlay (modal) */}
      <SummonOverlay
        crystal={summonTarget}
        onClose={() => setSummonTarget(null)}
        onSummon={handleSummonExecute}
      />
    </div>
  );
}
