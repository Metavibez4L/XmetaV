#!/usr/bin/env bash
# create-agent.sh — Programmatically create a new OpenClaw agent
#
# Creates the agent entry in ~/.openclaw/openclaw.json, sets up the workspace
# directory, and seeds it with identity files (AGENTS.md + SOUL.md) from templates.
#
# Usage:
#   ./scripts/create-agent.sh --id <agent-id> [options]
#
# Required:
#   --id <id>              Agent identifier (lowercase, no spaces)
#
# Options:
#   --workspace <path>     Workspace directory (default: /home/manifest/<id>)
#   --tools <profile>      Tool profile: coding | full (default: coding)
#   --model <model>        Model to use (default: ollama/kimi-k2.5:cloud)
#   --description <text>   Agent description (used in AGENTS.md)
#   --template <type>      Identity template: coding | bot | research | devops | general (default: general)
#   --web                  Also create a <id>_web companion agent with full tools
#   --github               Create a GitHub repo and push initial scaffold
#   --github-org <org>     GitHub org/user for the repo (default: Metavibez4L)
#   --private              Make the GitHub repo private (default: public)
#   --dry-run              Show what would be done without making changes
#
# Examples:
#   ./scripts/create-agent.sh --id researcher --description "Web research agent"
#   ./scripts/create-agent.sh --id trader --workspace /home/manifest/trader --tools coding --web
#   ./scripts/create-agent.sh --id social-bot --template bot --description "Discord community bot"
#   ./scripts/create-agent.sh --id my-api --template coding --github --private --web
#
set -euo pipefail

# Ensure modern Node.js (>= 16) is available — load nvm if system node is too old
if [[ "$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 16 ]] 2>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use default --silent 2>/dev/null || nvm use node --silent 2>/dev/null || true
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
TEMPLATES_DIR="$REPO_DIR/templates/agents"
MAX_AGENTS="${MAX_AGENTS:-10}"

# ─── Defaults ───
AGENT_ID=""
WORKSPACE=""
TOOLS_PROFILE="coding"
MODEL="ollama/kimi-k2.5:cloud"
DESCRIPTION=""
TEMPLATE="general"
CREATE_WEB=false
CREATE_GITHUB=false
GITHUB_ORG="Metavibez4L"
GITHUB_PRIVATE=false
DRY_RUN=false

# ─── Parse arguments ───
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)         AGENT_ID="$2"; shift 2 ;;
    --workspace)  WORKSPACE="$2"; shift 2 ;;
    --tools)      TOOLS_PROFILE="$2"; shift 2 ;;
    --model)      MODEL="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --template)   TEMPLATE="$2"; shift 2 ;;
    --web)        CREATE_WEB=true; shift ;;
    --github)     CREATE_GITHUB=true; shift ;;
    --github-org) GITHUB_ORG="$2"; shift 2 ;;
    --private)    GITHUB_PRIVATE=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ─── Validate ───
if [[ -z "$AGENT_ID" ]]; then
  echo "ERROR: --id is required" >&2
  echo "Usage: $0 --id <agent-id> [options]" >&2
  exit 1
fi

# Validate agent ID format (lowercase alphanumeric + hyphens)
if ! [[ "$AGENT_ID" =~ ^[a-z][a-z0-9_-]*$ ]]; then
  echo "ERROR: Agent ID must start with a lowercase letter and contain only [a-z0-9_-]" >&2
  exit 1
fi

# Validate tools profile
if [[ "$TOOLS_PROFILE" != "coding" && "$TOOLS_PROFILE" != "full" ]]; then
  echo "ERROR: --tools must be 'coding' or 'full'" >&2
  exit 1
fi

# Validate template
VALID_TEMPLATES=("coding" "bot" "research" "devops" "general")
TEMPLATE_VALID=false
for t in "${VALID_TEMPLATES[@]}"; do
  if [[ "$TEMPLATE" == "$t" ]]; then
    TEMPLATE_VALID=true
    break
  fi
done
if [[ "$TEMPLATE_VALID" == "false" ]]; then
  echo "ERROR: --template must be one of: ${VALID_TEMPLATES[*]}" >&2
  exit 1
fi

