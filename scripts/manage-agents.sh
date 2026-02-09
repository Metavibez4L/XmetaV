#!/usr/bin/env bash
# manage-agents.sh — Manage the OpenClaw agent fleet
#
# Usage:
#   ./scripts/manage-agents.sh <command> [args]
#
# Commands:
#   list                       List all agents with model, workspace, tools
#   status                     Health check across all agents
#   remove <id>                Remove agent from config (preserves workspace)
#   update <id> [options]      Update agent config fields
#   info <id>                  Show detailed info for one agent
#   count                      Show agent count vs limit
#
# Update options:
#   --model <model>            Change model
#   --tools <coding|full>      Change tools profile
#   --workspace <path>         Change workspace
#
# Examples:
#   ./scripts/manage-agents.sh list
#   ./scripts/manage-agents.sh remove researcher
#   ./scripts/manage-agents.sh update trader --model ollama/qwen2.5:7b-instruct
#   ./scripts/manage-agents.sh info basedintern
#
set -euo pipefail

# Ensure Node.js 22+ is available (openclaw is installed under nvm node 22)
if ! command -v openclaw &>/dev/null || [[ "$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 16 ]] 2>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use 22 --silent 2>/dev/null || nvm use default --silent 2>/dev/null || true
  fi
fi

OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
MAX_AGENTS="${MAX_AGENTS:-10}"

# ─── Check config exists ───
if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  echo "ERROR: OpenClaw config not found at $OPENCLAW_CONFIG" >&2
  exit 1
fi

# ─── Commands ───

cmd_list() {
  echo "╔═══════════════════════════════════════════════════════════════════╗"
  echo "║                     AGENT FLEET STATUS                            ║"
  echo "╠═══════════════════════════════════════════════════════════════════╣"
  node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const agents = cfg.agents?.list || [];
    if (agents.length === 0) {
      console.log('  (no agents configured)');
      process.exit(0);
    }
    const maxId = Math.max(...agents.map(a => a.id.length), 2);
    const header = '  ' + 'ID'.padEnd(maxId + 2) + 'MODEL'.padEnd(30) + 'TOOLS'.padEnd(10) + 'WORKSPACE';
    console.log(header);
    console.log('  ' + '─'.repeat(header.length));
    agents.forEach(a => {
      const id = (a.default ? a.id + ' *' : a.id).padEnd(maxId + 2);
      const model = (a.model?.primary || 'default').padEnd(30);
      const tools = (a.tools?.profile || 'default').padEnd(10);
      const ws = a.workspace || 'default';
      console.log('  ' + id + model + tools + ws);
    });
    console.log('');
    console.log('  Total: ' + agents.length + '/$MAX_AGENTS (* = default agent)');
  "
  echo "╚═══════════════════════════════════════════════════════════════════╝"
}

cmd_status() {
  echo "═══ AGENT FLEET HEALTH CHECK ═══"
  echo ""

  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const agents = cfg.agents?.list || [];

    agents.forEach(a => {
      const wsExists = fs.existsSync(a.workspace || '');
      const hasAgentsMd = fs.existsSync((a.workspace || '') + '/AGENTS.md');
      const hasSoulMd = fs.existsSync((a.workspace || '') + '/SOUL.md');
      const hasPackageJson = fs.existsSync((a.workspace || '') + '/package.json');
      const hasRequirements = fs.existsSync((a.workspace || '') + '/requirements.txt');

      let status = '✓';
      let issues = [];
      if (!wsExists) { status = '✗'; issues.push('workspace missing'); }
      if (!hasAgentsMd) { issues.push('no AGENTS.md'); }

      const appType = hasPackageJson ? 'node' : hasRequirements ? 'python' : 'none';

      console.log('  ' + status + ' ' + a.id);
      console.log('    workspace: ' + (wsExists ? '✓' : '✗') + ' ' + (a.workspace || 'default'));
      console.log('    identity:  ' + (hasAgentsMd ? '✓' : '⊘') + ' AGENTS.md  ' + (hasSoulMd ? '✓' : '⊘') + ' SOUL.md');
      console.log('    app:       ' + appType);
      if (issues.length > 0) {
        console.log('    issues:    ' + issues.join(', '));
      }
      console.log('');
    });
  "

  # Gateway check
  echo "  Gateway:"
  if nc -z 127.0.0.1 18789 2>/dev/null; then
    echo "    ✓ Running on port 18789"
  else
    echo "    ✗ Not reachable on port 18789"
  fi

  # Ollama check
  echo "  Ollama:"
  if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "    ✓ Running"
    MODEL_COUNT=$(curl -s http://127.0.0.1:11434/api/tags 2>/dev/null | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        try { console.log(JSON.parse(d).models?.length || 0); } catch { console.log('?'); }
      });
    ")
    echo "    Models loaded: $MODEL_COUNT"
  else
    echo "    ✗ Not reachable"
  fi

  echo ""
  echo "═══ HEALTH CHECK COMPLETE ═══"
}

cmd_remove() {
  local agent_id="$1"
  if [[ -z "$agent_id" ]]; then
    echo "ERROR: Usage: manage-agents.sh remove <agent-id>" >&2
    exit 1
  fi

  echo "→ Removing agent: $agent_id"

  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const before = (cfg.agents?.list || []).length;
    cfg.agents.list = (cfg.agents?.list || []).filter(a => a.id !== '$agent_id');
    const after = cfg.agents.list.length;

    if (before === after) {
      console.log('  ⚠ Agent not found: $agent_id');
      process.exit(1);
    }

    fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
    console.log('  ✓ Removed agent: $agent_id');
    console.log('  Note: Workspace directory was preserved (delete manually if needed)');
  "
}

cmd_update() {
  local agent_id="$1"
  shift

  if [[ -z "$agent_id" ]]; then
    echo "ERROR: Usage: manage-agents.sh update <agent-id> [--model X] [--tools X] [--workspace X]" >&2
    exit 1
  fi

  local new_model="" new_tools="" new_workspace=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --model)     new_model="$2"; shift 2 ;;
      --tools)     new_tools="$2"; shift 2 ;;
      --workspace) new_workspace="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  echo "→ Updating agent: $agent_id"

  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const idx = (cfg.agents?.list || []).findIndex(a => a.id === '$agent_id');

    if (idx < 0) {
      console.log('  ✗ Agent not found: $agent_id');
      process.exit(1);
    }

    const agent = cfg.agents.list[idx];
    const newModel = '$new_model';
    const newTools = '$new_tools';
    const newWorkspace = '$new_workspace';

    if (newModel) {
      agent.model = agent.model || {};
      agent.model.primary = newModel;
      console.log('  ✓ Model → ' + newModel);
    }
    if (newTools) {
      if (newTools === 'coding') {
        agent.tools = {
          profile: 'coding',
          allow: ['exec', 'process', 'read', 'write'],
          deny: ['tts'],
          exec: { host: 'gateway', security: 'full' }
        };
      } else if (newTools === 'full') {
        agent.tools = {
          profile: 'full',
          allow: ['group:fs', 'group:runtime', 'group:ui', 'group:web', 'group:sessions', 'group:automation'],
          elevated: { enabled: true }
        };
      }
      console.log('  ✓ Tools → ' + newTools);
    }
    if (newWorkspace) {
      agent.workspace = newWorkspace;
      console.log('  ✓ Workspace → ' + newWorkspace);
    }

    cfg.agents.list[idx] = agent;
    fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
    console.log('  ✓ Config saved');
  "
}

