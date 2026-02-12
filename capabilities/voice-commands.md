# Voice Commands — XmetaV

Voice command and response system using OpenAI Whisper (STT) and OpenAI TTS. Speak to your agents, hear their responses.

## Architecture

```
Mic → Browser MediaRecorder → POST /api/voice/transcribe → Whisper STT → Text
Text → Agent Chat → Bridge → OpenClaw Agent → Response Text
Response → POST /api/voice/synthesize → OpenAI TTS → MP3 → Browser Audio
```

## Setup

### 1. OpenAI API Key

Sign up at https://platform.openai.com and create an API key.

Add to `dashboard/.env.local`:
```bash
OPENAI_API_KEY=sk-...
```

For x402-gated voice endpoints, also add to `dashboard/x402-server/.env`:
```bash
OPENAI_API_KEY=sk-...
```

### 2. Dashboard Voice Mode

Voice mode is built into the Agent Chat page. Click the voice toggle in the header to enable.

- **Mic button**: Click to start recording, click again to stop and send
- **Auto-speak**: When voice mode is ON, agent responses are automatically spoken aloud
- **Voice toggle**: Persisted in localStorage

### 3. CLI Voice Mode

Requires `sox` for audio recording/playback:

```bash
sudo apt install sox

# Run voice CLI
cd dashboard
npx tsx scripts/voice-cli.ts

# With options
npx tsx scripts/voice-cli.ts --agent akua --voice echo
```

## API Routes (Dashboard)

### POST /api/voice/transcribe

Speech-to-text via OpenAI Whisper.

- **Auth**: Supabase session required
- **Body**: `multipart/form-data` with `audio` file field
- **Formats**: webm, wav, mp3, mp4, ogg, m4a, flac
- **Max size**: 25MB
- **Response**: `{ text: "transcribed text" }`

### POST /api/voice/synthesize

Text-to-speech via OpenAI TTS HD.

- **Auth**: Supabase session required
- **Body**: `{ text: "...", voice?: "nova" }`
- **Voices**: alloy, echo, fable, nova (default), onyx, shimmer
- **Max text**: 4096 characters
- **Response**: `audio/mpeg` (MP3 stream)

## x402 Payment-Gated Endpoints

Available on the x402 server (port 4021) when `OPENAI_API_KEY` is configured.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /voice/transcribe` | $0.005 | Speech-to-text (Whisper) |
| `POST /voice/synthesize` | $0.01 | Text-to-speech (TTS HD) |

## Models & Pricing

| Component | Model | Cost |
|-----------|-------|------|
| STT | `whisper-1` | $0.006/minute |
| TTS | `tts-1-hd` | ~$15/1M characters |

For faster (but lower quality) TTS, change to `tts-1` in `src/lib/voice.ts`.

## Voice Options

| Voice | Description |
|-------|-------------|
| `nova` | Clean, neutral (default) |
| `alloy` | Balanced, versatile |
| `echo` | Warm, conversational |
| `fable` | Expressive, narrative |
| `onyx` | Deep, authoritative |
| `shimmer` | Bright, energetic |

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | `dashboard/.env.local` | OpenAI API key for Whisper + TTS |
| `OPENAI_API_KEY` | `x402-server/.env` | Same key for x402-gated voice endpoints |

## File Structure

```
dashboard/
  src/
    lib/voice.ts                      # Shared voice lib (transcribe + synthesize)
    app/api/voice/
      transcribe/route.ts             # STT API route
      synthesize/route.ts             # TTS API route
    hooks/useVoice.ts                 # React hook (mic, playback, state)
    components/AgentChat.tsx          # Voice UI (mic button, toggle, auto-speak)
  x402-server/index.ts               # x402-gated voice endpoints
  scripts/voice-cli.ts               # Terminal voice mode
```