# Default workspace
if [[ -z "$WORKSPACE" ]]; then
  WORKSPACE="/home/manifest/$AGENT_ID"
fi

# Default description
if [[ -z "$DESCRIPTION" ]]; then
  DESCRIPTION="Agent: $AGENT_ID"
fi

# ─── Check config exists ───
if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  echo "ERROR: OpenClaw config not found at $OPENCLAW_CONFIG" >&2
  echo "Run 'openclaw doctor' or set OPENCLAW_CONFIG to the correct path." >&2
  exit 1
fi

# ─── Check agent count limit ───
CURRENT_COUNT=$(node -e "
  const cfg = JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG', 'utf8'));
  console.log((cfg.agents?.list || []).length);
")
if [[ "$CURRENT_COUNT" -ge "$MAX_AGENTS" ]]; then
  echo "ERROR: Agent limit reached ($CURRENT_COUNT/$MAX_AGENTS). Set MAX_AGENTS to increase." >&2
  exit 1
fi

# ─── Check for duplicate ───
AGENT_EXISTS=$(node -e "
  const cfg = JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG', 'utf8'));
  const exists = (cfg.agents?.list || []).some(a => a.id === '$AGENT_ID');
  console.log(exists ? 'yes' : 'no');
")

# ─── Summary ───
echo "╔═══════════════════════════════════════════╗"
echo "║         AGENT FACTORY — CREATE             ║"
echo "╠═══════════════════════════════════════════╣"
echo "  Agent ID:    $AGENT_ID"
echo "  Workspace:   $WORKSPACE"
echo "  Tools:       $TOOLS_PROFILE"
echo "  Model:       $MODEL"
echo "  Template:    $TEMPLATE"
echo "  Description: $DESCRIPTION"
echo "  Web agent:   $CREATE_WEB"
echo "  GitHub repo: $CREATE_GITHUB"
if [[ "$CREATE_GITHUB" == "true" ]]; then
  echo "  GitHub org:  $GITHUB_ORG"
  echo "  Visibility:  $( [[ "$GITHUB_PRIVATE" == "true" ]] && echo "private" || echo "public" )"
fi
if [[ "$AGENT_EXISTS" == "yes" ]]; then
  echo "  Status:      UPDATE (agent already exists)"
else
  echo "  Status:      NEW"
fi
echo "╚═══════════════════════════════════════════╝"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] No changes made."
  exit 0
fi

# ─── Create workspace directory ───
echo "→ Creating workspace: $WORKSPACE"
mkdir -p "$WORKSPACE"

# ─── Seed identity files from template ───
TEMPLATE_FILE="$TEMPLATES_DIR/${TEMPLATE}.md"
if [[ -f "$TEMPLATE_FILE" ]]; then
  echo "→ Seeding identity from template: $TEMPLATE"

  # Extract AGENTS.md section (everything between "# AGENTS.md" and "# SOUL.md")
  # and SOUL.md section (everything after "# SOUL.md")
  node -e "
    const fs = require('fs');
    const tmpl = fs.readFileSync('$TEMPLATE_FILE', 'utf8');
    const id = '$AGENT_ID';
    const desc = $(printf '%s' "$DESCRIPTION" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))");
    const workspace = '$WORKSPACE';

    // Split template into AGENTS.md and SOUL.md sections
    const agentsSplit = tmpl.split(/^---SOUL---$/m);
    let agentsMd = (agentsSplit[0] || '').trim();
    let soulMd = (agentsSplit[1] || '').trim();

    // Replace placeholders
    const replacements = { '{{ID}}': id, '{{DESCRIPTION}}': desc, '{{WORKSPACE}}': workspace };
    for (const [k, v] of Object.entries(replacements)) {
      agentsMd = agentsMd.split(k).join(v);
      soulMd = soulMd.split(k).join(v);
    }

    // Write files (don't overwrite if they already exist and have content)
    const agentsPath = workspace + '/AGENTS.md';
    const soulPath = workspace + '/SOUL.md';

    if (!fs.existsSync(agentsPath) || fs.readFileSync(agentsPath, 'utf8').trim() === '') {
      fs.writeFileSync(agentsPath, agentsMd + '\n');
      console.log('  ✓ Created AGENTS.md');
    } else {
      console.log('  ⊘ AGENTS.md already exists (skipped)');
    }

    if (!fs.existsSync(soulPath) || fs.readFileSync(soulPath, 'utf8').trim() === '') {
      fs.writeFileSync(soulPath, soulMd + '\n');
      console.log('  ✓ Created SOUL.md');
    } else {
      console.log('  ⊘ SOUL.md already exists (skipped)');
    }
  "
