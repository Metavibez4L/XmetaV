"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──

interface UseWakeWordOptions {
  /** Whether wake word detection is enabled */
  enabled: boolean;
  /** Callback fired when the wake word is detected */
  onWake: () => void;
  /** Trigger phrases (matched case-insensitive) */
  phrases?: string[];
}

interface UseWakeWordReturn {
  /** Whether the browser supports SpeechRecognition */
  isSupported: boolean;
  /** Whether wake word detection is actively listening */
  isActive: boolean;
  /** Last heard interim/final transcript snippet */
  lastHeard: string | null;
}

// ── Wake phrases ──

const DEFAULT_PHRASES = [
  "hey xmetav",
  "hey x meta v",
  "hey meta",
  "xmetav",
  "x meta v",
  "hey agent",
];

// ── Get SpeechRecognition constructor (vendor-prefixed) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR || null;
}

// ── Hook ──

export function useWakeWord({
  enabled,
  onWake,
  phrases = DEFAULT_PHRASES,
}: UseWakeWordOptions): UseWakeWordReturn {
  const [isSupported] = useState(() => !!getSpeechRecognition());
  const [isActive, setIsActive] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const phrasesLower = phrases.map((p) => p.toLowerCase());

  const matchesWakeWord = useCallback(
    (text: string): boolean => {
      const lower = text.toLowerCase().trim();
      return phrasesLower.some(
        (phrase) => lower.includes(phrase)
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phrases.join(",")]
  );

  // Start / stop recognition based on enabled flag
  useEffect(() => {
    if (!enabled || !isSupported) {
      // Tear down
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsActive(false);
      }
      return;
    }

    const SRConstructor = getSpeechRecognition();
    if (!SRConstructor) return;

    const recognition = new SRConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsActive(true);
    recognition.onend = () => {
      setIsActive(false);
      // Restart automatically — SpeechRecognition stops after silence
      if (enabled && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          // already started or aborted
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      // "no-speech" and "aborted" are normal — just restart
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.warn("[useWakeWord] error:", e.error);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        setLastHeard(text);

        if (matchesWakeWord(text)) {
          // Fire wake callback
          onWakeRef.current();
          // Reset so we don't re-trigger on the same phrase
          recognition.abort();
          // Will auto-restart via onend handler
          break;
        }
      }
    };

    try {
      recognition.start();
    } catch {
      // may already be started
    }

    return () => {
      recognition.abort();
      recognitionRef.current = null;
      setIsActive(false);
    };
  }, [enabled, isSupported, matchesWakeWord]);

  return {
    isSupported,
    isActive,
    lastHeard,
  };
}
