#!/usr/bin/env npx tsx
/**
 * XmetaV Voice CLI
 *
 * Interactive voice mode for terminal:
 *   listen → transcribe (Whisper) → agent (OpenClaw) → synthesize (TTS) → play
 *
 * Requirements:
 *   - OPENAI_API_KEY in environment or dashboard/.env.local
 *   - sox installed: sudo apt install sox
 *   - openclaw CLI on PATH
 *
 * Usage:
 *   npx tsx scripts/voice-cli.ts [--agent main] [--voice nova]
 */

import "dotenv/config";
import { spawn, execSync } from "child_process";
import { createReadStream, createWriteStream, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import OpenAI from "openai";
import readline from "readline";

// ── Config ──

const args = process.argv.slice(2);
const agentId = getArg("--agent") || "main";
const voiceName = getArg("--voice") || "nova";
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("\n  ✗ OPENAI_API_KEY is required");
  console.error("    Set it in your environment or dashboard/.env.local\n");
  process.exit(1);
}

// Check sox availability
try {
  execSync("which sox", { stdio: "ignore" });
} catch {
  console.error("\n  ✗ sox is required for audio recording/playback");
  console.error("    Install: sudo apt install sox\n");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// ── Main Loop ──

async function main() {
  console.log(`\n  ╔═══════════════════════════════════════╗`);
  console.log(`  ║       XmetaV Voice Interface           ║`);
  console.log(`  ╠═══════════════════════════════════════╣`);
  console.log(`  ║  Agent: ${agentId.padEnd(30)}║`);
  console.log(`  ║  Voice: ${voiceName.padEnd(30)}║`);
  console.log(`  ║  Press ENTER to speak, Ctrl+C to exit ║`);
  console.log(`  ╚═══════════════════════════════════════╝\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question("  [ENTER to speak, q to quit] > ", async (answer) => {
      if (answer.toLowerCase() === "q") {
        console.log("\n  Goodbye.\n");
        rl.close();
        process.exit(0);
      }

      try {
        // 1. Record audio
        console.log("  🎤 Recording... (speak now, press Ctrl+C in 10s or wait)");
        const audioFile = await recordAudio(8); // 8 seconds max

        // 2. Transcribe
        console.log("  ⏳ Transcribing...");
        const transcript = await transcribe(audioFile);
        cleanup(audioFile);

        if (!transcript.trim()) {
          console.log("  (no speech detected)\n");
          prompt();
          return;
        }

        console.log(`  📝 You: "${transcript}"`);

        // 3. Send to agent
        console.log(`  🤖 Sending to ${agentId}...`);
        const response = await runAgent(agentId, transcript);
        console.log(`  💬 ${agentId}: ${response.slice(0, 200)}${response.length > 200 ? "..." : ""}`);

        // 4. Synthesize and play
        console.log("  🔊 Speaking...");
        const ttsFile = await synthesize(response);
        await playAudio(ttsFile);
        cleanup(ttsFile);

        console.log();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ Error: ${msg}\n`);
      }

      prompt();
    });
  };

  prompt();
}

// ── Record audio via sox ──

function recordAudio(durationSecs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const outFile = join(tmpdir(), `xmetav-voice-${Date.now()}.wav`);

    const proc = spawn("sox", [
      "-d",               // default audio device
      "-r", "16000",      // 16kHz sample rate
      "-c", "1",          // mono
      "-b", "16",         // 16-bit
      outFile,
      "trim", "0", String(durationSecs),
      "silence", "1", "0.5", "1%",  // start on voice
    ], { stdio: "ignore" });

    proc.on("close", (code) => {
      if (existsSync(outFile)) {
        resolve(outFile);
      } else {
        reject(new Error(`Recording failed (exit code ${code})`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`sox error: ${err.message}`));
    });
  });
}

// ── Transcribe via Whisper ──

async function transcribe(audioPath: string): Promise<string> {
  const file = createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    // @ts-expect-error - ReadStream works as file input
    file,
    language: "en",
  });

  return response.text;
}

// ── Run OpenClaw agent ──

function runAgent(agent: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sessionId = `voice_${Date.now()}`;
    const proc = spawn("openclaw", [
      "agent",
      "--agent", agent,
      "--local",
      "--thinking", "off",
      "--session-id", sessionId,
      "--message", message,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else if (stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Agent exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`openclaw error: ${err.message}`));
    });

    // Timeout after 60s
    setTimeout(() => {
      proc.kill("SIGTERM");
      if (stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error("Agent timed out (60s)"));
      }
    }, 60_000);
  });
}

// ── Synthesize via TTS ──

async function synthesize(text: string): Promise<string> {
  const outFile = join(tmpdir(), `xmetav-tts-${Date.now()}.mp3`);

  const response = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: voiceName as "nova" | "alloy" | "echo" | "fable" | "onyx" | "shimmer",
    input: text.slice(0, 4096),
    response_format: "mp3",
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ws = createWriteStream(outFile);
  ws.write(buffer);
  ws.end();

  return new Promise((resolve) => {
    ws.on("finish", () => resolve(outFile));
  });
}

// ── Play audio via sox ──

function playAudio(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("play", [path, "-q"], { stdio: "ignore" });
    proc.on("close", () => resolve());
    proc.on("error", (err) => reject(new Error(`play error: ${err.message}`)));
  });
}

// ── Helpers ──

function cleanup(path: string) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore
  }
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ── Start ──

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
