# Contributing Guide: XmetaV

## Quick Start for Web3Dev (Frontend Focus)

### Repository Structure

```
XmetaV/
├── dashboard/              # Next.js frontend (YOUR FOCUS)
│   ├── src/app/           # App router pages
│   ├── src/components/    # React components
│   ├── src/hooks/         # Custom hooks
│   ├── src/lib/           # Utilities
│   └── public/            # Static assets
├── bridge/                # Agent bridge (Node.js)
├── x402-server/          # Payment gateway (Node.js)
└── docs/                 # Documentation
```

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | React framework |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Supabase | 2.x | Database/Auth |
| shadcn/ui | 3.x | UI components |

### Setup for Frontend Development

```bash
# Clone the repo
git clone https://github.com/Metavibez4L/akualabs.git
cd akualabs

# Install dependencies
cd dashboard
npm install

# Run dev server
npm run dev
# Open http://localhost:3000
```

### Frontend Development Guidelines

#### 1. Component Structure
```typescript
// src/components/MyComponent.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  const [count, setCount] = useState(0);

  return (
    <div className="cyber-card rounded-lg p-5">
      <h3 className="text-xs font-mono uppercase" style={{ color: '#00f0ff' }}>
        {title}
      </h3>
      <Button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </Button>
    </div>
  );
}
```

#### 2. Styling Conventions
- Use Tailwind CSS classes
- Cyber theme colors:
  - Primary: `#00f0ff` (cyan)
  - Success: `#39ff14` (green)
  - Danger: `#ff2d5e` (red)
  - Muted: `#4a6a8a` (blue-gray)
- Card class: `cyber-card`

#### 3. Data Fetching
```typescript
// Use Supabase client
import { createClient } from "@/lib/supabase-browser";

const supabase = createClient();

// Query example
const { data } = await supabase
  .from("agent_sessions")
  .select("*")
  .eq("agent_id", "web3dev");
```

#### 4. Adding New Pages
```typescript
// src/app/(dashboard)/my-page/page.tsx
export default function MyPage() {
  return <div>My Page Content</div>;
}
```

### Branch Strategy

```
main/master       # Production
  ↓
dev              # Integration
  ↓
feature/xyz      # Your feature branches
```

#### For Web3Dev Frontend Work:

```bash
# Create feature branch
git checkout -b feature/web3dev/frontend-component-name

# Make changes
git add .
git commit -m "feat: add component description"

# Push to akualabs remote
git push akualabs feature/web3dev/frontend-component-name

# Create PR on GitHub
```

### Environment Variables

Create `dashboard/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**Never commit:**
- Service role keys
- Private keys
- API secrets

### Testing

```bash
# Run linting
npm run lint

# Type check
npx tsc --noEmit

# Build test
npm run build
```

### Code Review Checklist

- [ ] Components are typed with TypeScript
- [ ] Uses cyber theme styling
- [ ] No console.log in production code
- [ ] Responsive design
- [ ] Accessibility (ARIA labels where needed)

### Key Files for Frontend Work

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/page.tsx` | Main dashboard |
| `src/components/SystemHealth.tsx` | System status card |
| `src/components/BridgeControls.tsx` | Bridge controls |
| `src/components/CommandHistory.tsx` | Command history |
| `src/hooks/useBridgeStatus.ts` | Bridge status hook |
| `src/lib/types.ts` | TypeScript types |
| `src/lib/supabase-browser.ts` | Supabase client |

### Design System

#### Colors
```css
--cyan: #00f0ff;
--green: #39ff14;
--red: #ff2d5e;
--blue-gray: #4a6a8a;
--bg-dark: #0a0f14;
```

#### Typography
- Font: Geist Mono (monospace)
- Sizes: text-xs (labels), text-sm (body), text-xl (headers)

#### Components
- Cards: `cyber-card rounded-lg p-5`
- Buttons: Use shadcn Button with custom styling
- Badges: Custom cyber-badge class

### API Integration

Frontend talks to:
1. **Supabase** - Realtime data, auth
2. **Bridge API** - Agent commands (port 3001)
3. **x402 API** - Payments (port 4021)

### Getting Help

- Check `docs/` for architecture docs
- Look at existing components for patterns
- Ask in PR comments

### Commit Message Format

```
feat: add new component
fix: resolve styling issue
docs: update README
refactor: simplify hook logic
test: add component tests
```

---

## Web3Dev Specific Tasks

### Priority Areas for Frontend

1. **Agent Dashboard Cards**
   - Create cards for new agents (web3dev, alchemist, etc.)
   - Show agent status, last activity

2. **x402 Payment UI**
   - Payment history table
   - Revenue analytics charts
   - Endpoint usage stats

3. **Command Interface**
   - Agent command builder
   - Command templates for web3 tasks
   - Output streaming display

4. **Mobile Responsiveness**
   - Mobile nav
   - Responsive grid layouts

5. **Theme Polish**
   - Dark mode consistency
   - Animation refinements
   - Loading states

### Web3Dev Component Ideas

```typescript
// Example: Web3Dev agent card
interface AgentCardProps {
  agentId: string;
  role: string;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
}

export function AgentCard({ agentId, role, skills, status }: AgentCardProps) {
  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-mono text-cyan-400">{agentId}</h3>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {skills.map(skill => (
          <span key={skill} className="cyber-badge text-[9px]">
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

Ready to start contributing? Create a feature branch and open a PR!
