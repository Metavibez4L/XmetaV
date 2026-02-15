"use client";

import React from "react";
import type { MemoryAchievement, DailyQuest } from "@/lib/types";
import { Trophy, Calendar, Check, Lock, Star } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface QuestTrackerProps {
  achievements: MemoryAchievement[];
  dailyQuests: DailyQuest[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#fbbf24",
  legendary: "#a855f7",
};

/* ── Component ─────────────────────────────────────────────── */

export const QuestTracker = React.memo(function QuestTracker({
  achievements,
  dailyQuests,
}: QuestTrackerProps) {
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const dailyDone = dailyQuests.filter((q) => q.completed).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Achievements */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "#05080fcc",
          border: "1px solid #fbbf2415",
        }}
      >
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #fbbf2410" }}>
          <Trophy className="h-4 w-4" style={{ color: "#fbbf24" }} />
          <h3 className="text-xs font-mono font-bold tracking-wider" style={{ color: "#fbbf24" }}>
            ACHIEVEMENTS
          </h3>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#4a6a8a", background: "#fbbf2408" }}>
            {unlocked}/{achievements.length}
          </span>
        </div>

        <div className="p-3 space-y-1.5 max-h-[300px] overflow-y-auto">
          {achievements.map((ach) => {
            const tierColor = TIER_COLORS[ach.tier] || "#4a6a8a";
            const pct = ach.target > 0 ? Math.min(ach.progress / ach.target, 1) : 0;

            return (
              <div
                key={ach.id}
                className="flex items-center gap-3 rounded px-3 py-2 transition-all"
                style={{
                  background: ach.unlocked
                    ? hexToRgba(tierColor, 0.06)
                    : "#05080f",
                  border: `1px solid ${ach.unlocked ? hexToRgba(tierColor, 0.2) : "#ffffff06"}`,
                }}
              >
                {/* Icon */}
                <div className="text-sm">{ach.icon || "🏆"}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{ color: ach.unlocked ? tierColor : "#4a6a8a" }}
                    >
                      {ach.name}
                    </span>
                    <span
                      className="text-[7px] font-mono uppercase px-1 rounded"
                      style={{
                        color: tierColor,
                        background: hexToRgba(tierColor, 0.1),
                      }}
                    >
                      {ach.tier}
                    </span>
                  </div>
                  <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                    {ach.description}
                  </div>

                  {/* Progress bar */}
                  {!ach.unlocked && (
                    <div className="mt-1">
                      <div className="flex justify-between text-[7px] font-mono" style={{ color: hexToRgba(tierColor, 0.4) }}>
                        <span>{ach.progress}/{ach.target}</span>
                        <span>{(pct * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-0.5 rounded-full mt-0.5" style={{ background: hexToRgba(tierColor, 0.1) }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct * 100}%`,
                            background: tierColor,
                            boxShadow: `0 0 4px ${hexToRgba(tierColor, 0.3)}`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Status */}
                {ach.unlocked ? (
                  <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#39ff14" }} />
                ) : (
                  <Lock className="h-3 w-3 shrink-0" style={{ color: "#4a6a8a33" }} />
                )}
              </div>
            );
          })}

          {achievements.length === 0 && (
            <div className="text-center py-6 text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
              Achievements loading...
            </div>
          )}
        </div>
      </div>

      {/* Daily Quests */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "#05080fcc",
          border: "1px solid #39ff1415",
        }}
      >
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #39ff1410" }}>
          <Calendar className="h-4 w-4" style={{ color: "#39ff14" }} />
          <h3 className="text-xs font-mono font-bold tracking-wider" style={{ color: "#39ff14" }}>
            DAILY QUESTS
          </h3>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#4a6a8a", background: "#39ff1408" }}>
            {dailyDone}/{dailyQuests.length}
          </span>
        </div>

        <div className="p-3 space-y-1.5">
          {dailyQuests.map((quest) => (
            <div
              key={quest.id}
              className="flex items-center gap-3 rounded px-3 py-2.5 transition-all"
              style={{
                background: quest.completed ? "#39ff1406" : "#05080f",
                border: `1px solid ${quest.completed ? "#39ff1422" : "#ffffff06"}`,
              }}
            >
              {/* Quest type icon */}
              <div className="text-sm">
                {quest.quest_type === "anchor" && "⚓"}
                {quest.quest_type === "summon" && "🦋"}
                {quest.quest_type === "fuse" && "🔮"}
                {quest.quest_type === "explore" && "🌐"}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-mono font-bold"
                  style={{ color: quest.completed ? "#39ff14" : "#00f0ff88" }}
                >
                  {quest.title}
                </div>
                {quest.description && (
                  <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                    {quest.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>
                    {quest.progress}/{quest.target}
                  </span>
                  <span className="text-[7px] font-mono flex items-center gap-0.5" style={{ color: "#fbbf2466" }}>
                    <Star className="h-2 w-2" />
                    {quest.xp_reward} XP
                  </span>
                </div>
              </div>

              {/* Status */}
              {quest.completed ? (
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#39ff14" }} />
              ) : (
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ border: "1px solid #4a6a8a33" }}
                />
              )}
            </div>
          ))}

          {dailyQuests.length === 0 && (
            <div className="text-center py-6 text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
              No quests today — they reset at midnight
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
