-- ============================================================
-- Agent Memory -- Persistent memory per agent
-- Run in Supabase SQL Editor after setup-db.sql
-- ============================================================

-- agent_memory: key-value memory entries per agent
-- Each agent accumulates memory entries that persist across spawns.
-- The bridge reads recent entries and injects them into dispatch context.
create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  kind text not null default 'observation'
    check (kind in ('observation', 'outcome', 'fact', 'error', 'goal', 'note')),
  content text not null,
  source text not null default 'bridge',
  ttl_hours integer,                    -- optional: auto-expire after N hours (null = permanent)
  created_at timestamptz not null default now()
);

-- Index for fast per-agent lookups ordered by recency
create index if not exists idx_agent_memory_agent_created
  on agent_memory (agent_id, created_at desc);

-- Index for kind filtering
create index if not exists idx_agent_memory_kind
  on agent_memory (kind);

-- RLS
alter table agent_memory enable row level security;

create policy "Authenticated users can read agent memory"
  on agent_memory for select to authenticated using (true);

create policy "Authenticated users can insert agent memory"
  on agent_memory for insert to authenticated with check (true);

create policy "Service role manages agent memory"
  on agent_memory for all to service_role
  using (true) with check (true);

-- Realtime (optional — useful for dashboard memory viewer)
alter publication supabase_realtime add table agent_memory;

-- ============================================================
-- Shared memory: cross-agent facts visible to all agents
-- ============================================================
create or replace view shared_memory as
select * from agent_memory
where agent_id = '_shared'
order by created_at desc;
