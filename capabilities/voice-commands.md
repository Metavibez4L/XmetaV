# Voice Commands — XmetaV

**Last Updated:** 2026-02-12 (v10.1 — Streaming TTS, Push-to-Talk, Wake Word, Waveform)

Voice command and response system using OpenAI Whisper (STT) and OpenAI TTS. Speak to your agents, hear their responses.

## Architecture

```
Mic → Browser MediaRecorder → POST /api/voice/transcribe → Whisper STT → Text
Text → Agent Chat → Bridge → OpenClaw Agent → Response Text
Response → POST /api/voice/synthesize → OpenAI TTS → Streaming MP3 → MediaSource → Audio
```

## Features

### Streaming TTS
Audio starts playing within ~200ms of the first chunk arriving from OpenAI. The synthesize API streams the response directly through without buffering. Client uses `MediaSource` API for progressive playback with automatic blob URL fallback for unsupported browsers.

### Push-to-Talk
Hold SPACE to record, release to send. Only active when voice mode is ON and no text input is focused. Enable via the voice settings panel.

### Wake Word Detection
Say "Hey XmetaV", "Hey Meta", or "Hey Agent" to activate recording hands-free. Uses the browser's Web Speech API for lightweight always-on listening. Falls back gracefully in browsers without SpeechRecognition support (e.g. Firefox).

### Continuous Conversation
Auto-listen after the agent finishes speaking, creating a natural talk loop: speak -> transcribe -> agent -> speak -> listen. Auto-stops recording after 2 seconds of silence via AudioContext volume analysis.

### Waveform Visualizer
Real-time canvas-based frequency visualizer using `AudioContext.createAnalyser()`. Displays animated bars during both recording (red) and TTS playback (green). Connects to mic stream or audio element via `MediaElementSource`.

### Voice Settings Panel
Accessible via the gear icon next to the voice toggle:
- **Voice selection**: 6 voices (alloy, echo, fable, nova, onyx, shimmer)
- **TTS model**: `tts-1` (fast, default) vs `tts-1-hd` (quality)
- **Speed**: 0.5x to 2.0x slider
- **Auto-speak**: toggle agent response readback
- **Push-to-talk**: toggle spacebar hold mode
- **Wake word**: toggle hands-free activation
- **Continuous mode**: toggle auto-listen loop

All settings persisted in localStorage.

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
- **Voice toggle**: Persisted in localStorage
- **Settings gear**: Opens voice settings panel (model, voice, speed, modes)
- **Waveform**: Animated bars shown while recording or speaking
- **Push-to-talk**: Hold SPACE (enable in settings)
- **Wake word**: "Hey XmetaV" (enable in settings, Chrome/Edge)
- **Continuous**: Auto-listen loop (enable in settings)

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

Text-to-speech via OpenAI TTS (streaming).

- **Auth**: Supabase session required
- **Body**: `{ text: "...", voice?: "nova", model?: "tts-1", speed?: 1.0 }`
- **Voices**: alloy, echo, fable, nova (default), onyx, shimmer
- **Models**: `tts-1` (fast, default), `tts-1-hd` (higher quality)
- **Speed**: 0.25 to 4.0 (default 1.0)
- **Max text**: 4096 characters
- **Response**: `audio/mpeg` (streamed, chunked transfer)

## x402 Payment-Gated Endpoints

Available on the x402 server (port 4021) when `OPENAI_API_KEY` is configured.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /voice/transcribe` | $0.005 | Speech-to-text (Whisper) |
| `POST /voice/synthesize` | $0.01 | Text-to-speech (TTS) |

## Models & Pricing

| Component | Model | Cost | Notes |
|-----------|-------|------|-------|
| STT | `whisper-1` | $0.006/minute | Only model available |
| TTS | `tts-1` | ~$15/1M chars | Fast, lower latency (default) |
| TTS | `tts-1-hd` | ~$30/1M chars | Higher quality, slower |

## Voice Options

| Voice | Description |
|-------|-------------|
| `nova` | Clean, neutral (default) |
| `alloy` | Balanced, versatile |
| `echo` | Warm, conversational |
| `fable` | Expressive, narrative |
| `onyx` | Deep, authoritative |
| `shimmer` | Bright, energetic |

## Interaction Modes

| Mode | Activation | Behavior |
|------|-----------|----------|
| Click-to-talk | Mic button | Click to start, click to stop |
| Push-to-talk | SPACE key | Hold to record, release to send |
| Wake word | "Hey XmetaV" | Hands-free, auto-starts recording |
| Continuous | Settings toggle | Auto-listen after agent speaks |

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | `dashboard/.env.local` | OpenAI API key for Whisper + TTS |
| `OPENAI_API_KEY` | `x402-server/.env` | Same key for x402-gated voice endpoints |

## File Structure

```
dashboard/
  src/
    lib/voice.ts                        # Server voice lib (transcribe + streaming synthesize)
    app/api/voice/
      transcribe/route.ts               # STT API route
      synthesize/route.ts               # TTS API route (streaming)
    hooks/
      useVoice.ts                       # Core voice hook (mic, streaming TTS, PTT, settings, analyser)
      useWakeWord.ts                    # Wake word detection hook (Web Speech API)
    components/
      AgentChat.tsx                     # Voice UI integration (waveform, PTT, continuous, settings)
      VoiceWaveform.tsx                 # Canvas waveform visualizer
      VoiceSettings.tsx                 # Voice settings panel
  x402-server/index.ts                 # x402-gated voice endpoints
  scripts/voice-cli.ts                 # Terminal voice mode
```
