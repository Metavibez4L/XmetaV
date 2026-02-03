# Agent Tasks

Examples of what you can ask your AI agent to do.

## Code Help

```bash
# Explain code
ocm "Explain this Python function: def foo(x): return x**2"

# Debug errors
ocm "Why am I getting 'TypeError: NoneType object is not iterable'?"

# Code review
ocm "Review this code for bugs and improvements: $(cat myfile.py)"
```

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

## Writing & Documentation

```bash
# Documentation
ocm "Write a README for a Python CLI tool called 'taskmaster'"

# Explanations
ocm "Explain Docker containers to a beginner"

# Summarize
ocm "Summarize the key points of this article: $(cat article.txt)"
```

## Data & Analysis

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
openclaw --profile dev agent --agent dev --local

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
