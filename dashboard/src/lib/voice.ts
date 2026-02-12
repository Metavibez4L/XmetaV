import OpenAI from "openai";

// ── OpenAI client (server-side only) ──

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── Voice options ──

export type VoiceName =
  | "alloy"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "shimmer";

export const VALID_VOICES: VoiceName[] = [
  "alloy",
  "echo",
  "fable",
  "nova",
  "onyx",
  "shimmer",
];

export type TTSModel = "tts-1" | "tts-1-hd";

export const DEFAULT_VOICE: VoiceName = "nova";
export const DEFAULT_STT_MODEL = "whisper-1";
export const DEFAULT_TTS_MODEL: TTSModel = "tts-1"; // fast by default; "tts-1-hd" for quality

// ── Speech-to-Text (Whisper) ──

/**
 * Transcribe an audio buffer to text using OpenAI Whisper.
 * Accepts wav, mp3, mp4, mpeg, mpga, m4a, ogg, webm.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = "audio.webm"
): Promise<string> {
  const file = new File([audioBuffer], filename, {
    type: getMimeType(filename),
  });

  const response = await openai.audio.transcriptions.create({
    model: DEFAULT_STT_MODEL,
    file,
    language: "en",
  });

  return response.text;
}

// ── Text-to-Speech (buffered, legacy) ──

/**
 * Synthesize text to speech using OpenAI TTS.
 * Returns an mp3 audio buffer (fully buffered).
 */
export async function synthesizeSpeech(
  text: string,
  voice: VoiceName = DEFAULT_VOICE,
  model: TTSModel = DEFAULT_TTS_MODEL,
  speed: number = 1.0
): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
    speed: clampSpeed(speed),
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Text-to-Speech (streaming) ──

/**
 * Synthesize text to speech and return the raw Response for streaming.
 * The caller can pipe response.body directly to the client.
 */
export async function synthesizeSpeechStream(
  text: string,
  voice: VoiceName = DEFAULT_VOICE,
  model: TTSModel = DEFAULT_TTS_MODEL,
  speed: number = 1.0
): Promise<Response> {
  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
    speed: clampSpeed(speed),
  });

  // OpenAI SDK returns a Response-like object with a body ReadableStream
  return response as unknown as Response;
}

// ── Helpers ──

function clampSpeed(speed: number): number {
  return Math.min(4.0, Math.max(0.25, speed));
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    webm: "audio/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    ogg: "audio/ogg",
    m4a: "audio/m4a",
    flac: "audio/flac",
  };
  return mimeMap[ext || ""] || "audio/webm";
}

/**
 * Check if the OpenAI API key is configured.
 */
export function isVoiceConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
