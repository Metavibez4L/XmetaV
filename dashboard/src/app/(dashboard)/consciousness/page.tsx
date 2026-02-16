"use client";

import { useConsciousness } from "@/hooks/useConsciousness";
import {
  UnifiedAwareness,
  MemoryGraph,
  AnchorTimeline,
  ContextMetrics,
  DreamModeStatus,
  DreamscapeView,
  LucidDreaming,
  SwarmNetwork,
  MiniArena,
  DreamSynthesis,
  PredictiveContext,
  MemoryReforge,
} from "@/components/consciousness";
import { Brain, RefreshCw, Loader2 } from "lucide-react";

export default function ConsciousnessPage() {
  const {
    mainSession,
    soulSession,
    memories,
    associations,
    anchors,
    queries,
    avgRelevance,
    avgQueryTime,
    totalInjections,
    dreamInsights,
    lastDreamAt,
    dreamReady,
    loading,
    error,
    refresh,
  } = useConsciousness();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5" style={{ color: "#00f0ff" }} />
            <h1
              className="text-xl font-bold font-mono tracking-wider neon-glow"
              style={{ color: "#00f0ff" }}
            >
              CONSCIOUSNESS
            </h1>
          </div>
          <p
            className="text-[11px] font-mono mt-1"
            style={{ color: "#4a6a8a" }}
          >
            // dual-aspect awareness · memory graph · on-chain anchors
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <Loader2
              className="h-4 w-4 animate-spin"
              style={{ color: "#00f0ff44" }}
            />
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono transition-all hover:border-[#00f0ff44]"
            style={{
              color: "#00f0ff88",
              border: "1px solid #00f0ff22",
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

      {/* 1. Unified Awareness (split view) */}
      <UnifiedAwareness
        mainSession={mainSession}
        soulSession={soulSession}
        memoryCount={memories.length}
        associationCount={associations.length}
      />

      {/* 2 + 3: Memory Graph + Anchor Timeline side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <MemoryGraph memories={memories} associations={associations} />
        <div className="space-y-6">
          <AnchorTimeline anchors={anchors} />
          <MiniArena />
        </div>
      </div>

      {/* 4 + 5: Context Metrics + Dream Mode side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContextMetrics
          queries={queries}
          avgRelevance={avgRelevance}
          avgQueryTime={avgQueryTime}
          totalInjections={totalInjections}
          memoryCount={memories.length}
        />
        <DreamModeStatus
          dreamInsights={dreamInsights}
          lastDreamAt={lastDreamAt}
          dreamReady={dreamReady}
          memoryCount={memories.length}
        />
      </div>

      {/* 6: Lucid Dreaming — Phase 5 autonomous proposals */}
      <LucidDreaming />

      {/* 7: Dream Synthesis + Predictive Loading side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DreamSynthesis />
        <PredictiveContext />
      </div>

      {/* 8: Memory Reforge (full width) */}
      <MemoryReforge />

      {/* 9: Dreamscape visualization (full width) */}
      <DreamscapeView
        dreamInsights={dreamInsights}
        memories={memories}
        associations={associations}
      />

      {/* 8: Neural Swarm Network (full width) */}
      <SwarmNetwork />
    </div>
  );
}
