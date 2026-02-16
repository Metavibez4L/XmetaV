"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type {
  MemoryCrystal,
  MemoryFusion,
  MemorySummon,
  LimitBreak,
  MemoryAchievement,
  DailyQuest,
} from "@/lib/types";

/* ── Types ─────────────────────────────────────────────────── */

export interface CrystalData {
  crystals: MemoryCrystal[];
  fusions: MemoryFusion[];
  summons: MemorySummon[];
  activeLimitBreak: LimitBreak | null;
  achievements: MemoryAchievement[];
  dailyQuests: DailyQuest[];
  loading: boolean;
  error: string | null;
}

/* ── Constants ─────────────────────────────────────────────── */

const CRYSTAL_COLORS: Record<string, string> = {
  cyan: "#00f0ff",
  magenta: "#ff006e",
  gold: "#fbbf24",
  red: "#ef4444",
  green: "#39ff14",
  purple: "#a855f7",
  amber: "#f59e0b",
};

export { CRYSTAL_COLORS };

const REFRESH_INTERVAL = 12_000;

/* ── Hook ──────────────────────────────────────────────────── */

export function useMemoryCrystals(): CrystalData & {
  refresh: () => void;
  fuseCrystals: (aId: string, bId: string) => Promise<MemoryCrystal | null>;
  summonCrystal: (crystalId: string, context: string) => Promise<void>;
  equipCrystal: (crystalId: string, agentId: string) => Promise<void>;
  unequipCrystal: (crystalId: string) => Promise<void>;
} {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<CrystalData>({
    crystals: [],
    fusions: [],
    summons: [],
    activeLimitBreak: null,
    achievements: [],
    dailyQuests: [],
    loading: true,
    error: null,
  });

  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [
        crystalsRes,
        fusionsRes,
        summonsRes,
        limitRes,
        achievementsRes,
        questsRes,
      ] = await Promise.all([
        supabase
          .from("memory_crystals")
          .select("*")
          .order("star_rating", { ascending: false })
          .order("xp", { ascending: false })
          .limit(200),
        supabase
          .from("memory_fusions")
          .select("*")
          .order("fused_at", { ascending: false })
          .limit(50),
        supabase
          .from("memory_summons")
          .select("*")
          .order("summoned_at", { ascending: false })
          .limit(50),
        supabase
          .from("limit_breaks")
          .select("*")
          .eq("active", true)
          .limit(1),
        supabase
          .from("memory_achievements")
          .select("*")
          .order("tier"),
        supabase
          .from("daily_quests")
          .select("*")
          .eq("quest_date", today)
          .order("created_at"),
      ]);

      if (!mountedRef.current) return;

      setData({
        crystals: (crystalsRes.data ?? []) as MemoryCrystal[],
        fusions: (fusionsRes.data ?? []) as MemoryFusion[],
        summons: (summonsRes.data ?? []) as MemorySummon[],
        activeLimitBreak: ((limitRes.data ?? [])[0] as LimitBreak) ?? null,
        achievements: (achievementsRes.data ?? []) as MemoryAchievement[],
        dailyQuests: (questsRes.data ?? []) as DailyQuest[],
        loading: false,
        error: null,
      });
    } catch (err) {
      if (mountedRef.current) {
        setData((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    }
  }, [supabase]);

  // Fusion action
  const fuseCrystalsAction = useCallback(
    async (aId: string, bId: string): Promise<MemoryCrystal | null> => {
      // Call bridge API to fuse (or do client-side for now)
      const res = await fetch("/api/crystals/fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crystalAId: aId, crystalBId: bId }),
      });
      if (!res.ok) return null;
      const result = await res.json();
      await fetchAll();
      return result.crystal;
    },
    [fetchAll]
  );

  // Summon action
  const summonCrystalAction = useCallback(
    async (crystalId: string, context: string) => {
      await fetch("/api/crystals/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crystalId, context }),
      });
      await fetchAll();
    },
    [fetchAll]
  );

  // Equip
  const equipAction = useCallback(
    async (crystalId: string, agentId: string) => {
      await supabase
        .from("memory_crystals")
        .update({ equipped_by: agentId })
        .eq("id", crystalId);
      await fetchAll();
    },
    [supabase, fetchAll]
  );

  // Unequip
  const unequipAction = useCallback(
    async (crystalId: string) => {
      await supabase
        .from("memory_crystals")
        .update({ equipped_by: null })
        .eq("id", crystalId);
      await fetchAll();
    },
    [supabase, fetchAll]
  );

  // Realtime subscription for crystals
  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const iv = setInterval(fetchAll, REFRESH_INTERVAL);

    // Subscribe to realtime changes
    const channel = supabase
      .channel("crystal_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memory_crystals" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "limit_breaks" },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, supabase]);

  return {
    ...data,
    refresh: fetchAll,
    fuseCrystals: fuseCrystalsAction,
    summonCrystal: summonCrystalAction,
    equipCrystal: equipAction,
    unequipCrystal: unequipAction,
  };
}
