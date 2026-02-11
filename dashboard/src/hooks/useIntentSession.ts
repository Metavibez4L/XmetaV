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

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intent/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        // Stop polling if no longer THINKING
        if (data.status !== "THINKING" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        setError(err.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [sessionId]);

  // Poll while THINKING -- skip if session is already in a terminal/ready state
  useEffect(() => {
    if (!sessionId) return;

    // If session is already loaded and not THINKING, no need to start polling
    if (session && session.status !== "THINKING") return;

    fetchSession();

    // Poll every 3s while THINKING
    pollRef.current = setInterval(fetchSession, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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

          // If session is already READY (local Ollama), skip polling entirely
          if (data.status === "READY") {
            // No polling needed -- commands are already present
            return data;
          }

          // Cursor cloud path: start polling for THINKING sessions
          if (data.status === "THINKING" && !pollRef.current) {
            pollRef.current = setInterval(fetchSession, 3000);
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
    [fetchSession]
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
          // Restart polling
          setSession((prev) =>
            prev ? { ...prev, status: "THINKING" } : prev
          );
          if (!pollRef.current) {
            pollRef.current = setInterval(fetchSession, 3000);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          setError(err.error || "Failed to send follow-up");
        }
      } catch {
        setError("Network error");
      }
    },
    [sessionId, fetchSession]
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
    [sessionId]
  );

  const stopSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/intent/${sessionId}/stop`, { method: "POST" });
      setSession((prev) =>
        prev ? { ...prev, status: "CANCELLED" } : prev
      );
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      setError("Failed to stop");
    }
  }, [sessionId]);

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
