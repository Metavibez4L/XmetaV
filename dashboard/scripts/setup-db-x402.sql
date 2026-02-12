-- ============================================================
-- x402 Payment Tracking
-- Logs all x402 autonomous payments made by agents
-- ============================================================

-- Payment transaction log
create table if not exists x402_payments (
  id uuid primary key default gen_random_uuid(),

  -- Link to the command/session that triggered the payment (nullable)
  command_id uuid references agent_commands(id) on delete set null,
  session_id uuid references intent_sessions(id) on delete set null,

  -- Payment details
  agent_id text not null default 'main',
  endpoint text not null,
  amount text not null,
  currency text not null default 'USDC',
  network text not null default 'eip155:84532',

  -- Settlement
  tx_hash text,
  payer_address text,
  payee_address text,

  -- Status: pending -> completed | failed
  status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups by status and agent
create index if not exists idx_x402_payments_status on x402_payments(status);
create index if not exists idx_x402_payments_agent on x402_payments(agent_id);
create index if not exists idx_x402_payments_created on x402_payments(created_at desc);

-- Enable RLS
alter table x402_payments enable row level security;

-- Policy: authenticated users can read all payments
create policy "Users can view payments"
  on x402_payments for select
  to authenticated
  using (true);

-- Policy: service role can insert/update (bridge daemon)
create policy "Service role can manage payments"
  on x402_payments for all
  to service_role
  using (true)
  with check (true);

-- Budget tracking view: total spend per agent per day
create or replace view x402_daily_spend as
select
  agent_id,
  date_trunc('day', created_at) as day,
  count(*) as payment_count,
  sum(amount::numeric) as total_amount,
  currency
from x402_payments
where status = 'completed'
group by agent_id, date_trunc('day', created_at), currency
order by day desc;
