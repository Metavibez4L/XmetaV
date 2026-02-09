#!/usr/bin/env bash
# swarm.sh — Multi-agent swarm orchestration engine
#
# Dispatches tasks across the OpenClaw agent fleet in three modes:
#   parallel      — all tasks run simultaneously, results collected
#   pipeline      — sequential chain, output from one feeds into the next
#   collaborative — same task sent to multiple agents, then synthesized
#
# Builds on agent-task.sh for anti-stall best practices.
#
# Usage:
#   # From manifest file
#   ./scripts/swarm.sh manifest.json
#
#   # From stdin
#   ./scripts/swarm.sh <<< '{"mode":"parallel","tasks":[...]}'
#
#   # Quick parallel (no manifest)
#   ./scripts/swarm.sh --parallel basedintern "Run tests" akua "Compile"
#
#   # Quick pipeline
#   ./scripts/swarm.sh --pipeline basedintern "Analyze code" akua "Apply suggestions"
#
#   # Quick collaborative
#   ./scripts/swarm.sh --collab "Review security" basedintern akua
#
#   # List past swarm runs
#   ./scripts/swarm.sh --status
#
#   # Read results from a run
#   ./scripts/swarm.sh --results <run-id>
#
# Environment:
#   SWARM_TIMEOUT     Per-task timeout in seconds (default: 120)
#   SWARM_MAX_PARALLEL  Max concurrent tasks (default: 4)
#   SWARM_DIR         Results directory (default: ~/.openclaw/swarm)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWARM_TIMEOUT="${SWARM_TIMEOUT:-120}"
SWARM_MAX_PARALLEL="${SWARM_MAX_PARALLEL:-4}"
SWARM_DIR="${SWARM_DIR:-$HOME/.openclaw/swarm}"

# ─── Utilities ───

log() { echo "[swarm] $*"; }
err() { echo "[swarm] ERROR: $*" >&2; }

generate_run_id() {
  echo "swarm_$(date +%Y%m%d_%H%M%S)_$$"
}

setup_run_dir() {
  local run_id="$1"
  local run_dir="$SWARM_DIR/$run_id"
  mkdir -p "$run_dir"
  echo "$run_dir"
}

# Run a single agent task with timeout and output capture
run_agent_task() {
  local agent="$1"
  local message="$2"
  local output_file="$3"
  local timeout_secs="${4:-$SWARM_TIMEOUT}"

  local session="${agent}_swarm_$(date +%s%N | cut -c1-13)"

  {
    echo "--- SWARM TASK ---"
    echo "Agent:   $agent"
    echo "Session: $session"
    echo "Started: $(date -Iseconds)"
    echo "Timeout: ${timeout_secs}s"
    echo "---"
    echo ""
  } > "$output_file"

  local exit_code=0
  if command -v timeout &>/dev/null; then
    timeout "$timeout_secs" openclaw agent \
      --agent "$agent" \
      --local \
      --thinking off \
      --session-id "$session" \
      --message "$message" >> "$output_file" 2>&1 || exit_code=$?
  else
    openclaw agent \
      --agent "$agent" \
      --local \
      --thinking off \
      --session-id "$session" \
      --message "$message" >> "$output_file" 2>&1 || exit_code=$?
  fi

  {
    echo ""
    echo "---"
    echo "Finished: $(date -Iseconds)"
    echo "Exit:     $exit_code"
    if [[ "$exit_code" -eq 124 ]]; then
      echo "Status:   TIMEOUT (exceeded ${timeout_secs}s)"
    elif [[ "$exit_code" -eq 0 ]]; then
      echo "Status:   OK"
    else
      echo "Status:   FAILED"
    fi
  } >> "$output_file"

  return $exit_code
}

# ─── Parallel Mode ───

