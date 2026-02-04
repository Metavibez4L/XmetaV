# Ollama Setup — OpenClaw Integration (WSL2/Linux)

This command center assumes Ollama is running locally with **GPU acceleration** and OpenClaw uses Ollama via the OpenAI-compatible API.

## Requirements

- **NVIDIA GPU** with CUDA support (tested: RTX 4070)
- Ollama reachable at: `http://127.0.0.1:11434`
- Model installed: `qwen2.5:7b-instruct`

> ⚠️ **CRITICAL**: Use the **native Ollama installer**, NOT snap. Snap Ollama does not have proper CUDA support.

## Install Ollama (Native with CUDA)

```bash
# Remove snap version if present
sudo snap disable ollama 2>/dev/null

# Install native Ollama with CUDA support
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull qwen2.5:7b-instruct
```

## Verify Ollama is running with GPU

```bash
# Check Ollama is responding
curl -s http://127.0.0.1:11434/api/tags

# Check GPU is being used (size_vram should be > 0)
curl -s http://127.0.0.1:11434/api/ps

# Verify NVIDIA driver
nvidia-smi
```

Expected: `size_vram` shows ~4-5 GB for qwen2.5:7b-instruct.

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
- `models.providers.ollama.api`: `openai-responses` (tool calling)

Apply:
```bash
openclaw --profile dev config set models.providers.ollama.baseUrl http://127.0.0.1:11434/v1
openclaw --profile dev config set models.providers.ollama.api openai-responses
```

## Context window

For `qwen2.5:7b-instruct`, the model supports 32768 context window.

```bash
curl -s http://127.0.0.1:11434/api/show -d '{"name":"qwen2.5:7b-instruct"}' | grep context
```

## Performance Benchmarks (RTX 4070)

| Metric | GPU (Native) | CPU (Snap) |
|--------|--------------|------------|
| Prompt eval | 827 tokens/s | 7 tokens/s |
| Token generation | 42-54 tokens/s | 7 tokens/s |
| VRAM usage | 4.9 GB | 0 GB |
| Response time | 2-4 sec | 30+ sec |

## Recommended OpenClaw Usage

For reliable agent calls, use `--local` mode:
```bash
openclaw --profile dev agent --agent dev --local --message "Your prompt"
```

The `--local` flag runs the agent embedded, bypassing gateway websocket issues on WSL2.
