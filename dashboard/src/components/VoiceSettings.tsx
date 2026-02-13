"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Settings2,
  X,
  Mic,
  Volume2,
  Keyboard,
  Radio,
  Repeat,
  Zap,
  ChevronDown,
} from "lucide-react";
import type { VoiceSettings } from "@/hooks/useVoice";

// ── Types ──

interface VoiceSettingsProps {
  settings: VoiceSettings;
  onUpdate: (patch: Partial<VoiceSettings>) => void;
  wakeWordSupported: boolean;
}

// ── Voice descriptions ──

const VOICES: { id: string; label: string; desc: string }[] = [
  { id: "nova", label: "Nova", desc: "Clean, neutral" },
  { id: "alloy", label: "Alloy", desc: "Balanced, versatile" },
  { id: "echo", label: "Echo", desc: "Warm, conversational" },
  { id: "fable", label: "Fable", desc: "Expressive, narrative" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative" },
  { id: "shimmer", label: "Shimmer", desc: "Bright, energetic" },
];

// ── Component ──

export function VoiceSettingsPanel({
  settings,
  onUpdate,
  wakeWordSupported,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen((p) => !p)}
        className="flex items-center justify-center h-7 w-7 rounded transition-colors"
        style={{
          color: isOpen ? "#00f0ff" : "#4a6a8a",
          background: isOpen ? "#00f0ff10" : "transparent",
          border: `1px solid ${isOpen ? "#00f0ff30" : "transparent"}`,
        }}
        title="Voice settings"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #0d1525, #080c18)",
            borderColor: "#00f0ff20",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 1px #00f0ff20",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: "#00f0ff10" }}
          >
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: "#00f0ff88" }}
            >
              Voice Settings
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="h-5 w-5 flex items-center justify-center rounded"
              style={{ color: "#4a6a8a" }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
            {/* Voice selection */}
            <SettingsSection icon={Volume2} label="Voice">
              <div className="relative">
                <select
                  value={settings.voice}
                  onChange={(e) => onUpdate({ voice: e.target.value })}
                  className="w-full appearance-none rounded px-2 py-1.5 pr-7 text-xs font-mono cursor-pointer"
                  style={{
                    background: "#0a0f1a",
                    border: "1px solid #00f0ff15",
                    color: "#c8d6e5cc",
                  }}
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {v.desc}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none"
                  style={{ color: "#4a6a8a" }}
                />
              </div>
            </SettingsSection>

            {/* STT Model */}
            <SettingsSection icon={Mic} label="Transcription">
              <div className="flex gap-1.5">
                <ModelButton
                  active={settings.sttModel === "gpt-4o-transcribe"}
                  onClick={() => onUpdate({ sttModel: "gpt-4o-transcribe" })}
                  label="Accurate"
                  sub="gpt-4o"
                />
                <ModelButton
                  active={settings.sttModel === "gpt-4o-mini-transcribe"}
                  onClick={() => onUpdate({ sttModel: "gpt-4o-mini-transcribe" })}
                  label="Fast"
                  sub="4o-mini"
                />
                <ModelButton
                  active={settings.sttModel === "whisper-1"}
                  onClick={() => onUpdate({ sttModel: "whisper-1" })}
                  label="Legacy"
                  sub="whisper"
                />
              </div>
            </SettingsSection>

            {/* TTS Model */}
            <SettingsSection icon={Zap} label="Speech Output">
              <div className="flex gap-1.5">
                <ModelButton
                  active={settings.model === "tts-1"}
                  onClick={() => onUpdate({ model: "tts-1" })}
                  label="Fast"
                  sub="tts-1"
                />
                <ModelButton
                  active={settings.model === "tts-1-hd"}
                  onClick={() => onUpdate({ model: "tts-1-hd" })}
                  label="HD"
                  sub="tts-1-hd"
                />
              </div>
            </SettingsSection>

            {/* Speed */}
            <SettingsSection icon={Zap} label={`Speed: ${settings.speed.toFixed(1)}x`}>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.speed}
                onChange={(e) =>
                  onUpdate({ speed: parseFloat(e.target.value) })
                }
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #00f0ff40 ${((settings.speed - 0.5) / 1.5) * 100}%, #0a0f1a ${((settings.speed - 0.5) / 1.5) * 100}%)`,
                }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[8px] font-mono" style={{ color: "#4a6a8a44" }}>
                  0.5x
                </span>
                <span className="text-[8px] font-mono" style={{ color: "#4a6a8a44" }}>
                  2.0x
                </span>
              </div>
            </SettingsSection>

            {/* Divider */}
            <div className="border-t" style={{ borderColor: "#00f0ff08" }} />

            {/* Toggle: Auto-Speak */}
            <ToggleSetting
              icon={Volume2}
              label="Auto-speak responses"
              desc="Read agent replies aloud"
              checked={settings.autoSpeak}
              onChange={(v) => onUpdate({ autoSpeak: v })}
            />

            {/* Toggle: Push-to-Talk */}
            <ToggleSetting
              icon={Keyboard}
              label="Push-to-talk"
              desc="Hold SPACE to record"
              checked={settings.pushToTalk}
              onChange={(v) => onUpdate({ pushToTalk: v })}
            />

            {/* Toggle: Wake Word */}
            <ToggleSetting
              icon={Radio}
              label="Wake word"
              desc={wakeWordSupported ? '"Hey XmetaV" activation' : "Not supported in this browser"}
              checked={settings.wakeWord}
              onChange={(v) => onUpdate({ wakeWord: v })}
              disabled={!wakeWordSupported}
            />

            {/* Toggle: Continuous */}
            <ToggleSetting
              icon={Repeat}
              label="Continuous conversation"
              desc="Auto-listen after speaking"
              checked={settings.continuous}
              onChange={(v) => onUpdate({ continuous: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function SettingsSection({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3" style={{ color: "#00f0ff44" }} />
        <span
          className="text-[9px] font-mono uppercase tracking-wider"
          style={{ color: "#4a6a8a" }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ModelButton({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded px-2 py-1.5 text-center transition-all"
      style={{
        background: active ? "#00f0ff12" : "#0a0f1a",
        border: `1px solid ${active ? "#00f0ff40" : "#00f0ff10"}`,
        color: active ? "#00f0ff" : "#4a6a8a",
      }}
    >
      <div className="text-[10px] font-mono font-bold">{label}</div>
      <div className="text-[8px] font-mono" style={{ opacity: 0.5 }}>
        {sub}
      </div>
    </button>
  );
}

function ToggleSetting({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
  disabled = false,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="w-full flex items-center gap-2.5 p-1.5 rounded transition-colors text-left"
      style={{
        background: checked && !disabled ? "#00f0ff06" : "transparent",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: checked && !disabled ? "#00f0ff88" : "#4a6a8a44" }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] font-mono"
          style={{ color: checked && !disabled ? "#c8d6e5cc" : "#4a6a8a" }}
        >
          {label}
        </div>
        <div className="text-[8px] font-mono" style={{ color: "#4a6a8a66" }}>
          {desc}
        </div>
      </div>
      {/* Toggle switch */}
      <div
        className="shrink-0 w-7 h-4 rounded-full relative transition-colors"
        style={{
          background: checked && !disabled ? "#00f0ff30" : "#0a0f1a",
          border: `1px solid ${checked && !disabled ? "#00f0ff40" : "#00f0ff15"}`,
        }}
      >
        <div
          className="absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all"
          style={{
            left: checked ? "12px" : "2px",
            background: checked && !disabled ? "#00f0ff" : "#4a6a8a44",
            boxShadow: checked && !disabled ? "0 0 4px #00f0ff" : "none",
          }}
        />
      </div>
    </button>
  );
}
