# Akualabs Frontend Workflow (Mac Studio)

## Your Setup

**Local Branch:** `akualabsux` (tracks `akualabs/dev`)
**Location:** `/Users/akualabs/Documents/xmetav1/XmetaV/dashboard`
**Remote:** https://github.com/Metavibez4L/akualabs

---

## Quick Commands

```bash
# Navigate to project
cd /Users/akualabs/Documents/xmetav1/XmetaV

# Make sure you're on akualabsux branch
git checkout akualabsux

# Pull latest from akualabs
git pull akualabs dev

# Make your frontend changes in dashboard/src/...

# Add and commit
git add dashboard/src/your-changes
git commit -m "feat: your change description"

# Push to akualabs
git push akualabs akualabsux:dev
```

---

## Frontend Development

### Start Dev Server
```bash
cd /Users/akualabs/Documents/xmetav1/XmetaV/dashboard
npm run dev
# Opens http://localhost:3000
```

### Make Changes
Edit files in:
- `dashboard/src/app/` — Pages
- `dashboard/src/components/` — Components  
- `dashboard/src/hooks/` — Custom hooks
- `dashboard/src/lib/` — Utilities

### Check Before Push
```bash
cd dashboard
npm run lint          # Fix any linting issues
npx tsc --noEmit      # Type check
npm run build         # Test production build
```

---

## Push to GitHub

```bash
# From repo root
cd /Users/akualabs/Documents/xmetav1/XmetaV

# Stage changes
git add dashboard/

# Commit with clear message
git commit -m "feat: add agent status card component

- Shows agent name, role, status
- Displays skills as badges
- Responsive design"

# Push to akualabs
git push akualabs akualabsux:dev
```

---

## Sync with XmetaV (Optional)

If you want to also update your private XmetaV repo:

```bash
# Merge akualabsux changes into dev
git checkout dev
git merge akualabsux
git push origin dev
```

---

## What to Build

### Priority Frontend Tasks:

1. **Agent Status Cards**
   ```typescript
   // dashboard/src/components/AgentCard.tsx
   export function AgentCard({ agent }) {
     return (
       <div className="cyber-card">
         <h3>{agent.name}</h3>
         <span>{agent.status}</span>
       </div>
     );
   }
   ```

2. **Payment History**
   - Table showing x402 payments
   - Revenue stats
   - Endpoint usage

3. **Command Builder**
   - Dropdown to select agent
   - Text input for command
   - Execute button
   - Streaming output display

4. **Mobile Nav**
   - Hamburger menu
   - Responsive layout

---

## Workflow Summary

| Step | Command |
|------|---------|
| Start | `git checkout akualabsux` |
| Code | Edit files in `dashboard/src/` |
| Test | `npm run dev` → check localhost:3000 |
| Check | `npm run lint && npx tsc --noEmit` |
| Commit | `git commit -m "feat: description"` |
| Push | `git push akualabs akualabsux:dev` |

---

## File Locations

```
/Users/akualabs/Documents/xmetav1/XmetaV/
├── dashboard/              ← Your frontend code
│   ├── src/
│   │   ├── app/           ← Pages
│   │   ├── components/    ← React components
│   │   ├── hooks/         ← Custom hooks
│   │   └── lib/           ← Utilities
│   └── package.json
├── bridge/                ← Agent infrastructure (keep separate)
├── x402-server/          ← Payment gateway (keep separate)
└── .git/                  ← Your local git
```

---

## Need to Reset?

If you mess up and want to start fresh from akualabs/dev:

```bash
cd /Users/akualabs/Documents/xmetav1/XmetaV
git checkout dev
git branch -D akualabsux
git checkout -b akualabsux
git branch --set-upstream-to=akualabs/dev akualabsux
```

---

Ready to build! Make changes in `dashboard/src/` and push to akualabs.
