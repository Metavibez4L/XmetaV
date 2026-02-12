"use client";

import React, { useRef, useEffect } from "react";

// ── Types ──

interface VoiceWaveformProps {
  /** AnalyserNode from useVoice hook */
  analyser: AnalyserNode | null;
  /** Whether the mic is recording (cyan/red color switch) */
  isRecording?: boolean;
  /** Whether TTS is playing (green color) */
  isSpeaking?: boolean;
  /** Width of the canvas (px) */
  width?: number;
  /** Height of the canvas (px) */
  height?: number;
  /** Number of bars to display */
  barCount?: number;
}

// ── Component ──

export const VoiceWaveform = React.memo(function VoiceWaveform({
  analyser,
  isRecording = false,
  isSpeaking = false,
  width = 120,
  height = 32,
  barCount = 12,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution for retina
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    if (!analyser) {
      // No analyser — draw idle bars
      drawIdleBars(ctx, width, height, barCount);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barWidth = (width - (barCount - 1) * 2) / barCount;
    const minBarHeight = 2;

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Pick color based on state
      const baseColor = isRecording
        ? { r: 255, g: 45, b: 94 }   // red for recording
        : isSpeaking
        ? { r: 57, g: 255, b: 20 }   // green for speaking
        : { r: 0, g: 240, b: 255 };  // cyan default

      // Sample frequency data evenly
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        // Average a few bins around the sample point
        let sum = 0;
        const startBin = i * step;
        const endBin = Math.min(startBin + step, bufferLength);
        for (let j = startBin; j < endBin; j++) {
          sum += dataArray[j];
        }
        const avg = sum / (endBin - startBin);
        const normalized = avg / 255;

        const barHeight = Math.max(
          minBarHeight,
          normalized * (height - 4)
        );
        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        // Gradient glow effect
        const alpha = 0.4 + normalized * 0.6;
        ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;

        // Rounded bars
        const radius = Math.min(barWidth / 2, barHeight / 2, 3);
        roundedRect(ctx, x, y, barWidth, barHeight, radius);
        ctx.fill();

        // Glow shadow
        if (normalized > 0.3) {
          ctx.shadowColor = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${normalized * 0.5})`;
          ctx.shadowBlur = 4;
          roundedRect(ctx, x, y, barWidth, barHeight, radius);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, isRecording, isSpeaking, width, height, barCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
      }}
    />
  );
});

// ── Helpers ──

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawIdleBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  barCount: number
) {
  const barWidth = (width - (barCount - 1) * 2) / barCount;
  const minBarHeight = 2;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < barCount; i++) {
    const x = i * (barWidth + 2);
    const barHeight = minBarHeight;
    const y = (height - barHeight) / 2;

    ctx.fillStyle = "rgba(0, 240, 255, 0.15)";
    const radius = Math.min(barWidth / 2, barHeight / 2, 3);
    roundedRect(ctx, x, y, barWidth, barHeight, radius);
    ctx.fill();
  }
}
