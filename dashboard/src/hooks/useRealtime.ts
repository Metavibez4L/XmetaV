"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * SSE Event Types matching the /api/events endpoint.
 */
export type SSEChannel = "sessions" | "memory" | "payments" | "commands";

export interface SSEEvent<T = Record<string, unknown>> {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old?: T;
}

interface UseRealtimeOptions {
  /** Which channels to subscribe to (default: all) */
  channels?: SSEChannel[];
  /** Whether to connect (default: true) */
  enabled?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
}

/**
 * useRealtime — connect to the /api/events SSE stream.
 *
 * Returns the latest event per channel and a connected status flag.
 * Auto-reconnects on disconnect. Cleans up on unmount.
 *
 * Usage:
 *   const { events, connected } = useRealtime({ channels: ["sessions", "payments"] });
 *
 *   useEffect(() => {
 *     if (events.sessions) {
 *       // Handle session update
 *     }
 *   }, [events.sessions]);
 */
export function useRealtime(options: UseRealtimeOptions = {}) {
  const {
    channels = ["sessions", "memory", "payments", "commands"],
    enabled = true,
    reconnectDelay = 3000,
  } = options;

  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<Partial<Record<SSEChannel, SSEEvent>>>({});
  const [eventCount, setEventCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;

    const url = `/api/events?channels=${channels.join(",")}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener("connected", () => {
      setConnected(true);
    });

    // Listen to each channel
    for (const channel of channels) {
      source.addEventListener(channel, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as SSEEvent;
          setEvents((prev) => ({ ...prev, [channel]: data }));
          setEventCount((c) => c + 1);
        } catch {
          // Invalid JSON — skip
        }
      });
    }

    source.onerror = () => {
      setConnected(false);
      source.close();
      sourceRef.current = null;

      // Auto-reconnect
      if (enabled) {
        reconnectRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };
  }, [enabled, channels, reconnectDelay]);

  useEffect(() => {
    connect();

    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  return { events, connected, eventCount };
}
