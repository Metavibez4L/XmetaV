"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Web Speech API types (Chrome) ──
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

// ── Types ──

export interface VoiceSettings {
  voice: string;
  model: string;
  sttModel: string;
  speed: number;
  autoSpeak: boolean;
  pushToTalk: boolean;
  wakeWord: boolean;
  continuous: boolean;
}

export interface UseVoiceReturn {
  /** Start recording from the microphone */
  startListening: () => Promise<void>;
  /** Stop recording and transcribe */
  stopListening: () => Promise<string | null>;
  /** Speak text aloud via TTS (streams audio progressively) */
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
  /** Current voice settings */
  settings: VoiceSettings;
  /** Update voice settings */
  updateSettings: (patch: Partial<VoiceSettings>) => void;
  /** AnalyserNode for waveform visualization (mic or playback) */
  analyserNode: AnalyserNode | null;
  /** Whether push-to-talk key is currently held */
  isPTTActive: boolean;
}

// ── Constants ──

const VOICE_ENABLED_KEY = "xmetav-voice-enabled";
const VOICE_SETTINGS_KEY = "xmetav-voice-settings";
const MAX_RECORDING_MS = 60_000; // 60s max recording
const SILENCE_THRESHOLD = 0.01; // RMS threshold for silence detection
const SILENCE_DURATION_MS = 2_000; // 2s of silence → auto-stop (continuous mode)

const DEFAULT_SETTINGS: VoiceSettings = {
  voice: "nova",
  model: "tts-1",
  sttModel: "browser",
  speed: 1.0,
  autoSpeak: true,
  pushToTalk: false,
  wakeWord: false,
  continuous: false,
};

