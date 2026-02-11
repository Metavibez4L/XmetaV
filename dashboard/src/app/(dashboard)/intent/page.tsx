"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Zap, RotateCcw } from "lucide-react";
import { IntentChat } from "@/components/IntentChat";
import { CommandPreview } from "@/components/CommandPreview";
import { IntentHistory } from "@/components/IntentHistory";
import { useIntentSession, useIntentSessions } from "@/hooks/useIntentSession";
import type { IntentCommand, IntentSession } from "@/lib/types";

export default function IntentPage() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const {
    session,
    loading,
    error,
    createSession,
    sendFollowup,
    executeCommands,
    stopSession,
  } = useIntentSession(activeSessionId);

  const { sessions, refetch: refetchSessions } = useIntentSessions();

  // Refetch history whenever the active session's status changes
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (session && session.status !== prevStatusRef.current) {
      prevStatusRef.current = session.status;
      refetchSessions();
    }
  }, [session, session?.status, refetchSessions]);

  const handleSubmitGoal = useCallback(
    async (goal: string, repository?: string, model?: string) => {
      const newSession = await createSession(goal, repository, model);
      if (newSession) {
        setActiveSessionId(newSession.id);
        refetchSessions();
      }
    },
    [createSession, refetchSessions]
  );

  const handleFollowup = useCallback(
    (message: string) => {
      sendFollowup(message);
    },
    [sendFollowup]
  );

  const handleExecute = useCallback(
    async (commands: IntentCommand[]) => {
      setExecuting(true);
      await executeCommands(commands);
      setExecuting(false);
      refetchSessions();
    },
    [executeCommands, refetchSessions]
  );

  const handleStop = useCallback(() => {
    stopSession();
    refetchSessions();
  }, [stopSession, refetchSessions]);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
  }, []);

  const handleSelectHistory = useCallback((s: IntentSession) => {
    setActiveSessionId(s.id);
  }, []);

  const sc = {
    neon: "#00f0ff",
    dimText: "#4a6a8a",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: "#00f0ff08", border: "1px solid #00f0ff15" }}
        >
          <Zap className="h-5 w-5" style={{ color: sc.neon }} />
        </div>
        <div className="flex-1">
          <h1
            className="text-xl font-mono font-bold tracking-wider neon-glow"
            style={{ color: sc.neon }}
          >
            INTENT
          </h1>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: sc.dimText }}>
            Cursor AI generates OpenClaw commands // you review and execute
          </p>
        </div>

        {/* New session button */}
        {activeSessionId && (
          <button
            onClick={handleNewSession}
            className="flex items-center gap-2 px-3 py-2 rounded text-[9px] font-mono uppercase tracking-wider transition-all"
            style={{
              background: `${sc.neon}08`,
              border: `1px solid ${sc.neon}20`,
              color: sc.neon,
            }}
          >
            <RotateCcw className="h-3 w-3" />
            New Session
          </button>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ minHeight: "calc(100vh - 240px)" }}>
        {/* Left: Intent Chat */}
        <div
          className="rounded-xl p-4 flex flex-col"
          style={{
            background: "#0a0f1a",
            border: "1px solid #00f0ff08",
          }}
        >
          <IntentChat
            session={session}
            loading={loading}
            error={error}
            onSubmitGoal={handleSubmitGoal}
            onFollowup={handleFollowup}
            onStop={handleStop}
          />
        </div>

        {/* Right: Command Preview */}
        <div
          className="rounded-xl p-4 flex flex-col"
          style={{
            background: "#0a0f1a",
            border: "1px solid #00f0ff08",
          }}
        >
          <CommandPreview
            session={session}
            onExecute={handleExecute}
            executing={executing}
          />
        </div>
      </div>

      {/* History (below) */}
      <div
        className="mt-6 rounded-xl p-4"
        style={{
          background: "#0a0f1a",
          border: "1px solid #00f0ff08",
        }}
      >
        <IntentHistory
          sessions={sessions}
          onSelect={handleSelectHistory}
          activeSessionId={activeSessionId}
        />
      </div>
    </div>
  );
}
