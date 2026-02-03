# Ollama Setup — OpenClaw Integration (WSL2/Linux)

This command center assumes Ollama is running locally and OpenClaw uses Ollama via the OpenAI-compatible API.

## Requirements

- Ollama reachable at: `http://127.0.0.1:11434`
- Model installed: `qwen2.5:7b-instruct`

## Verify Ollama is running

```bash
curl -s http://127.0.0.1:11434/api/tags
```
Expected: JSON output listing installed models.

If Ollama is not running, start it (depending on how you installed it):

- If installed via the official installer: `ollama serve`
- If installed as a service: start via your system’s service mechanism

## Ensure model is present

```bash
ollama pull qwen2.5:7b-instruct
```

## Verify OpenAI-compatible chat endpoint

OpenClaw agents expect chat format.

```bash
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen2.5:7b-instruct",
    "messages": [{"role": "user", "content": "Say OK"}]
  }' | head -c 400 && echo
```
Expected: JSON that includes an assistant message with `OK`.

## OpenClaw provider settings (golden path)

These are the settings this repo standardizes on:

- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-completions`

Apply:
```bash
openclaw --profile dev config set models.providers.ollama.baseUrl http://127.0.0.1:11434/v1
openclaw --profile dev config set models.providers.ollama.api openai-completions
```

## Context window

For `qwen2.5:7b-instruct`, the model metadata often reports a max context of 32768.

Check:
```bash
curl -s http://127.0.0.1:11434/api/show -d '{"name":"qwen2.5:7b-instruct"}' \
  | grep -o '"qwen2.context_length":[0-9]*'
```

OpenClaw should set `contextWindow` to match the model max context.

If you want to be conservative for speed/stability, set a smaller `contextWindow` and/or `maxTokens` in OpenClaw.
