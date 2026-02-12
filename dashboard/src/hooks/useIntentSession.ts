"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { IntentSession, IntentCommand } from "@/lib/types";

export function useIntentSessions() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<IntentSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/intent");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Realtime subscription for intent_sessions changes
  useEffect(() => {
    const channel = supabase
      .channel("intent-sessions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "intent_sessions" },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchSessions]);

  return { sessions, loading, refetch: fetchSessions };
}

export function useIntentSession(sessionId: string | null) {
  const [session, setSession] = useState<IntentSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Terminal states that don't need polling
  const isTerminal = useCallback(
    (status: string) => ["READY", "COMPLETED", "FAILED", "CANCELLED"].includes(status),
    []
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchSessionInner = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/intent/${sessionId}`);
      if (res.ok) {
        const data = await res.json() as IntentSession;
        setSession(data);
        // Stop polling when we reach a terminal state
        if (isTerminal(data.status)) {
          stopPolling();
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        setError(err.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    }
  }, [sessionId, isTerminal, stopPolling]);

  const startPolling = useCallback(
    (interval = 3000) => {
      stopPolling();
      pollRef.current = setInterval(fetchSessionInner, interval);
    },
    [stopPolling, fetchSessionInner]
  );

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    await fetchSessionInner();
    setLoading(false);
  }, [sessionId, fetchSessionInner]);

  // Poll while in an active state (THINKING or EXECUTING)
  useEffect(() => {
    if (!sessionId) return;

    // If session is already in a terminal state, fetch once and stop polling
    if (session && isTerminal(session.status)) {
      stopPolling();
      // still refresh once to ensure UI has final state
      fetchSession();
      return;
    }

    fetchSession();

    // Poll every 3s for THINKING, every 5s for EXECUTING
    const interval = session?.status === "EXECUTING" ? 5000 : 3000;
    startPolling(interval);

    return () => stopPolling();
  }, [sessionId, session?.status, session, isTerminal, fetchSession, startPolling, stopPolling]);

  const createSession = useCallback(
    async (goal: string, repository?: string, model?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal, repository, model }),
        });
        if (res.ok) {
          const data = await res.json() as IntentSession;
          setSession(data);

          // If session is already in a terminal state (local Ollama → READY), no polling
          if (!isTerminal(data.status)) {
            startPolling(3000);
          }

          return data;
        } else {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          setError(err.error || "Failed to create");
          return null;
        }
      } catch {
        setError("Network error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isTerminal, startPolling]
  );

  const sendFollowup = useCallback(
    async (message: string) => {
      if (!sessionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/intent/${sessionId}/followup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (res.ok) {
          setSession((prev) =>
            prev ? { ...prev, status: "THINKING" } : prev
          );
          startPolling(3000);
        } else {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          setError(err.error || "Failed to send follow-up");
        }
      } catch {
        setError("Network error");
      }
    },
    [sessionId, startPolling]
  );

  const executeCommands = useCallback(
    async (commands?: IntentCommand[]) => {
      if (!sessionId) return null;
      setError(null);
      try {
        const res = await fetch(`/api/intent/${sessionId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands }),
        });
        if (res.ok) {
          const data = await res.json();
          setSession((prev) =>
            prev ? { ...prev, status: "EXECUTING" } : prev
          );
          // Start polling to detect EXECUTING → COMPLETED/FAILED
          startPolling(5000);
          return data;
        } else {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          setError(err.error || "Execution failed");
          return null;
        }
      } catch {
        setError("Network error");
        return null;
      }
    },
    [sessionId, startPolling]
  );

  const stopSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/intent/${sessionId}/stop`, { method: "POST" });
      setSession((prev) =>
        prev ? { ...prev, status: "CANCELLED" } : prev
      );
      stopPolling();
    } catch {
      setError("Failed to stop");
    }
  }, [sessionId, stopPolling]);

  return {
    session,
    loading,
    error,
    createSession,
    sendFollowup,
    executeCommands,
    stopSession,
    refetch: fetchSession,
  };
}