else
  echo "  ⚠ Template not found at $TEMPLATE_FILE (skipping identity seeding)"
fi

# ─── Build tools config ───
build_tools_json() {
  local profile="$1"
  if [[ "$profile" == "coding" ]]; then
    echo '{
      "profile": "coding",
      "allow": ["exec", "process", "read", "write"],
      "deny": ["tts"],
      "exec": { "host": "gateway", "security": "full" }
    }'
  else
    echo '{
      "profile": "full",
      "allow": ["group:fs", "group:runtime", "group:ui", "group:web", "group:sessions", "group:automation"],
      "elevated": { "enabled": true }
    }'
  fi
}

# ─── Inject agent into openclaw.json ───
echo "→ Updating OpenClaw config: $OPENCLAW_CONFIG"

TOOLS_JSON=$(build_tools_json "$TOOLS_PROFILE")
WEB_TOOLS_JSON=$(build_tools_json "full")

node -e "
  const fs = require('fs');
  const configPath = '$OPENCLAW_CONFIG';
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!cfg.agents) cfg.agents = {};
  if (!cfg.agents.list) cfg.agents.list = [];

  const agentId = '$AGENT_ID';
  const workspace = '$WORKSPACE';
  const model = '$MODEL';
  const createWeb = $CREATE_WEB;

  // Build primary agent entry
  const primaryAgent = {
    id: agentId,
    workspace: workspace,
    model: { primary: model },
    tools: $TOOLS_JSON
  };

  // Upsert primary agent
  const existingIdx = cfg.agents.list.findIndex(a => a.id === agentId);
  if (existingIdx >= 0) {
    cfg.agents.list[existingIdx] = { ...cfg.agents.list[existingIdx], ...primaryAgent };
    console.log('  ✓ Updated agent: ' + agentId);
  } else {
    cfg.agents.list.push(primaryAgent);
    console.log('  ✓ Created agent: ' + agentId);
  }

  // Optionally create _web companion
  if (createWeb) {
    const webId = agentId + '_web';
    const webAgent = {
      id: webId,
      workspace: workspace,
      model: { primary: model },
      tools: $WEB_TOOLS_JSON
    };

    const webIdx = cfg.agents.list.findIndex(a => a.id === webId);
    if (webIdx >= 0) {
      cfg.agents.list[webIdx] = { ...cfg.agents.list[webIdx], ...webAgent };
      console.log('  ✓ Updated companion: ' + webId);
    } else {
      cfg.agents.list.push(webAgent);
      console.log('  ✓ Created companion: ' + webId);
    }
  }

  // Write back with pretty formatting
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log('  ✓ Config saved');
"

# ─── Create XmetaV agent runbook ───
RUNBOOK_PATH="$REPO_DIR/docs/agents/${AGENT_ID}.md"
if [[ ! -f "$RUNBOOK_PATH" ]]; then
  echo "→ Creating agent runbook: $RUNBOOK_PATH"
  cat > "$RUNBOOK_PATH" << RUNBOOK_EOF
# Agent: \`$AGENT_ID\`

> Auto-generated by Agent Factory on $(date +%Y-%m-%d)

## Purpose

$DESCRIPTION

## Identity and workspace

