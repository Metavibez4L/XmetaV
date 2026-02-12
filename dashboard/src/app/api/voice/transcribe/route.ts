import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { transcribeAudio, isVoiceConfigured } from "@/lib/voice";

export const runtime = "nodejs";

/**
 * POST /api/voice/transcribe
 * Receives audio as multipart/form-data, returns transcribed text.
 * Body: FormData with "audio" file field.
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
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "audio file is required (multipart/form-data)" },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "Audio file is empty" },
        { status: 400 }
      );
    }

    // Limit to ~25MB (Whisper max)
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file too large (max 25MB)" },
        { status: 413 }
      );
    }

    const filename =
      audioFile instanceof File ? audioFile.name : "recording.webm";
    const text = await transcribeAudio(buffer, filename);

    return NextResponse.json({ text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed";
    console.error("[voice/transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
