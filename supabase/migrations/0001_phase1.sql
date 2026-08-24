create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  options_budget numeric(14, 2) not null check (options_budget > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trader_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trader_source_id uuid not null references public.trader_sources(id) on delete restrict,
  raw_text text not null check (length(trim(raw_text)) > 0),
  corrected_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(corrected_fields) = 'object'),
  symbol text,
  option_side text check (option_side in ('call', 'put')),
  strike numeric(14, 4) check (strike is null or strike > 0),
  expiration date,
  alerted_premium numeric(14, 4) check (alerted_premium is null or alerted_premium >= 0),
  submitted_at timestamptz not null,
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  parse_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_issues) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null references public.trade_alerts(id) on delete cascade,
  snapshot_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_payload) = 'object'),
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entry_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null references public.trade_alerts(id) on delete cascade,
  market_snapshot_id uuid references public.market_snapshots(id) on delete set null,
  verdict text not null check (verdict in ('Consider', 'Wait', 'Pass')),
  evidence_score numeric(8, 3) not null,
  analysis_factors jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis_factors) = 'object'),
  summary text,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null references public.trade_alerts(id) on delete cascade,
  entry_analysis_id uuid not null references public.entry_analyses(id) on delete restrict,
  decision text not null check (decision in ('purchased', 'skipped')),
  quantity smallint check (quantity between 1 and 3),
  entry_premium numeric(14, 4) check (entry_premium is null or entry_premium >= 0),
  decision_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(decision_payload) = 'object'),
  decided_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (decision = 'purchased' and quantity is not null and entry_premium is not null)
    or (decision = 'skipped' and quantity is null and entry_premium is null)
  )
);

create table public.watch_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null references public.trade_alerts(id) on delete cascade,
  source_analysis_id uuid not null references public.entry_analyses(id) on delete restrict,
  latest_analysis_id uuid not null references public.entry_analyses(id) on delete restrict,
  unresolved_confirmation_conditions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(unresolved_confirmation_conditions) = 'array'),
  status text not null default 'watching' check (status in ('watching', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles (user_id);
create index trader_sources_user_id_idx on public.trader_sources (user_id);
create index trade_alerts_user_id_idx on public.trade_alerts (user_id);
create index trade_alerts_trader_source_id_idx on public.trade_alerts (trader_source_id);
create index market_snapshots_user_id_idx on public.market_snapshots (user_id);
create index market_snapshots_trade_alert_id_idx on public.market_snapshots (trade_alert_id);
create index entry_analyses_user_id_idx on public.entry_analyses (user_id);
create index entry_analyses_trade_alert_id_idx on public.entry_analyses (trade_alert_id);
create index entry_analyses_market_snapshot_id_idx on public.entry_analyses (market_snapshot_id);
create index trade_decisions_user_id_idx on public.trade_decisions (user_id);
create index trade_decisions_trade_alert_id_idx on public.trade_decisions (trade_alert_id);
create index trade_decisions_entry_analysis_id_idx on public.trade_decisions (entry_analysis_id);
create index watch_candidates_user_id_idx on public.watch_candidates (user_id);
create index watch_candidates_trade_alert_id_idx on public.watch_candidates (trade_alert_id);
create index watch_candidates_source_analysis_id_idx on public.watch_candidates (source_analysis_id);
create index watch_candidates_latest_analysis_id_idx on public.watch_candidates (latest_analysis_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trader_sources_set_updated_at
before update on public.trader_sources
for each row execute function public.set_updated_at();

create trigger trade_alerts_set_updated_at
before update on public.trade_alerts
for each row execute function public.set_updated_at();

create trigger market_snapshots_set_updated_at
before update on public.market_snapshots
for each row execute function public.set_updated_at();

create trigger entry_analyses_set_updated_at
before update on public.entry_analyses
for each row execute function public.set_updated_at();

create trigger trade_decisions_set_updated_at
before update on public.trade_decisions
for each row execute function public.set_updated_at();

create trigger watch_candidates_set_updated_at
before update on public.watch_candidates
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.trader_sources enable row level security;
alter table public.trade_alerts enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.entry_analyses enable row level security;
alter table public.trade_decisions enable row level security;
alter table public.watch_candidates enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy profiles_delete_own on public.profiles
for delete to authenticated using ((select auth.uid()) = user_id);

create policy trader_sources_select_own on public.trader_sources
for select to authenticated using ((select auth.uid()) = user_id);
create policy trader_sources_insert_own on public.trader_sources
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trader_sources_update_own on public.trader_sources
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy trader_sources_delete_own on public.trader_sources
for delete to authenticated using ((select auth.uid()) = user_id);

create policy trade_alerts_select_own on public.trade_alerts
for select to authenticated using ((select auth.uid()) = user_id);
create policy trade_alerts_insert_own on public.trade_alerts
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trade_alerts_update_own on public.trade_alerts
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy trade_alerts_delete_own on public.trade_alerts
for delete to authenticated using ((select auth.uid()) = user_id);

create policy market_snapshots_select_own on public.market_snapshots
for select to authenticated using ((select auth.uid()) = user_id);
create policy market_snapshots_insert_own on public.market_snapshots
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy market_snapshots_update_own on public.market_snapshots
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy market_snapshots_delete_own on public.market_snapshots
for delete to authenticated using ((select auth.uid()) = user_id);

create policy entry_analyses_select_own on public.entry_analyses
for select to authenticated using ((select auth.uid()) = user_id);
create policy entry_analyses_insert_own on public.entry_analyses
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy entry_analyses_update_own on public.entry_analyses
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy entry_analyses_delete_own on public.entry_analyses
for delete to authenticated using ((select auth.uid()) = user_id);

create policy trade_decisions_select_own on public.trade_decisions
for select to authenticated using ((select auth.uid()) = user_id);
create policy trade_decisions_insert_own on public.trade_decisions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trade_decisions_update_own on public.trade_decisions
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy trade_decisions_delete_own on public.trade_decisions
for delete to authenticated using ((select auth.uid()) = user_id);

create policy watch_candidates_select_own on public.watch_candidates
for select to authenticated using ((select auth.uid()) = user_id);
create policy watch_candidates_insert_own on public.watch_candidates
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy watch_candidates_update_own on public.watch_candidates
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy watch_candidates_delete_own on public.watch_candidates
for delete to authenticated using ((select auth.uid()) = user_id);
