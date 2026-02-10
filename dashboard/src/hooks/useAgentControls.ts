"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentControl } from "@/lib/types";

type ControlsMap = Record<string, AgentControl>;

export function useAgentControls() {
  const [controls, setControls] = useState<ControlsMap>({});
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const loadedRef = useRef(false);

  const fetchControls = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/agents/controls", { cache: "no-store" });
    const data = (await res.json().catch(() => [])) as AgentControl[] | { error?: string };
    if (Array.isArray(data)) {
      const map: ControlsMap = {};
      for (const row of data) map[row.agent_id] = row;
      setControls(map);
    }
    setLoading(false);
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    fetchControls();

    const channel = supabase
      .channel("agent-controls")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_controls" },
        (payload) => {
          const row = payload.new as AgentControl;
          setControls((prev) => ({ ...prev, [row.agent_id]: row }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchControls, supabase]);

  const isEnabled = useCallback(
    (agentId: string) => {
      const row = controls[agentId];
      // Default: enabled if no row exists yet
      return row ? !!row.enabled : true;
    },
    [controls]
  );

  const setEnabled = useCallback(async (agentId: string, enabled: boolean) => {
    const res = await fetch("/api/agents/controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, enabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
    const row = (await res.json()) as AgentControl;
    setControls((prev) => ({ ...prev, [row.agent_id]: row }));
    return row;
  }, []);

  return { controls, loading, isEnabled, setEnabled, refetch: fetchControls };
}