/** Check if the browser supports the Web Speech API */
function hasBrowserSTT(): boolean {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (raw) {
      const stored = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      // Migration: force browser STT as default — OpenAI models don't work
      // well with WSL2 audio quality
      if (stored.sttModel !== "browser" && stored.sttModel !== "whisper-1" &&
          stored.sttModel !== "gpt-4o-transcribe" && stored.sttModel !== "gpt-4o-mini-transcribe") {
        stored.sttModel = "browser";
      }
      // If previously set to an OpenAI model, migrate to browser
      if (stored.sttModel !== "browser") {
        stored.sttModel = "browser";
        localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(stored));
      }
      return stored;
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: VoiceSettings) {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ── Hook ──

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isPTTActive, setIsPTTActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRafRef = useRef<number | null>(null);
  const mediaSourceConnectedRef = useRef<Set<HTMLAudioElement>>(new Set());
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const browserTranscriptRef = useRef<string>("");

  // Load persisted preferences on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VOICE_ENABLED_KEY);
      if (stored === "true") setVoiceEnabled(true);
    } catch {
      // localStorage unavailable
    }
    const loaded = loadSettings();
    setSettings(loaded);
    settingsRef.current = loaded;
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

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      settingsRef.current = next;
      return next;
    });
  }, []);

  // ── AudioContext helper ──
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const setupAnalyser = useCallback(
    (source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode) => {
      const ctx = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;
      setAnalyserNode(analyser);
      return analyser;
    },
    [getAudioContext]
  );

  const cleanupAnalyser = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // already disconnected
      }
      sourceRef.current = null;
    }
    analyserRef.current = null;
    setAnalyserNode(null);
  }, []);

  // ── Silence detection for continuous mode ──
  const startSilenceDetection = useCallback(
    (onSilence: () => void) => {
      const analyser = analyserRef.current;
      if (!analyser) return;

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      let silenceStart: number | null = null;

      const check = () => {
        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
            onSilence();
            return; // stop checking
          }
        } else {
          silenceStart = null;
        }

        silenceRafRef.current = requestAnimationFrame(check);
      };
      silenceRafRef.current = requestAnimationFrame(check);
    },
    []
  );

  const stopSilenceDetection = useCallback(() => {
    if (silenceRafRef.current) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
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
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
      stopSilenceDetection();
    };
  }, [stopSilenceDetection]);

  // ── Start recording ──
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript(null);

    const useBrowser = settingsRef.current.sttModel === "browser" && hasBrowserSTT();

    try {
      // Always get mic stream for waveform visualization
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up analyser for waveform visualization
      const ctx = getAudioContext();
      const micSource = ctx.createMediaStreamSource(stream);
      sourceRef.current = micSource;
      setupAnalyser(micSource);

      if (useBrowser) {
        // ── Browser Speech Recognition (Chrome) ──
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) throw new Error("Speech recognition not supported");

        const recognition = new SpeechRec();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        browserTranscriptRef.current = "";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let final = "";
          let interim = "";
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }
          browserTranscriptRef.current = final || interim;
          // Show interim results in real-time
          setTranscript(browserTranscriptRef.current);
        };

        recognition.onerror = (event) => {
          // "no-speech" is not a real error — user just didn't speak yet
          if (event.error !== "no-speech" && event.error !== "aborted") {
            console.error("[useVoice] browser STT error:", event.error);
            setError(`Speech recognition: ${event.error}`);
          }
        };

        recognition.onend = () => {
          // Browser STT can auto-stop; we handle this in stopListening
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsListening(true);

        // Auto-stop after max duration
        timeoutRef.current = setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }, MAX_RECORDING_MS);
      } else {
        // ── MediaRecorder + OpenAI API fallback ──
        if (settings.continuous) {
          startSilenceDetection(() => {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          });
        }

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 128_000,
        });
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(250);
        setIsListening(true);

        timeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, MAX_RECORDING_MS);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      console.error("[useVoice] startListening:", msg);
    }
  }, [getAudioContext, setupAnalyser, settings.continuous, startSilenceDetection]);

  // ── Stop recording and transcribe ──
  const stopListening = useCallback(async (): Promise<string | null> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    stopSilenceDetection();

    // ── Browser Speech Recognition path ──
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      cleanupAnalyser();

      // Stop mic tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const text = browserTranscriptRef.current.trim();
      browserTranscriptRef.current = "";
      if (!text) {
        setError("No speech detected");
        return null;
      }
      setTranscript(text);
      return text;
    }

    // ── MediaRecorder + OpenAI API path ──
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        setIsListening(false);
        cleanupAnalyser();
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        setIsListening(false);
        cleanupAnalyser();

        // Stop mic tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];

        if (blob.size < 1000) {
          setError("Recording too short");
          resolve(null);
          return;
        }

        // Transcribe via OpenAI API
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          formData.append("sttModel", settingsRef.current.sttModel || "whisper-1");

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
  }, [stopSilenceDetection, cleanupAnalyser, settings.sttModel]);

  // ── Speak text via streaming TTS ──
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);

      // Stop any current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      cleanupAnalyser();

      try {
        setIsSpeaking(true);

        const res = await fetch("/api/voice/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.slice(0, 4096),
            voice: settings.voice,
            model: settings.model,
            speed: settings.speed,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Synthesis failed");
        }

        // Try streaming via MediaSource, fallback to blob URL
        const canStream =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported("audio/mpeg");

        if (canStream && res.body) {
          await playStreaming(res.body);
        } else {
          await playBlob(res);
        }
      } catch (err) {
        setIsSpeaking(false);
        cleanupAnalyser();
        const msg =
          err instanceof Error ? err.message : "Speech synthesis failed";
        setError(msg);
        console.error("[useVoice] speak:", msg);
      }
    },
    [settings.voice, settings.model, settings.speed, cleanupAnalyser]
  );

  // ── Streaming playback via MediaSource ──
  const playStreaming = useCallback(
    async (stream: ReadableStream<Uint8Array>) => {
      return new Promise<void>((resolve, reject) => {
        const mediaSource = new MediaSource();
        const audio = new Audio();
        audio.src = URL.createObjectURL(mediaSource);
        audioRef.current = audio;

        mediaSource.addEventListener("sourceopen", async () => {
          const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          const reader = stream.getReader();
          let first = true;

          // Helper: append a chunk and wait until it's fully processed
          const safeAppend = (chunk: Uint8Array): Promise<void> => {
            return new Promise((res, rej) => {
              const onDone = () => {
                sourceBuffer.removeEventListener("updateend", onDone);
                sourceBuffer.removeEventListener("error", onErr);
                res();
              };
              const onErr = () => {
                sourceBuffer.removeEventListener("updateend", onDone);
                sourceBuffer.removeEventListener("error", onErr);
                rej(new Error("SourceBuffer append error"));
              };
              sourceBuffer.addEventListener("updateend", onDone);
              sourceBuffer.addEventListener("error", onErr);
              sourceBuffer.appendBuffer(chunk);
            });
          };

          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Wait for any in-flight append to finish before ending
                  if (sourceBuffer.updating) {
                    await new Promise<void>((r) =>
                      sourceBuffer.addEventListener("updateend", () => r(), {
                        once: true,
                      })
                    );
                  }
                  if (mediaSource.readyState === "open") {
                    mediaSource.endOfStream();
                  }
                  break;
                }
                if (value && value.length > 0) {
                  await safeAppend(value);
                  // Start playback as soon as first chunk is appended
                  if (first) {
                    first = false;
                    audio.play().catch(() => {});
                    // Connect analyser for playback waveform
                    try {
                      const ctx = getAudioContext();
                      if (!mediaSourceConnectedRef.current.has(audio)) {
                        const elSource = ctx.createMediaElementSource(audio);
                        elSource.connect(ctx.destination);
                        sourceRef.current = elSource;
                        setupAnalyser(elSource);
                        mediaSourceConnectedRef.current.add(audio);
                      }
                    } catch {
                      // analyser connection optional
                    }
                  }
                }
              }
            } catch (err) {
              reject(err);
            }
          };

          pump();
        });

        audio.onended = () => {
          setIsSpeaking(false);
          cleanupAnalyser();
          URL.revokeObjectURL(audio.src);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          cleanupAnalyser();
          URL.revokeObjectURL(audio.src);
          audioRef.current = null;
          reject(new Error("Audio playback error"));
        };
      });
    },
    [getAudioContext, setupAnalyser, cleanupAnalyser]
  );

  // ── Fallback: blob-based playback ──
  const playBlob = useCallback(
    async (res: Response) => {
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Connect analyser for playback waveform
      try {
        const ctx = getAudioContext();
        if (!mediaSourceConnectedRef.current.has(audio)) {
          const elSource = ctx.createMediaElementSource(audio);
          elSource.connect(ctx.destination);
          sourceRef.current = elSource;
          setupAnalyser(elSource);
          mediaSourceConnectedRef.current.add(audio);
        }
      } catch {
        // analyser connection optional
      }

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          setIsSpeaking(false);
          cleanupAnalyser();
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          cleanupAnalyser();
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve();
        };

        audio.play().catch((err) => {
          setIsSpeaking(false);
          cleanupAnalyser();
          console.error("[useVoice] playBlob:", err);
          resolve();
        });
      });
    },
    [getAudioContext, setupAnalyser, cleanupAnalyser]
  );

  // ── Stop speaking ──
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    cleanupAnalyser();
    setIsSpeaking(false);
  }, [cleanupAnalyser]);

  // ── Push-to-talk keyboard handlers ──
  useEffect(() => {
    if (!voiceEnabled || !settings.pushToTalk) return;

    let isHolding = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      // Don't capture if user is typing in an input/textarea
      const active = document.activeElement;
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.getAttribute("contenteditable") === "true";
      if (isInput) return;

      e.preventDefault();
      if (!isHolding) {
        isHolding = true;
        setIsPTTActive(true);
        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isHolding) {
        isHolding = false;
        setIsPTTActive(false);
        // stopListening is called by the consumer (AgentChat) to get the text
        // We just fire a custom event so the consumer knows PTT released
        window.dispatchEvent(new CustomEvent("xmetav-ptt-release"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [voiceEnabled, settings.pushToTalk, startListening]);

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
    settings,
    updateSettings,
    analyserNode,
    isPTTActive,
  };
}