run_parallel() {
  local run_dir="$1"
  local manifest="$2"

  local task_count
  task_count=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log((m.tasks || []).length);
  " <<< "$manifest")

  if [[ "$task_count" -eq 0 ]]; then
    err "No tasks defined in manifest"
    return 1
  fi

  local on_failure
  on_failure=$(node -e "
    const m = JSON.parse('$(echo "$manifest" | sed "s/'/\\\\'/g")');
    console.log(m.on_failure || 'continue');
  ")

  log "Mode: PARALLEL | Tasks: $task_count | Failure: $on_failure"
  echo ""

  # Extract tasks and dispatch
  local pids=()
  local task_ids=()
  local task_agents=()

  for i in $(seq 0 $((task_count - 1))); do
    local task_info
    task_info=$(node -e "
      const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      const t = m.tasks[$i];
      console.log(JSON.stringify({
        id: t.id || 'task_$i',
        agent: t.agent || 'main',
        message: t.message || '',
        timeout: t.timeout || $SWARM_TIMEOUT
      }));
    " <<< "$manifest")

    local tid tagent tmsg ttimeout
    tid=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').id)")
    tagent=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').agent)")
    tmsg=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').message)")
    ttimeout=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').timeout)")

    local outfile="$run_dir/${tid}.out"
    task_ids+=("$tid")
    task_agents+=("$tagent")

    log "  Dispatching: $tid -> $tagent"

    # Respect max parallelism
    while [[ ${#pids[@]} -ge $SWARM_MAX_PARALLEL ]]; do
      local new_pids=()
      for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
          new_pids+=("$pid")
        fi
      done
      pids=("${new_pids[@]}")
      if [[ ${#pids[@]} -ge $SWARM_MAX_PARALLEL ]]; then
        sleep 1
      fi
    done

    run_agent_task "$tagent" "$tmsg" "$outfile" "$ttimeout" &
    pids+=($!)
  done

  # Wait for all
  log ""
  log "Waiting for $task_count tasks..."
  local failures=0
  for i in "${!pids[@]}"; do
    wait "${pids[$i]}" 2>/dev/null || {
      local rc=$?
      ((failures++)) || true
      log "  FAILED: ${task_ids[$i]} (${task_agents[$i]}) exit=$rc"
    }
  done

  local succeeded=$((task_count - failures))
  log ""
  log "Results: $succeeded/$task_count succeeded, $failures failed"

  return 0
}

# ─── Pipeline Mode ───

run_pipeline() {
  local run_dir="$1"
  local manifest="$2"

  local task_count
  task_count=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log((m.tasks || []).length);
  " <<< "$manifest")

  if [[ "$task_count" -eq 0 ]]; then
    err "No tasks defined in manifest"
    return 1
  fi

  local on_failure
  on_failure=$(node -e "
    const m = JSON.parse('$(echo "$manifest" | sed "s/'/\\\\'/g")');
    console.log(m.on_failure || 'stop');
  ")

  log "Mode: PIPELINE | Steps: $task_count | Failure: $on_failure"
  echo ""

  local prev_output=""
  local failures=0

  for i in $(seq 0 $((task_count - 1))); do
    local task_info
    task_info=$(node -e "
      const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      const t = m.tasks[$i];
      console.log(JSON.stringify({
        id: t.id || 'step_$i',
        agent: t.agent || 'main',
        message: t.message || '',
        timeout: t.timeout || $SWARM_TIMEOUT
      }));
    " <<< "$manifest")

    local tid tagent tmsg ttimeout
    tid=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').id)")
    tagent=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').agent)")
    tmsg=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').message)")
    ttimeout=$(node -e "console.log(JSON.parse('$(echo "$task_info" | sed "s/'/\\\\'/g")').timeout)")

    # Inject previous output as context
    if [[ -n "$prev_output" ]]; then
      tmsg="$tmsg

--- Context from previous step ---
$prev_output
--- End context ---"
    fi

    local outfile="$run_dir/${tid}.out"
    log "  Step $((i+1))/$task_count: $tid -> $tagent"

    local rc=0
    run_agent_task "$tagent" "$tmsg" "$outfile" "$ttimeout" || rc=$?

    if [[ $rc -ne 0 ]]; then
      ((failures++)) || true
      log "  FAILED: $tid (exit=$rc)"
      if [[ "$on_failure" == "stop" ]]; then
        err "Pipeline halted at step $tid"
        return 1
      fi
    fi

    # Extract output for next step (strip header/footer metadata)
    prev_output=$(sed -n '/^---$/,/^---$/!p' "$outfile" | head -500)
  done

  local succeeded=$((task_count - failures))
  log ""
  log "Pipeline: $succeeded/$task_count steps succeeded"

  return 0
}

# ─── Collaborative Mode ───

run_collaborative() {
  local run_dir="$1"
  local manifest="$2"

  local task
  task=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(m.task || '');
  " <<< "$manifest")

  if [[ -z "$task" ]]; then
    err "No 'task' field in collaborative manifest"
    return 1
  fi

  local agents_json
  agents_json=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(JSON.stringify(m.agents || []));
  " <<< "$manifest")

  local agent_count
  agent_count=$(node -e "console.log(JSON.parse('$agents_json').length)")

  if [[ "$agent_count" -eq 0 ]]; then
    err "No agents defined in collaborative manifest"
    return 1
  fi

  local synth_agent
  synth_agent=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(m.synthesize_agent || 'main');
  " <<< "$manifest")

  log "Mode: COLLABORATIVE | Agents: $agent_count | Synthesizer: $synth_agent"
  log "Task: $task"
  echo ""

  # Dispatch same task to all agents in parallel
  local pids=()
  local agent_ids=()

  for i in $(seq 0 $((agent_count - 1))); do
    local agent
    agent=$(node -e "console.log(JSON.parse('$agents_json')[$i])")
    agent_ids+=("$agent")

    local outfile="$run_dir/${agent}.out"
    log "  Dispatching to: $agent"

    run_agent_task "$agent" "$task" "$outfile" "$SWARM_TIMEOUT" &
    pids+=($!)
  done

  # Wait for all
  log ""
  log "Waiting for $agent_count agents..."
  local failures=0
  for i in "${!pids[@]}"; do
    wait "${pids[$i]}" 2>/dev/null || {
      ((failures++)) || true
      log "  FAILED: ${agent_ids[$i]}"
    }
  done

  log "Responses: $((agent_count - failures))/$agent_count succeeded"

  # Synthesis step
  log ""
  log "Running synthesis on: $synth_agent"

  local synth_input="You are synthesizing responses from $agent_count agents who were all given the same task.

ORIGINAL TASK: $task

"
  for agent in "${agent_ids[@]}"; do
    local outfile="$run_dir/${agent}.out"
    if [[ -f "$outfile" ]]; then
      local content
      content=$(sed -n '/^---$/,/^---$/!p' "$outfile" | head -300)
      synth_input+="
--- Response from $agent ---
$content
--- End $agent ---

"
    fi
  done

  synth_input+="
Please synthesize these responses into a unified, actionable summary. Highlight agreements, contradictions, and key insights from each agent."

  local synth_outfile="$run_dir/synthesis.out"
  run_agent_task "$synth_agent" "$synth_input" "$synth_outfile" "$SWARM_TIMEOUT" || {
    err "Synthesis step failed"
  }

  log "Synthesis complete"
  return 0
}

# ─── Synthesis (for parallel/pipeline) ───

run_synthesis() {
  local run_dir="$1"
  local manifest="$2"

  local synth_agent
  synth_agent=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(m.synthesize_agent || 'main');
  " <<< "$manifest")

  log "Running synthesis on: $synth_agent"

  local synth_input="You are synthesizing results from a multi-agent swarm operation.

"
  for outfile in "$run_dir"/*.out; do
    if [[ -f "$outfile" && "$(basename "$outfile")" != "synthesis.out" ]]; then
      local task_id
      task_id=$(basename "$outfile" .out)
      local content
      content=$(sed -n '/^---$/,/^---$/!p' "$outfile" | head -300)
      synth_input+="
--- Results from task: $task_id ---
$content
--- End $task_id ---

"
    fi
  done

  synth_input+="
Please provide a unified summary of all task results. Note any failures, key findings, and recommended next steps."

  local synth_outfile="$run_dir/synthesis.out"
  run_agent_task "$synth_agent" "$synth_input" "$synth_outfile" "$SWARM_TIMEOUT" || {
    err "Synthesis step failed"
  }
}

# ─── Generate Summary ───

generate_summary() {
  local run_dir="$1"
  local run_id="$2"
  local mode="$3"
  local start_time="$4"

  local summary_file="$run_dir/summary.md"
  local end_time
  end_time=$(date -Iseconds)

  {
    echo "# Swarm Run: $run_id"
    echo ""
    echo "- **Mode**: $mode"
    echo "- **Started**: $start_time"
    echo "- **Finished**: $end_time"
    echo ""
    echo "## Task Results"
    echo ""

    for outfile in "$run_dir"/*.out; do
      if [[ -f "$outfile" ]]; then
        local task_id
        task_id=$(basename "$outfile" .out)
        local status
        status=$(grep "^Status:" "$outfile" 2>/dev/null | tail -1 | sed 's/Status: *//')
        local agent
        agent=$(grep "^Agent:" "$outfile" 2>/dev/null | head -1 | sed 's/Agent: *//')
        echo "- **$task_id** ($agent): ${status:-UNKNOWN}"
      fi
    done

    echo ""
    echo "## Output Files"
    echo ""
    for outfile in "$run_dir"/*.out; do
      if [[ -f "$outfile" ]]; then
        echo "- \`$(basename "$outfile")\`"
      fi
    done

    if [[ -f "$run_dir/synthesis.out" ]]; then
      echo ""
      echo "## Synthesis"
      echo ""
      sed -n '/^---$/,/^---$/!p' "$run_dir/synthesis.out" | head -100
    fi
  } > "$summary_file"

  log "Summary written to: $summary_file"
}

# ─── Quick Mode Helpers ───

build_quick_parallel_manifest() {
  # Args: agent1 msg1 agent2 msg2 ...
  local tasks="["
  local first=true
  local agent=""
  local idx=0

  while [[ $# -gt 0 ]]; do
    agent="$1"
    local msg="${2:?Missing message for agent $agent}"
    shift 2

    if [[ "$first" == "true" ]]; then
      first=false
    else
      tasks+=","
    fi
    tasks+="{\"id\":\"task_$idx\",\"agent\":\"$agent\",\"message\":$(node -e "process.stdout.write(JSON.stringify('$msg'))")}"
    ((idx++))
  done

  tasks+="]"
  echo "{\"mode\":\"parallel\",\"tasks\":$tasks,\"on_failure\":\"continue\"}"
}

build_quick_pipeline_manifest() {
  # Args: agent1 msg1 agent2 msg2 ...
  local tasks="["
  local first=true
  local prev_id=""
  local idx=0

  while [[ $# -gt 0 ]]; do
    local agent="$1"
    local msg="${2:?Missing message for agent $agent}"
    shift 2

    local tid="step_$idx"

    if [[ "$first" == "true" ]]; then
      first=false
    else
      tasks+=","
    fi

    local dep=""
    if [[ -n "$prev_id" ]]; then
      dep=",\"depends_on\":\"$prev_id\""
    fi

    tasks+="{\"id\":\"$tid\",\"agent\":\"$agent\",\"message\":$(node -e "process.stdout.write(JSON.stringify('$msg'))")$dep}"
    prev_id="$tid"
    ((idx++))
  done

  tasks+="]"
  echo "{\"mode\":\"pipeline\",\"tasks\":$tasks,\"on_failure\":\"stop\"}"
}

build_quick_collab_manifest() {
  # Args: "task message" agent1 agent2 ...
  local task_msg="$1"
  shift

  local agents="["
  local first=true
  while [[ $# -gt 0 ]]; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      agents+=","
    fi
    agents+="\"$1\""
    shift
  done
  agents+="]"

  echo "{\"mode\":\"collaborative\",\"task\":$(node -e "process.stdout.write(JSON.stringify('$task_msg'))"),\"agents\":$agents,\"synthesize_agent\":\"main\"}"
}

# ─── Status / Results Commands ───

cmd_status() {
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║                  SWARM RUN HISTORY                     ║"
  echo "╠═══════════════════════════════════════════════════════╣"

  if [[ ! -d "$SWARM_DIR" ]]; then
    echo "  (no swarm runs yet)"
    echo "╚═══════════════════════════════════════════════════════╝"
    return
  fi

  local count=0
  for run_dir in "$SWARM_DIR"/swarm_*/; do
    if [[ -d "$run_dir" ]]; then
      local run_id
      run_id=$(basename "$run_dir")
      local task_count
      task_count=$(find "$run_dir" -name "*.out" -not -name "synthesis.out" | wc -l)
      local has_synth="no"
      [[ -f "$run_dir/synthesis.out" ]] && has_synth="yes"
      local has_summary="no"
      [[ -f "$run_dir/summary.md" ]] && has_summary="yes"

      echo "  $run_id"
      echo "    Tasks: $task_count | Synthesis: $has_synth | Summary: $has_summary"
      ((count++))
    fi
  done

  if [[ $count -eq 0 ]]; then
    echo "  (no swarm runs yet)"
  fi

  echo ""
  echo "  Total runs: $count"
  echo "╚═══════════════════════════════════════════════════════╝"
}

cmd_results() {
  local run_id="$1"
  if [[ -z "$run_id" ]]; then
    err "Usage: swarm.sh --results <run-id>"
    return 1
  fi

  local run_dir="$SWARM_DIR/$run_id"
  if [[ ! -d "$run_dir" ]]; then
    err "Run not found: $run_id"
    err "Use --status to list runs"
    return 1
  fi

  if [[ -f "$run_dir/summary.md" ]]; then
    cat "$run_dir/summary.md"
  else
    echo "No summary.md found. Task outputs:"
    echo ""
    for outfile in "$run_dir"/*.out; do
      if [[ -f "$outfile" ]]; then
        echo "━━━ $(basename "$outfile") ━━━"
        cat "$outfile"
        echo ""
      fi
    done
  fi
}

# ─── Main Dispatch ───

main() {
  # Handle quick modes and commands
  case "${1:-}" in
    --parallel)
      shift
      if [[ $# -lt 2 ]]; then
        err "Usage: swarm.sh --parallel agent1 \"msg1\" [agent2 \"msg2\" ...]"
        exit 1
      fi
      local manifest
      manifest=$(build_quick_parallel_manifest "$@")
      local run_id
      run_id=$(generate_run_id)
      local run_dir
      run_dir=$(setup_run_dir "$run_id")
      local start_time
      start_time=$(date -Iseconds)

      echo "╔═══════════════════════════════════════════════════════╗"
      echo "║              SWARM — PARALLEL DISPATCH                 ║"
      echo "╠═══════════════════════════════════════════════════════╣"
      echo "  Run ID:  $run_id"
      echo "  Results: $run_dir"
      echo "╚═══════════════════════════════════════════════════════╝"
      echo ""

      # Save manifest
      echo "$manifest" > "$run_dir/manifest.json"

      run_parallel "$run_dir" "$manifest"
      generate_summary "$run_dir" "$run_id" "parallel" "$start_time"

      echo ""
      echo "═══ SWARM COMPLETE ═══"
      echo "Results: $run_dir"
      echo "Summary: $run_dir/summary.md"
      return 0
      ;;

    --pipeline)
      shift
      if [[ $# -lt 2 ]]; then
        err "Usage: swarm.sh --pipeline agent1 \"msg1\" [agent2 \"msg2\" ...]"
        exit 1
      fi
      local manifest
      manifest=$(build_quick_pipeline_manifest "$@")
      local run_id
      run_id=$(generate_run_id)
      local run_dir
      run_dir=$(setup_run_dir "$run_id")
      local start_time
      start_time=$(date -Iseconds)

      echo "╔═══════════════════════════════════════════════════════╗"
      echo "║               SWARM — PIPELINE                        ║"
      echo "╠═══════════════════════════════════════════════════════╣"
      echo "  Run ID:  $run_id"
      echo "  Results: $run_dir"
      echo "╚═══════════════════════════════════════════════════════╝"
      echo ""

      echo "$manifest" > "$run_dir/manifest.json"

      run_pipeline "$run_dir" "$manifest"
      generate_summary "$run_dir" "$run_id" "pipeline" "$start_time"

      echo ""
      echo "═══ SWARM COMPLETE ═══"
      echo "Results: $run_dir"
      echo "Summary: $run_dir/summary.md"
      return 0
      ;;

    --collab)
      shift
      local collab_task="${1:?Usage: swarm.sh --collab \"task\" agent1 agent2 ...}"
      shift
      if [[ $# -lt 1 ]]; then
        err "Usage: swarm.sh --collab \"task\" agent1 [agent2 ...]"
        exit 1
      fi
      local manifest
      manifest=$(build_quick_collab_manifest "$collab_task" "$@")
      local run_id
      run_id=$(generate_run_id)
      local run_dir
      run_dir=$(setup_run_dir "$run_id")
      local start_time
      start_time=$(date -Iseconds)

      echo "╔═══════════════════════════════════════════════════════╗"
      echo "║            SWARM — COLLABORATIVE                      ║"
      echo "╠═══════════════════════════════════════════════════════╣"
      echo "  Run ID:  $run_id"
      echo "  Results: $run_dir"
      echo "╚═══════════════════════════════════════════════════════╝"
      echo ""

      echo "$manifest" > "$run_dir/manifest.json"

      run_collaborative "$run_dir" "$manifest"
      generate_summary "$run_dir" "$run_id" "collaborative" "$start_time"

      echo ""
      echo "═══ SWARM COMPLETE ═══"
      echo "Results: $run_dir"
      echo "Summary: $run_dir/summary.md"
      return 0
      ;;

    --status)
      cmd_status
      return 0
      ;;

    --results)
      cmd_results "${2:-}"
      return 0
      ;;

    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# *//'
      return 0
      ;;
  esac

  # ─── Manifest mode (file or stdin) ───
  local manifest=""

  if [[ -n "${1:-}" && -f "$1" ]]; then
    manifest=$(cat "$1")
  elif [[ ! -t 0 ]]; then
    manifest=$(cat)
  else
    err "No manifest provided. Use a file, stdin, or --parallel/--pipeline/--collab"
    echo ""
    sed -n '2,/^$/p' "$0" | sed 's/^# *//'
    exit 1
  fi

  # Parse mode
  local mode
  mode=$(node -e "
    const m = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(m.mode || 'parallel');
  " <<< "$manifest")

  local do_synthesize
  do_synthesize=$(node -e "
    const m = JSON.parse('$(echo "$manifest" | sed "s/'/\\\\'/g")');
    console.log(m.synthesize === true || m.mode === 'collaborative' ? 'true' : 'false');
  ")

  local run_id
  run_id=$(generate_run_id)
  local run_dir
  run_dir=$(setup_run_dir "$run_id")
  local start_time
  start_time=$(date -Iseconds)

  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║                   SWARM ENGINE                         ║"
  echo "╠═══════════════════════════════════════════════════════╣"
  echo "  Run ID:  $run_id"
  echo "  Mode:    $mode"
  echo "  Results: $run_dir"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""

  # Save manifest
  echo "$manifest" > "$run_dir/manifest.json"

  # Dispatch by mode
  case "$mode" in
    parallel)
      run_parallel "$run_dir" "$manifest"
      ;;
    pipeline)
      run_pipeline "$run_dir" "$manifest"
      ;;
    collaborative)
      run_collaborative "$run_dir" "$manifest"
      ;;
    *)
      err "Unknown mode: $mode (expected parallel, pipeline, or collaborative)"
      exit 1
      ;;
  esac

  # Optional synthesis for parallel/pipeline
  if [[ "$do_synthesize" == "true" && "$mode" != "collaborative" ]]; then
    echo ""
    run_synthesis "$run_dir" "$manifest"
  fi

  # Generate summary
  generate_summary "$run_dir" "$run_id" "$mode" "$start_time"

  echo ""
  echo "═══ SWARM COMPLETE ═══"
  echo "Results: $run_dir"
  echo "Summary: $run_dir/summary.md"
}

main "$@"
