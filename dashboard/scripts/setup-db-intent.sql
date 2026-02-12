-- ============================================================
-- Intent Sessions table -- tracks Cursor intent layer sessions
-- Run in Supabase SQL Editor after setup-db.sql and setup-db-swarms.sql
-- ============================================================

-- Intent sessions table
create table if not exists intent_sessions (
  id uuid primary key default gen_random_uuid(),
  cursor_agent_id text not null default '',
  goal text not null,
  repository text not null default 'https://github.com/Metavibez4L/XmetaV',
  model text,
  status text not null default 'THINKING'
    check (status in ('THINKING', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  commands jsonb not null default '[]'::jsonb,
  executed_command_ids jsonb,
  conversation jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 2,
  timeout_seconds integer not null default 120,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for listing recent sessions
create index if not exists idx_intent_sessions_created
  on intent_sessions (created_at desc);

-- Index for status filtering
create index if not exists idx_intent_sessions_status
  on intent_sessions (status);

-- Auto-update updated_at
create or replace function update_intent_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_intent_sessions_updated_at on intent_sessions;
create trigger trg_intent_sessions_updated_at
  before update on intent_sessions
  for each row execute function update_intent_sessions_updated_at();

-- RLS
alter table intent_sessions enable row level security;

create policy "Authenticated users can read intent sessions"
  on intent_sessions for select to authenticated using (true);

create policy "Authenticated users can create intent sessions"
  on intent_sessions for insert to authenticated with check (true);

create policy "Authenticated users can update intent sessions"
  on intent_sessions for update to authenticated using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table intent_sessions;
