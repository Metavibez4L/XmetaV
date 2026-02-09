# Agent Tasks

Examples of what you can ask your AI agents to do.

## Code Help

```bash
# Explain code
ocm "Explain this Python function: def foo(x): return x**2"

# Debug errors
ocm "Why am I getting 'TypeError: NoneType object is not iterable'?"

# Code review
ocm "Review this code for bugs and improvements: $(cat myfile.py)"
```

Note: `ocm` is an alias for `openclaw agent --agent main --local --message`. See `capabilities/quick-commands.md` for alias setup.

## Generate Code

```bash
# Scripts
ocm "Write a bash script to backup my home directory to /mnt/backup"

# Functions
ocm "Write a Python function to parse JSON from a URL"

# Full programs
ocm "Create a simple REST API in Node.js with Express"
```

## System Administration

```bash
# Linux help
ocm "How do I check disk usage on Linux?"

# Troubleshooting
ocm "My SSH connection keeps timing out, how do I fix it?"

# Configuration
ocm "Write an nginx config for reverse proxy to localhost:3000"
```

## Repo Agent Tasks (basedintern)

### Using skills (recommended — no stalling)

```bash
# Health check (typecheck + test + git status in one shot)
ocbi "Run /repo-health"

# Typecheck only
ocbi "Run /repo-ops typecheck"

# Run tests only
ocbi "Run /repo-ops test"

# Full check (typecheck + test)
ocbi "Run /repo-ops check"

# Git status
ocbi "Run /repo-ops status"

# Commit changes
ocbi "Run /repo-ops commit 'feat: add new feature'"

# Push
ocbi "Run /repo-ops push"
```

### Using wrapper scripts (best for pipelines)

```bash
# Single atomic task
./scripts/agent-task.sh basedintern "Run /repo-health"

# Ship pipeline (typecheck + test + commit + push)
./scripts/agent-pipeline.sh ship "feat: add LP support"

# Evolve pipeline (health + implement + health)
./scripts/agent-pipeline.sh evolve "add retry logic to moltbook posting"

# Health check pipeline
./scripts/agent-pipeline.sh health
```

### Manual commands (legacy — can stall on complex tasks)

```bash
# Docs update
ocbi "Read docs/STATUS.md and suggest improvements."

# Full end-to-end
ocbi "Pull latest, run typecheck, run tests, and summarize results."
```

Note: `ocbi` is an alias for `openclaw agent --agent basedintern --local --message`.

## Writing and Documentation

```bash
# Documentation
ocm "Write a README for a Python CLI tool called 'taskmaster'"

# Explanations
ocm "Explain Docker containers to a beginner"

# Summarize
ocm "Summarize the key points of this article: $(cat article.txt)"
```

## Data and Analysis

```bash
# Data parsing
ocm "Write a Python script to convert CSV to JSON"

# Regex help
ocm "Write a regex to match email addresses"

# SQL queries
ocm "Write a SQL query to find duplicate entries in a users table"
```

## Interactive Sessions

For complex, multi-turn conversations:

```bash
# Start interactive mode
openclaw agent --agent main --local

# Now chat naturally:
# > Let's build a web scraper
# > Add error handling
# > Now save results to a database
# > /new  (reset session)
# > /status  (check tokens used)
```

## Chat Commands (in interactive mode)

| Command | Action |
|---------|--------|
| `/new` or `/reset` | Clear conversation |
| `/status` | Show model + token count |
| `/compact` | Summarize context |
| `/think high` | Enable extended thinking |
| `/verbose on` | Detailed output |
