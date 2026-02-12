import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { synthesizeSpeech, isVoiceConfigured } from "@/lib/voice";
import type { VoiceName } from "@/lib/voice";

export const runtime = "nodejs";

const VALID_VOICES: VoiceName[] = [
  "alloy",
  "echo",
  "fable",
  "nova",
  "onyx",
  "shimmer",
];

/**
 * POST /api/voice/synthesize
 * Receives { text, voice? } JSON, returns audio/mpeg stream.
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
    const { text, voice } = body;

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
      voice && VALID_VOICES.includes(voice) ? voice : "nova";

    const audioBuffer = await synthesizeSpeech(text.trim(), selectedVoice);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    console.error("[voice/synthesize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
