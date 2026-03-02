# Web3Dev Frontend Contribution Setup

## Quick Start for Frontend Development

### 1. Fork & Clone

```bash
# Fork https://github.com/Metavibez4L/akualabs on GitHub first

# Clone your fork
git clone https://github.com/YOUR_USERNAME/akualabs.git
cd akualabs

# Add upstream remotes
git remote add upstream https://github.com/Metavibez4L/akualabs.git
git remote add xmetav https://github.com/Metavibez4L/XmetaV.git
```

### 2. Branch Strategy

```
akualabs (your fork)
  ↓
feature/web3dev/component-name  # Your feature branches
  ↓
dev                            # Integration branch (XmetaV)
  ↓  
main                           # Production
```

### 3. Frontend Setup

```bash
cd dashboard

# Install dependencies
npm install

# Create env file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start dev server
npm run dev

# Open http://localhost:3000
```

### 4. Making Changes

```bash
# Create feature branch
git checkout -b feature/web3dev/agent-dashboard-card

# Make your changes
git add .
git commit -m "feat: add agent status card component"

# Push to your fork
git push origin feature/web3dev/agent-dashboard-card

# Open PR on GitHub to akualabs:dev
```

### 5. PR Workflow

1. Push to your fork (`origin`)
2. Open PR to `Metavibez4L/akualabs:dev`
3. CI runs automatically (lint, type-check, build)
4. Review requested
5. Merge to `dev`
6. Later syncs to `XmetaV` main repo

### 6. Keeping in Sync

```bash
# Fetch upstream changes
git fetch upstream
git fetch xmetav

# Rebase your branch
git checkout feature/your-feature
git rebase upstream/dev

# Update your fork
git push origin feature/your-feature --force-with-lease
```

---

## Frontend Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4 + custom cyber theme
- **UI Library:** shadcn/ui + Radix
- **State:** React hooks + Supabase realtime
- **Icons:** Lucide React

### Key Directories
```
dashboard/src/
├── app/                    # Routes
│   ├── (dashboard)/       # Main dashboard
│   ├── api/               # API routes
│   └── auth/              # Auth pages
├── components/            # React components
│   ├── ui/               # shadcn components
│   └── *.tsx             # Custom components
├── hooks/                 # Custom hooks
├── lib/                   # Utilities
│   ├── supabase-*.ts     # Database clients
│   └── types.ts          # TypeScript types
└── styles/               # Global styles
```

### Design System

#### Colors
```css
--cyan: #00f0ff;      /* Primary accent */
--green: #39ff14;     /* Success */
--red: #ff2d5e;       /* Danger */
--blue-gray: #4a6a8a; /* Muted text */
--bg-dark: #0a0f14;   /* Background */
```

#### Typography
- Font: Geist Mono (monospace)
- Headers: `text-xl font-bold font-mono`
- Body: `text-sm font-mono`
- Labels: `text-xs uppercase tracking-wider`

#### Components
```tsx
// Card
cyber-card rounded-lg p-5

// Badge
cyber-badge text-[9px] px-2 py-0.5 rounded

// Button (shadcn with custom styling)
<Button variant="outline" className="cyber-button">
```

---

## Priority Tasks for Web3Dev

### High Priority
1. **Agent Fleet Cards**
   - Create cards for each agent (web3dev, alchemist, midas, etc.)
   - Show status, last activity, skills
   - Quick action buttons

2. **x402 Payment Dashboard**
   - Payment history table
   - Revenue analytics (charts)
   - Endpoint usage stats

3. **Command Interface Improvements**
   - Agent command builder
   - Command templates
   - Better output streaming display

### Medium Priority
4. **Mobile Responsiveness**
   - Mobile navigation
   - Responsive grid layouts
   - Touch-friendly controls

5. **Theme Polish**
   - Consistent dark mode
   - Loading states
   - Animation refinements

6. **Documentation**
   - Component storybook
   - Usage examples
   - Design system docs

---

## Development Workflow

### Before Starting
```bash
# Check you're on latest dev
git checkout dev
git pull upstream dev

# Create feature branch
git checkout -b feature/web3dev/your-feature
```

### During Development
```bash
# Run checks
npm run lint          # ESLint
npx tsc --noEmit      # Type check
npm run build         # Production build test
```

### Before PR
- [ ] All checks pass
- [ ] No console errors
- [ ] Tested in dark mode
- [ ] Mobile responsive
- [ ] Component is typed

---

## API Endpoints

### Supabase (Realtime)
```typescript
// Agent sessions
supabase.from('agent_sessions').select('*')

// Command history  
supabase.from('agent_commands').select('*')

// Payment tracking
supabase.from('x402_payments').select('*')
```

### Bridge API
```typescript
// Bridge status
fetch('/api/bridge/status')

// Start/stop bridge
fetch('/api/bridge/start', { method: 'POST' })
fetch('/api/bridge/stop', { method: 'POST' })
```

---

## Troubleshooting

### Port Conflicts
If port 3000 is in use:
```bash
npm run dev -- --port 3001
```

### Type Errors
```bash
# Regenerate types
npx supabase gen types typescript --project-id your-project-id > src/lib/database.types.ts
```

### Build Failures
```bash
# Clear cache
rm -rf .next
rm -rf node_modules
npm install
npm run build
```

---

## Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)

---

## Questions?

- Open an issue with `frontend` label
- Tag @Metavibez4L in PRs
- Check `CONTRIBUTING.md` for detailed guidelines

Happy coding! 🚀