- **Agent ID**: \`$AGENT_ID\`
- **Workspace**: \`$WORKSPACE\`
- **Model**: \`$MODEL\`
- **Tools**: \`$TOOLS_PROFILE\`
- **Template**: \`$TEMPLATE\`

## How to run

\`\`\`bash
# Atomic task (recommended)
./scripts/agent-task.sh $AGENT_ID "Your task here"

# Direct openclaw
openclaw agent --agent $AGENT_ID --local --thinking off \\
  --session-id ${AGENT_ID}_\$(date +%s) \\
  --message "Your task here"
\`\`\`
RUNBOOK_EOF
  if [[ "$CREATE_WEB" == "true" ]]; then
    cat >> "$RUNBOOK_PATH" << RUNBOOK_WEB_EOF

## Companion: \`${AGENT_ID}_web\`

Full tool access (browser, web automation). Use sparingly to save Kimi quota.

\`\`\`bash
openclaw agent --agent ${AGENT_ID}_web --local --thinking off \\
  --session-id ${AGENT_ID}web_\$(date +%s) \\
  --message "Web automation task here"
\`\`\`
RUNBOOK_WEB_EOF
  fi
  echo "  ✓ Runbook created"
else
  echo "  ⊘ Runbook already exists (skipped)"
fi

# ─── GitHub repo creation ───
if [[ "$CREATE_GITHUB" == "true" ]]; then
  echo ""
  echo "→ Creating GitHub repository"

  if ! command -v gh &>/dev/null; then
    echo "  ⚠ gh CLI not found — skipping GitHub repo creation"
    echo "  Install: https://cli.github.com/"
  elif ! gh auth status &>/dev/null 2>&1; then
    echo "  ⚠ gh not authenticated — skipping GitHub repo creation"
    echo "  Run: gh auth login"
  else
    REPO_NAME="$AGENT_ID"
    REPO_FULL="$GITHUB_ORG/$REPO_NAME"
    VISIBILITY="$( [[ "$GITHUB_PRIVATE" == "true" ]] && echo "--private" || echo "--public" )"

    # Check if repo already exists
    if gh repo view "$REPO_FULL" &>/dev/null 2>&1; then
      echo "  ⊘ Repository $REPO_FULL already exists"

      # Make sure remote is set
      cd "$WORKSPACE"
      if ! git remote get-url origin &>/dev/null 2>&1; then
        git remote add origin "https://github.com/$REPO_FULL.git" 2>/dev/null || true
        echo "  ✓ Remote origin set to https://github.com/$REPO_FULL.git"
      fi
    else
      # Create the repo
      echo "  Creating: $REPO_FULL ($( [[ "$GITHUB_PRIVATE" == "true" ]] && echo "private" || echo "public" ))"
      gh repo create "$REPO_FULL" $VISIBILITY \
        --description "$DESCRIPTION" \
        --source "$WORKSPACE" \
        --remote origin \
        2>&1 | sed 's/^/  /'

      if [[ $? -eq 0 ]]; then
        echo "  ✓ Repository created: https://github.com/$REPO_FULL"
      else
        echo "  ⚠ Repository creation may have failed — check gh output above"
      fi
    fi

    # Push initial commit if there's one
    cd "$WORKSPACE"
    if git rev-parse HEAD &>/dev/null 2>&1; then
      echo "  → Pushing initial commit..."
      git push -u origin HEAD 2>&1 | sed 's/^/  /' || echo "  ⚠ Push failed (may need to pull first)"
      echo "  ✓ Pushed to https://github.com/$REPO_FULL"
    else
      echo "  ⊘ No commits to push yet (run build-app.sh first)"
    fi
  fi
fi

# ─── Verify ───
echo ""
echo "═══ VERIFICATION ═══"
if command -v openclaw &>/dev/null; then
  openclaw agents list 2>/dev/null || echo "  (openclaw agents list returned non-zero — gateway may not be running)"
else
  echo "  (openclaw CLI not in PATH — skipping verification)"
  echo "  Agents in config:"
  node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG', 'utf8'));
    (cfg.agents?.list || []).forEach(a => console.log('    - ' + a.id + ' (' + a.model?.primary + ') → ' + a.workspace));
  "
fi

echo ""
echo "═══ DONE ═══"
echo "Agent '$AGENT_ID' is ready."
if [[ "$CREATE_WEB" == "true" ]]; then
  echo "Companion '${AGENT_ID}_web' is also ready."
fi
echo ""
echo "Next steps:"
echo "  1. Build an app:  ./scripts/build-app.sh --type node --workspace $WORKSPACE"
echo "  2. Run the agent: ./scripts/agent-task.sh $AGENT_ID \"Hello, what can you do?\""
if [[ "$CREATE_GITHUB" == "false" ]]; then
  echo "  3. Create a repo: ./scripts/create-agent.sh --id $AGENT_ID --github"
fi
