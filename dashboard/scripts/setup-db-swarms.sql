-- ============================================================
-- XmetaV Control Plane -- Swarm tables
-- ============================================================

-- swarm_runs: top-level swarm execution records
create table if not exists swarm_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Swarm',
  mode text not null default 'parallel'
    check (mode in ('parallel', 'pipeline', 'collaborative')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  manifest jsonb not null default '{}'::jsonb,
  synthesis text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_swarm_runs_status on swarm_runs(status);
create index if not exists idx_swarm_runs_created on swarm_runs(created_at desc);

create trigger trg_swarm_runs_updated_at
  before update on swarm_runs
  for each row execute function update_updated_at();

-- swarm_tasks: individual tasks within a swarm run
create table if not exists swarm_tasks (
  id uuid primary key default gen_random_uuid(),
  swarm_id uuid not null references swarm_runs(id) on delete cascade,
  task_id text not null default 'task',
  agent_id text not null,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  output text not null default '',
  exit_code integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_swarm_tasks_swarm on swarm_tasks(swarm_id);
create index if not exists idx_swarm_tasks_status on swarm_tasks(status);

-- RLS
alter table swarm_runs enable row level security;
alter table swarm_tasks enable row level security;

create policy "Authenticated users can read swarm runs"
  on swarm_runs for select to authenticated using (true);
create policy "Authenticated users can insert swarm runs"
  on swarm_runs for insert to authenticated with check (true);
create policy "Authenticated users can update swarm runs"
  on swarm_runs for update to authenticated using (true) with check (true);
create policy "Authenticated users can read swarm tasks"
  on swarm_tasks for select to authenticated using (true);
create policy "Authenticated users can insert swarm tasks"
  on swarm_tasks for insert to authenticated with check (true);
create policy "Authenticated users can update swarm tasks"
  on swarm_tasks for update to authenticated using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table swarm_runs;
alter publication supabase_realtime add table swarm_tasks;