cmd_info() {
  local agent_id="$1"
  if [[ -z "$agent_id" ]]; then
    echo "ERROR: Usage: manage-agents.sh info <agent-id>" >&2
    exit 1
  fi

  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const agent = (cfg.agents?.list || []).find(a => a.id === '$agent_id');

    if (!agent) {
      console.log('Agent not found: $agent_id');
      process.exit(1);
    }

    console.log('Agent: ' + agent.id);
    console.log('  Default:   ' + (agent.default ? 'yes' : 'no'));
    console.log('  Model:     ' + (agent.model?.primary || 'default'));
    console.log('  Workspace: ' + (agent.workspace || 'default'));
    console.log('  Tools:     ' + JSON.stringify(agent.tools || 'default', null, 4).split('\n').join('\n             '));

    // Check workspace
    const ws = agent.workspace || '';
    if (ws && fs.existsSync(ws)) {
      console.log('  WS exists:  ✓');
      const files = fs.readdirSync(ws).filter(f => !f.startsWith('.'));
      console.log('  WS files:   ' + files.slice(0, 15).join(', ') + (files.length > 15 ? '...' : ''));
    } else {
      console.log('  WS exists:  ✗');
    }
  "
}

cmd_count() {
  node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    const count = (cfg.agents?.list || []).length;
    console.log(count + '/$MAX_AGENTS agents configured');
  "
}

# ─── Dispatch ───
COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
  list)    cmd_list ;;
  status)  cmd_status ;;
  remove)  cmd_remove "${1:-}" ;;
  update)  cmd_update "${1:-}" "$@" ;;
  info)    cmd_info "${1:-}" ;;
  count)   cmd_count ;;
  *)
    echo "manage-agents.sh — Manage the OpenClaw agent fleet"
    echo ""
    echo "Commands:"
    echo "  list                  List all agents"
    echo "  status                Health check all agents"
    echo "  remove <id>           Remove agent from config"
    echo "  update <id> [opts]    Update agent config"
    echo "  info <id>             Detailed info for one agent"
    echo "  count                 Show agent count vs limit"
    echo ""
    echo "Examples:"
    echo "  ./scripts/manage-agents.sh list"
    echo "  ./scripts/manage-agents.sh remove researcher"
    echo "  ./scripts/manage-agents.sh update trader --model ollama/qwen2.5:7b-instruct"
    ;;
esac
