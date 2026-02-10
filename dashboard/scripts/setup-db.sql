-- ============================================================
-- XmetaV Control Plane -- Database Setup
-- ============================================================
-- Run this SQL in the Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/sql/new
-- ============================================================

-- agent_commands: queued commands from the dashboard
create table if not exists agent_commands (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null default 'main',
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commands_status on agent_commands(status);
create index if not exists idx_commands_agent on agent_commands(agent_id);
create index if not exists idx_commands_created on agent_commands(created_at desc);

-- agent_responses: streamed output chunks from the bridge
create table if not exists agent_responses (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references agent_commands(id) on delete cascade,
  content text not null default '',
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_responses_command on agent_responses(command_id);
create index if not exists idx_responses_created on agent_responses(created_at);

-- agent_sessions: bridge daemon + agent heartbeats
create table if not exists agent_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null unique,
  status text not null default 'online'
    check (status in ('online', 'idle', 'busy', 'offline')),
  hostname text,
  started_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now()
);

create index if not exists idx_sessions_agent on agent_sessions(agent_id);

-- Enable RLS
alter table agent_commands enable row level security;
alter table agent_responses enable row level security;
alter table agent_sessions enable row level security;

-- RLS Policies
create policy "Authenticated users can read commands"
  on agent_commands for select to authenticated using (true);
create policy "Authenticated users can insert commands"
  on agent_commands for insert to authenticated with check (true);
create policy "Authenticated users can read responses"
  on agent_responses for select to authenticated using (true);
create policy "Authenticated users can read sessions"
  on agent_sessions for select to authenticated using (true);
create policy "Anon can read sessions"
  on agent_sessions for select to anon using (true);

-- Auto-update trigger for updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_commands_updated_at
  before update on agent_commands
  for each row execute function update_updated_at();

-- Enable Realtime
alter publication supabase_realtime add table agent_commands;
alter publication supabase_realtime add table agent_responses;
alter publication supabase_realtime add table agent_sessions;
