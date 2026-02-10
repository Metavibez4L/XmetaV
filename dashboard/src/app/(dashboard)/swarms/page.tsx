"use client";

import React, { useState, useCallback } from "react";
import { Network, Plus, Activity, Clock } from "lucide-react";
import { SwarmCreate } from "@/components/SwarmCreate";
import { SwarmActiveRuns } from "@/components/SwarmActiveRuns";
import { SwarmHistory } from "@/components/SwarmHistory";
import { useSwarmRuns } from "@/hooks/useSwarmRuns";

type Tab = "create" | "active" | "history";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "create", label: "Create", icon: <Plus className="h-3.5 w-3.5" /> },
  { id: "active", label: "Active", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "history", label: "History", icon: <Clock className="h-3.5 w-3.5" /> },
];

export default function SwarmsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const { activeRuns, historyRuns, taskMap, fetchTasks, refetch } = useSwarmRuns();

  const handleCreated = useCallback(() => {
    setActiveTab("active");
    refetch();
  }, [refetch]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: "#00f0ff08", border: "1px solid #00f0ff15" }}
        >
          <Network className="h-5 w-5" style={{ color: "#00f0ff" }} />
        </div>
        <div>
          <h1
            className="text-xl font-mono font-bold tracking-wider neon-glow"
            style={{ color: "#00f0ff" }}
          >
            SWARMS
          </h1>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "#4a6a8a" }}>
            Multi-agent orchestration // parallel, pipeline, collaborative
          </p>
        </div>

        {/* Active badge */}
        {activeRuns.length > 0 && (
          <div
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: "#00f0ff08", border: "1px solid #00f0ff20" }}
          >
            <div
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: "#00f0ff", boxShadow: "0 0 6px #00f0ff" }}
            />
            <span className="text-[10px] font-mono" style={{ color: "#00f0ff" }}>
              {activeRuns.length} active
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg"
        style={{ background: "#0a0f1a", border: "1px solid #00f0ff08" }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const badge =
            tab.id === "active" && activeRuns.length > 0
              ? activeRuns.length
              : tab.id === "history" && historyRuns.length > 0
                ? historyRuns.length
                : null;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
              style={
                isActive
                  ? {
                      background: "#00f0ff12",
                      border: "1px solid #00f0ff30",
                      color: "#00f0ff",
                      boxShadow: "0 0 8px #00f0ff11",
                    }
                  : {
                      background: "transparent",
                      border: "1px solid transparent",
                      color: "#4a6a8a",
                    }
              }
            >
              {tab.icon}
              {tab.label}
              {badge !== null && (
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: tab.id === "active" ? "#00f0ff15" : "#4a6a8a15",
                    color: tab.id === "active" ? "#00f0ff" : "#4a6a8a",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "create" && <SwarmCreate onCreated={handleCreated} />}
        {activeTab === "active" && (
          <SwarmActiveRuns runs={activeRuns} taskMap={taskMap} fetchTasks={fetchTasks} />
        )}
        {activeTab === "history" && (
          <SwarmHistory runs={historyRuns} taskMap={taskMap} fetchTasks={fetchTasks} />
        )}
      </div>
    </div>
  );
}
