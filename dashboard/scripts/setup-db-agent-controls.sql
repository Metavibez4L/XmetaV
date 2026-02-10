-- ============================================================
-- XmetaV Control Plane -- Agent enable/disable controls
-- ============================================================
-- Run this SQL in Supabase SQL Editor OR via management API.
-- ============================================================

create table if not exists agent_controls (
  agent_id text primary key,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create trigger trg_agent_controls_updated_at
  before update on agent_controls
  for each row execute function update_updated_at();

alter table agent_controls enable row level security;

create policy "Authenticated users can read agent controls"
  on agent_controls for select to authenticated using (true);

create policy "Authenticated users can upsert agent controls"
  on agent_controls for insert to authenticated with check (true);

create policy "Authenticated users can update agent controls"
  on agent_controls for update to authenticated using (true) with check (true);

-- Realtime (optional but used by Fleet UI)
alter publication supabase_realtime add table agent_controls;

