import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  synthesizeSpeechStream,
  isVoiceConfigured,
  VALID_VOICES,
  DEFAULT_VOICE,
  DEFAULT_TTS_MODEL,
} from "@/lib/voice";
import type { VoiceName, TTSModel } from "@/lib/voice";

export const runtime = "nodejs";

const VALID_MODELS: TTSModel[] = ["tts-1", "tts-1-hd"];

/**
 * POST /api/voice/synthesize
 * Receives { text, voice?, model?, speed? } JSON.
 * Streams audio/mpeg back — first bytes arrive as soon as OpenAI starts generating.
 */
export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check config
  if (!isVoiceConfigured()) {
    return NextResponse.json(
      { error: "Voice not configured — OPENAI_API_KEY is missing" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { text, voice, model, speed } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Limit text length (~4096 chars is reasonable for one TTS call)
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "Text too long (max 4096 characters)" },
        { status: 413 }
      );
    }

    const selectedVoice: VoiceName =
      voice && VALID_VOICES.includes(voice) ? voice : DEFAULT_VOICE;
    const selectedModel: TTSModel =
      model && VALID_MODELS.includes(model) ? model : DEFAULT_TTS_MODEL;
    const selectedSpeed =
      typeof speed === "number" ? speed : 1.0;

    // Get streaming response from OpenAI
    const openaiResponse = await synthesizeSpeechStream(
      text.trim(),
      selectedVoice,
      selectedModel,
      selectedSpeed
    );

    // Pipe the stream through to the client — no buffering
    const stream = openaiResponse.body;
    if (!stream) {
      return NextResponse.json(
        { error: "No audio stream received" },
        { status: 500 }
      );
    }

    return new NextResponse(stream as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Voice": selectedVoice,
        "X-Model": selectedModel,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    console.error("[voice/synthesize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
