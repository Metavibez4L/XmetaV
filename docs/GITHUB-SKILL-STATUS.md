# GitHub Skill Status

## Current State
- Installed: Yes
- Ready: Yes
- Authenticated: Yes
- Agent Output: Working (payload received)

## Usage Example
```
openclaw agent --agent main --local --thinking off --message "/github help" --json
```

## Troubleshooting
- If payload is empty, ensure `gh` CLI is installed and authenticated (`gh auth login`).
- Make sure you are in a valid Git repository for repo-specific commands.
- Restart gateway after any skill install or config change.

## Last Verified
- 2026-02-14
