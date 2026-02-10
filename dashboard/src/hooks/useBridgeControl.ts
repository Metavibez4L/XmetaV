"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type BridgeControlStatus = {
  supported: boolean;
  running: boolean;
  pid: number | null;
};

export function useBridgeControl() {
  const [status, setStatus] = useState<BridgeControlStatus>({
    supported: true,
    running: false,
    pid: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge/status", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Status failed (${res.status})`);
      }
      const data = (await res.json()) as BridgeControlStatus;
      setStatus(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bridge/start", { method: "POST" });
      const data = (await res.json()) as BridgeControlStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || `Start failed (${res.status})`);
      setStatus(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bridge/stop", { method: "POST" });
      const data = (await res.json()) as BridgeControlStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || `Stop failed (${res.status})`);
      setStatus(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchStatus().then((data) => {
      if (!mounted || !data) return;
      // Poll only if supported.
      if (!data.supported) return;
      if (pollRef.current) return;
      pollRef.current = setInterval(fetchStatus, 5000);
    });

    return () => {
      mounted = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchStatus]);

  const canStart = useMemo(() => status.supported && !status.running && !loading, [status, loading]);
  const canStop = useMemo(() => status.supported && status.running && !loading, [status, loading]);

  return { status, loading, error, fetchStatus, start, stop, canStart, canStop };
}

