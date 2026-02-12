"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──

interface UseVoiceReturn {
  /** Start recording from the microphone */
  startListening: () => Promise<void>;
  /** Stop recording and transcribe */
  stopListening: () => Promise<string | null>;
  /** Speak text aloud via TTS */
  speak: (text: string) => Promise<void>;
  /** Stop any currently playing audio */
  stopSpeaking: () => void;
  /** Whether the mic is currently recording */
  isListening: boolean;
  /** Whether TTS audio is currently playing */
  isSpeaking: boolean;
  /** Whether we're waiting for transcription */
  isTranscribing: boolean;
  /** Last transcribed text */
  transcript: string | null;
  /** Last error message */
  error: string | null;
  /** Whether voice mode is enabled (persisted) */
  voiceEnabled: boolean;
  /** Toggle voice mode on/off */
  toggleVoice: () => void;
}

// ── Constants ──

const VOICE_ENABLED_KEY = "xmetav-voice-enabled";
const MAX_RECORDING_MS = 60_000; // 60s max recording

// ── Hook ──

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted voice preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VOICE_ENABLED_KEY);
      if (stored === "true") setVoiceEnabled(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_ENABLED_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // ── Start recording ──
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(250); // collect chunks every 250ms
      setIsListening(true);

      // Auto-stop after max duration
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      console.error("[useVoice] startListening:", msg);
    }
  }, []);

  // ── Stop recording and transcribe ──
  const stopListening = useCallback(async (): Promise<string | null> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        setIsListening(false);
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        setIsListening(false);

        // Stop mic tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];

        if (blob.size < 1000) {
          // Too short — probably silence
          setError("Recording too short");
          resolve(null);
          return;
        }

        // Transcribe
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Transcription failed");
          }

          const { text } = await res.json();
          setTranscript(text);
          setIsTranscribing(false);
          resolve(text);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Transcription failed";
          setError(msg);
          setIsTranscribing(false);
          console.error("[useVoice] transcribe:", msg);
          resolve(null);
        }
      };

      recorder.stop();
    });
  }, []);

  // ── Speak text via TTS ──
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setError(null);

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setIsSpeaking(true);

      const res = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4096) }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Synthesis failed");
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      setIsSpeaking(false);
      const msg = err instanceof Error ? err.message : "Speech synthesis failed";
      setError(msg);
      console.error("[useVoice] speak:", msg);
    }
  }, []);

  // ── Stop speaking ──
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isListening,
    isSpeaking,
    isTranscribing,
    transcript,
    error,
    voiceEnabled,
    toggleVoice,
  };
}
