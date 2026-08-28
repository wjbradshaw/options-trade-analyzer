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
  updated_at timestamptz not null default now(),
  constraint trader_sources_owner_key unique (id, user_id)
);

create table public.trade_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trader_source_id uuid not null,
  raw_text text not null check (length(trim(raw_text)) > 0),
  corrected_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(corrected_fields) = 'object'),
  symbol text,
  option_side text check (option_side in ('call', 'put')),
  strike numeric(14, 4) check (strike is null or strike > 0),
  expiration date,
  alerted_premium numeric(14, 4) check (alerted_premium is null or alerted_premium >= 0),
  contract_confirmed boolean not null default false,
  submitted_at timestamptz not null,
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  parse_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_issues) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_alerts_owner_key unique (id, user_id),
  constraint trade_alerts_confirmed_owner_key unique (id, user_id, contract_confirmed),
  constraint trade_alerts_trader_source_owner_fkey
    foreign key (trader_source_id, user_id)
    references public.trader_sources (id, user_id) on delete restrict,
  check (
    not contract_confirmed
    or (
      symbol is not null
      and option_side is not null
      and strike is not null
      and strike > 0
      and expiration is not null
    )
  )
);

create table public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null,
  snapshot_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_payload) = 'object'),
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_snapshots_owner_alert_key unique (id, user_id, trade_alert_id),
  constraint market_snapshots_alert_owner_fkey
    foreign key (trade_alert_id, user_id)
    references public.trade_alerts (id, user_id) on delete cascade
);

create table public.entry_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null,
  market_snapshot_id uuid,
  alert_contract_confirmed boolean not null default true check (alert_contract_confirmed),
  verdict text not null check (verdict in ('Consider', 'Wait', 'Pass')),
  evidence_score numeric(8, 3) not null,
  analysis_factors jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis_factors) = 'object'),
  summary text,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_analyses_owner_alert_key unique (id, user_id, trade_alert_id),
  constraint entry_analyses_owner_alert_verdict_key
    unique (id, user_id, trade_alert_id, verdict),
  constraint entry_analyses_confirmed_alert_owner_fkey
    foreign key (trade_alert_id, user_id, alert_contract_confirmed)
    references public.trade_alerts (id, user_id, contract_confirmed) on delete cascade,
  constraint entry_analyses_snapshot_owner_alert_fkey
    foreign key (market_snapshot_id, user_id, trade_alert_id)
    references public.market_snapshots (id, user_id, trade_alert_id) on delete restrict
);

create table public.trade_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null,
  entry_analysis_id uuid not null,
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
  ),
  constraint trade_decisions_alert_owner_fkey
    foreign key (trade_alert_id, user_id)
    references public.trade_alerts (id, user_id) on delete cascade,
  constraint trade_decisions_analysis_owner_alert_fkey
    foreign key (entry_analysis_id, user_id, trade_alert_id)
    references public.entry_analyses (id, user_id, trade_alert_id) on delete restrict
);

create table public.watch_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null,
  source_analysis_id uuid not null,
  source_analysis_verdict text not null default 'Wait'
    check (source_analysis_verdict = 'Wait'),
  latest_analysis_id uuid not null,
  unresolved_confirmation_conditions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(unresolved_confirmation_conditions) = 'array'),
  status text not null default 'watching' check (status in ('watching', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watch_candidates_alert_owner_fkey
    foreign key (trade_alert_id, user_id)
    references public.trade_alerts (id, user_id) on delete cascade,
  constraint watch_candidates_source_analysis_owner_alert_fkey
    foreign key (source_analysis_id, user_id, trade_alert_id, source_analysis_verdict)
    references public.entry_analyses (id, user_id, trade_alert_id, verdict) on delete restrict,
  constraint watch_candidates_latest_analysis_owner_alert_fkey
    foreign key (latest_analysis_id, user_id, trade_alert_id)
    references public.entry_analyses (id, user_id, trade_alert_id) on delete restrict
);

create index profiles_user_id_idx on public.profiles (user_id);
create index trader_sources_user_id_idx on public.trader_sources (user_id);
create index trade_alerts_user_id_idx on public.trade_alerts (user_id);
create index trade_alerts_trader_source_owner_idx
  on public.trade_alerts (trader_source_id, user_id);
create index market_snapshots_user_id_idx on public.market_snapshots (user_id);
create index market_snapshots_alert_owner_idx
  on public.market_snapshots (trade_alert_id, user_id);
create index entry_analyses_user_id_idx on public.entry_analyses (user_id);
create index entry_analyses_confirmed_alert_idx
  on public.entry_analyses (trade_alert_id, user_id, alert_contract_confirmed);
create index entry_analyses_snapshot_owner_alert_idx
  on public.entry_analyses (market_snapshot_id, user_id, trade_alert_id);
create index trade_decisions_user_id_idx on public.trade_decisions (user_id);
create index trade_decisions_alert_owner_idx
  on public.trade_decisions (trade_alert_id, user_id);
create index trade_decisions_analysis_owner_alert_idx
  on public.trade_decisions (entry_analysis_id, user_id, trade_alert_id);
create index watch_candidates_user_id_idx on public.watch_candidates (user_id);
create index watch_candidates_alert_owner_idx
  on public.watch_candidates (trade_alert_id, user_id);
create index watch_candidates_source_analysis_owner_alert_idx
  on public.watch_candidates (
    source_analysis_id,
    user_id,
    trade_alert_id,
    source_analysis_verdict
  );
create index watch_candidates_latest_analysis_owner_alert_idx
  on public.watch_candidates (latest_analysis_id, user_id, trade_alert_id);

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

revoke select, insert, update, delete, truncate, references, trigger
on table
  public.profiles,
  public.trader_sources,
  public.trade_alerts,
  public.market_snapshots,
  public.entry_analyses,
  public.trade_decisions,
  public.watch_candidates
from anon;

revoke truncate, references, trigger
on table
  public.profiles,
  public.trader_sources,
  public.trade_alerts,
  public.market_snapshots,
  public.entry_analyses,
  public.trade_decisions,
  public.watch_candidates
from authenticated;

grant select, insert, update, delete
on table
  public.profiles,
  public.trader_sources,
  public.trade_alerts,
  public.market_snapshots,
  public.entry_analyses,
  public.trade_decisions,
  public.watch_candidates
to authenticated;
create or replace function public.commit_entry_analysis_workflow(
  p_user_id uuid,
  p_trader_source_id uuid,
  p_raw_text text,
  p_corrected_fields jsonb,
  p_symbol text,
  p_option_side text,
  p_strike numeric,
  p_expiration date,
  p_alerted_premium numeric,
  p_submitted_at timestamptz,
  p_tags jsonb,
  p_parse_issues jsonb,
  p_snapshot_payload jsonb,
  p_captured_at timestamptz,
  p_verdict text,
  p_evidence_score numeric,
  p_analysis_payload jsonb,
  p_summary text,
  p_analyzed_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_alert_id uuid;
  v_snapshot_id uuid;
  v_analysis_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this analysis workflow'
      using errcode = '42501';
  end if;

  insert into public.trade_alerts (
    user_id,
    trader_source_id,
    raw_text,
    corrected_fields,
    symbol,
    option_side,
    strike,
    expiration,
    alerted_premium,
    contract_confirmed,
    submitted_at,
    tags,
    parse_issues
  ) values (
    p_user_id,
    p_trader_source_id,
    p_raw_text,
    p_corrected_fields,
    p_symbol,
    p_option_side,
    p_strike,
    p_expiration,
    p_alerted_premium,
    true,
    p_submitted_at,
    p_tags,
    p_parse_issues
  )
  returning id into v_alert_id;

  insert into public.market_snapshots (
    user_id,
    trade_alert_id,
    snapshot_payload,
    captured_at
  ) values (
    p_user_id,
    v_alert_id,
    p_snapshot_payload,
    p_captured_at
  )
  returning id into v_snapshot_id;

  insert into public.entry_analyses (
    user_id,
    trade_alert_id,
    market_snapshot_id,
    alert_contract_confirmed,
    verdict,
    evidence_score,
    analysis_factors,
    summary,
    analyzed_at
  ) values (
    p_user_id,
    v_alert_id,
    v_snapshot_id,
    true,
    p_verdict,
    p_evidence_score,
    p_analysis_payload,
    p_summary,
    p_analyzed_at
  )
  returning id into v_analysis_id;

  return jsonb_build_object(
    'alert_id', v_alert_id,
    'snapshot_id', v_snapshot_id,
    'analysis_id', v_analysis_id
  );
end;
$$;

revoke all on function public.commit_entry_analysis_workflow(
  uuid, uuid, text, jsonb, text, text, numeric, date, numeric, timestamptz,
  jsonb, jsonb, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) from public, anon;

grant execute on function public.commit_entry_analysis_workflow(
  uuid, uuid, text, jsonb, text, text, numeric, date, numeric, timestamptz,
  jsonb, jsonb, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) to authenticated;

create or replace function public.commit_wait_candidate_refresh(
  p_user_id uuid,
  p_candidate_id uuid,
  p_trade_alert_id uuid,
  p_snapshot_payload jsonb,
  p_captured_at timestamptz,
  p_verdict text,
  p_evidence_score numeric,
  p_analysis_payload jsonb,
  p_summary text,
  p_analyzed_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_analysis_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this candidate refresh'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.watch_candidates
    where id = p_candidate_id
      and user_id = p_user_id
      and trade_alert_id = p_trade_alert_id
      and status = 'watching'
  ) then
    raise exception 'Watching candidate was not found'
      using errcode = 'P0002';
  end if;

  insert into public.market_snapshots (
    user_id,
    trade_alert_id,
    snapshot_payload,
    captured_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    p_snapshot_payload,
    p_captured_at
  )
  returning id into v_snapshot_id;

  insert into public.entry_analyses (
    user_id,
    trade_alert_id,
    market_snapshot_id,
    alert_contract_confirmed,
    verdict,
    evidence_score,
    analysis_factors,
    summary,
    analyzed_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    v_snapshot_id,
    true,
    p_verdict,
    p_evidence_score,
    p_analysis_payload,
    p_summary,
    p_analyzed_at
  )
  returning id into v_analysis_id;

  update public.watch_candidates
  set latest_analysis_id = v_analysis_id
  where id = p_candidate_id
    and user_id = p_user_id
    and trade_alert_id = p_trade_alert_id;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'analysis_id', v_analysis_id
  );
end;
$$;

revoke all on function public.commit_wait_candidate_refresh(
  uuid, uuid, uuid, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) from public, anon;

grant execute on function public.commit_wait_candidate_refresh(
  uuid, uuid, uuid, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) to authenticated;
create or replace function public.commit_watch_candidate_decision(
  p_user_id uuid,
  p_candidate_id uuid,
  p_trade_alert_id uuid,
  p_entry_analysis_id uuid,
  p_decision text,
  p_quantity smallint,
  p_entry_premium numeric,
  p_decision_payload jsonb,
  p_decided_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_candidate public.watch_candidates%rowtype;
  v_decision public.trade_decisions%rowtype;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this candidate decision'
      using errcode = '42501';
  end if;

  select *
  into v_candidate
  from public.watch_candidates
  where id = p_candidate_id
    and user_id = p_user_id
    and trade_alert_id = p_trade_alert_id
    and latest_analysis_id = p_entry_analysis_id
    and status = 'watching'
  for update;

  if not found then
    raise exception 'Watching candidate with this latest analysis was not found'
      using errcode = 'P0002';
  end if;

  insert into public.trade_decisions (
    user_id,
    trade_alert_id,
    entry_analysis_id,
    decision,
    quantity,
    entry_premium,
    decision_payload,
    decided_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    p_entry_analysis_id,
    p_decision,
    p_quantity,
    p_entry_premium,
    p_decision_payload,
    p_decided_at
  )
  returning * into v_decision;

  update public.watch_candidates
  set status = 'resolved'
  where id = v_candidate.id
    and user_id = p_user_id;

  return to_jsonb(v_decision);
end;
$$;

revoke all on function public.commit_watch_candidate_decision(
  uuid, uuid, uuid, uuid, text, smallint, numeric, jsonb, timestamptz
) from public, anon;

grant execute on function public.commit_watch_candidate_decision(
  uuid, uuid, uuid, uuid, text, smallint, numeric, jsonb, timestamptz
) to authenticated;
create or replace function public.commit_wait_candidate_refresh(
  p_user_id uuid,
  p_candidate_id uuid,
  p_trade_alert_id uuid,
  p_snapshot_payload jsonb,
  p_captured_at timestamptz,
  p_verdict text,
  p_evidence_score numeric,
  p_analysis_payload jsonb,
  p_summary text,
  p_analyzed_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_candidate public.watch_candidates%rowtype;
  v_snapshot_id uuid;
  v_analysis_id uuid;
  v_updated_candidate_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this candidate refresh'
      using errcode = '42501';
  end if;

  select *
  into v_candidate
  from public.watch_candidates
  where id = p_candidate_id
    and user_id = p_user_id
    and trade_alert_id = p_trade_alert_id
    and status = 'watching'
  for update;

  if not found then
    raise exception 'Watching candidate was not found'
      using errcode = 'P0002';
  end if;

  insert into public.market_snapshots (
    user_id,
    trade_alert_id,
    snapshot_payload,
    captured_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    p_snapshot_payload,
    p_captured_at
  )
  returning id into v_snapshot_id;

  insert into public.entry_analyses (
    user_id,
    trade_alert_id,
    market_snapshot_id,
    alert_contract_confirmed,
    verdict,
    evidence_score,
    analysis_factors,
    summary,
    analyzed_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    v_snapshot_id,
    true,
    p_verdict,
    p_evidence_score,
    p_analysis_payload,
    p_summary,
    p_analyzed_at
  )
  returning id into v_analysis_id;

  update public.watch_candidates
  set latest_analysis_id = v_analysis_id
  where id = p_candidate_id
    and user_id = p_user_id
    and trade_alert_id = p_trade_alert_id
    and status = 'watching'
    and latest_analysis_id = v_candidate.latest_analysis_id
  returning id into v_updated_candidate_id;

  if v_updated_candidate_id is null then
    raise exception 'Watching candidate lost refresh eligibility'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'analysis_id', v_analysis_id
  );
end;
$$;

revoke all on function public.commit_wait_candidate_refresh(
  uuid, uuid, uuid, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) from public, anon;

grant execute on function public.commit_wait_candidate_refresh(
  uuid, uuid, uuid, jsonb, timestamptz, text, numeric, jsonb, text, timestamptz
) to authenticated;
-- Phase 2 Positions and Events Migration

create table if not exists public.user_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid not null references public.trade_alerts(id) on delete cascade,
  entry_analysis_id uuid not null references public.entry_analyses(id) on delete cascade,
  initial_quantity smallint not null check (initial_quantity between 1 and 3),
  remaining_quantity smallint not null check (remaining_quantity between 0 and initial_quantity),
  initial_entry_premium numeric not null check (initial_entry_premium > 0),
  status text not null check (status in ('open', 'closed')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_position_events (
  id uuid primary key default gen_random_uuid(),
  user_position_id uuid not null references public.user_positions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('purchase', 'trim', 'close', 'fill_correction', 'quantity_correction', 'note')),
  quantity_delta smallint check (quantity_delta is null or quantity_delta between -3 and 3),
  executed_premium numeric check (executed_premium is null or executed_premium > 0),
  notes text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.host_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_alert_id uuid references public.trade_alerts(id) on delete cascade,
  user_position_id uuid references public.user_positions(id) on delete set null,
  trader_source_id uuid references public.trader_sources(id) on delete set null,
  raw_text text not null,
  event_type text not null check (event_type in ('entered', 'added', 'trimmed', 'all_out', 'note')),
  claimed_entry_premium numeric check (claimed_entry_premium is null or claimed_entry_premium > 0),
  claimed_exit_premium numeric check (claimed_exit_premium is null or claimed_exit_premium > 0),
  claimed_percentage numeric,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.user_positions enable row level security;
alter table public.user_position_events enable row level security;
alter table public.host_events enable row level security;

-- Policies for user_positions
create policy "Users can select own positions" on public.user_positions
  for select using (auth.uid() = user_id);
create policy "Users can insert own positions" on public.user_positions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own positions" on public.user_positions
  for update using (auth.uid() = user_id);
create policy "Users can delete own positions" on public.user_positions
  for delete using (auth.uid() = user_id);

-- Policies for user_position_events
create policy "Users can select own position events" on public.user_position_events
  for select using (auth.uid() = user_id);
create policy "Users can insert own position events" on public.user_position_events
  for insert with check (auth.uid() = user_id);
create policy "Users can update own position events" on public.user_position_events
  for update using (auth.uid() = user_id);
create policy "Users can delete own position events" on public.user_position_events
  for delete using (auth.uid() = user_id);

-- Policies for host_events
create policy "Users can select own host events" on public.host_events
  for select using (auth.uid() = user_id);
create policy "Users can insert own host events" on public.host_events
  for insert with check (auth.uid() = user_id);
create policy "Users can update own host events" on public.host_events
  for update using (auth.uid() = user_id);
create policy "Users can delete own host events" on public.host_events
  for delete using (auth.uid() = user_id);

-- Grants
revoke all on public.user_positions from public, anon, authenticated;
grant select, insert, update, delete on public.user_positions to authenticated;

revoke all on public.user_position_events from public, anon, authenticated;
grant select, insert, update, delete on public.user_position_events to authenticated;

revoke all on public.host_events from public, anon, authenticated;
grant select, insert, update, delete on public.host_events to authenticated;

-- RPC 1: commit_user_purchase_and_open_position
create or replace function public.commit_user_purchase_and_open_position(
  p_user_id uuid,
  p_trade_alert_id uuid,
  p_entry_analysis_id uuid,
  p_quantity smallint,
  p_entry_premium numeric,
  p_details jsonb,
  p_decided_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_position_id uuid;
  v_event_id uuid;
  v_decision_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this position operation'
      using errcode = '42501';
  end if;

  insert into public.trade_decisions (
    user_id,
    trade_alert_id,
    entry_analysis_id,
    decision,
    quantity,
    entry_premium,
    decision_payload,
    decided_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    p_entry_analysis_id,
    'purchased',
    p_quantity,
    p_entry_premium,
    p_details,
    p_decided_at
  )
  returning id into v_decision_id;

  insert into public.user_positions (
    user_id,
    trade_alert_id,
    entry_analysis_id,
    initial_quantity,
    remaining_quantity,
    initial_entry_premium,
    status,
    opened_at
  ) values (
    p_user_id,
    p_trade_alert_id,
    p_entry_analysis_id,
    p_quantity,
    p_quantity,
    p_entry_premium,
    'open',
    p_decided_at
  )
  returning id into v_position_id;

  insert into public.user_position_events (
    user_position_id,
    user_id,
    event_type,
    quantity_delta,
    executed_premium,
    event_payload,
    created_at
  ) values (
    v_position_id,
    p_user_id,
    'purchase',
    p_quantity,
    p_entry_premium,
    p_details,
    p_decided_at
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'decision_id', v_decision_id,
    'position_id', v_position_id,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.commit_user_purchase_and_open_position(
  uuid, uuid, uuid, smallint, numeric, jsonb, timestamptz
) from public, anon;

grant execute on function public.commit_user_purchase_and_open_position(
  uuid, uuid, uuid, smallint, numeric, jsonb, timestamptz
) to authenticated;

-- RPC 2: commit_position_trim
create or replace function public.commit_position_trim(
  p_user_id uuid,
  p_position_id uuid,
  p_trim_quantity smallint,
  p_exit_premium numeric,
  p_notes text,
  p_trimmed_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_position public.user_positions%rowtype;
  v_new_remaining smallint;
  v_new_status text;
  v_closed_at timestamptz;
  v_event_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this position trim'
      using errcode = '42501';
  end if;

  select *
  into v_position
  from public.user_positions
  where id = p_position_id
    and user_id = p_user_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open position was not found'
      using errcode = 'P0002';
  end if;

  if v_position.remaining_quantity < p_trim_quantity then
    raise exception 'Trim quantity exceeds remaining position quantity'
      using errcode = '22000';
  end if;

  v_new_remaining := v_position.remaining_quantity - p_trim_quantity;
  v_new_status := case when v_new_remaining = 0 then 'closed' else 'open' end;
  v_closed_at := case when v_new_remaining = 0 then p_trimmed_at else null end;

  update public.user_positions
  set remaining_quantity = v_new_remaining,
      status = v_new_status,
      closed_at = v_closed_at
  where id = p_position_id
    and user_id = p_user_id;

  insert into public.user_position_events (
    user_position_id,
    user_id,
    event_type,
    quantity_delta,
    executed_premium,
    notes,
    created_at
  ) values (
    p_position_id,
    p_user_id,
    'trim',
    -p_trim_quantity,
    p_exit_premium,
    p_notes,
    p_trimmed_at
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'position_id', p_position_id,
    'remaining_quantity', v_new_remaining,
    'status', v_new_status,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.commit_position_trim(
  uuid, uuid, smallint, numeric, text, timestamptz
) from public, anon;

grant execute on function public.commit_position_trim(
  uuid, uuid, smallint, numeric, text, timestamptz
) to authenticated;

-- RPC 3: commit_position_close
create or replace function public.commit_position_close(
  p_user_id uuid,
  p_position_id uuid,
  p_exit_premium numeric,
  p_notes text,
  p_closed_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_position public.user_positions%rowtype;
  v_event_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not own this position close'
      using errcode = '42501';
  end if;

  select *
  into v_position
  from public.user_positions
  where id = p_position_id
    and user_id = p_user_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open position was not found'
      using errcode = 'P0002';
  end if;

  update public.user_positions
  set remaining_quantity = 0,
      status = 'closed',
      closed_at = p_closed_at
  where id = p_position_id
    and user_id = p_user_id;

  insert into public.user_position_events (
    user_position_id,
    user_id,
    event_type,
    quantity_delta,
    executed_premium,
    notes,
    created_at
  ) values (
    p_position_id,
    p_user_id,
    'close',
    -v_position.remaining_quantity,
    p_exit_premium,
    p_notes,
    p_closed_at
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'position_id', p_position_id,
    'status', 'closed',
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.commit_position_close(
  uuid, uuid, numeric, text, timestamptz
) from public, anon;

grant execute on function public.commit_position_close(
  uuid, uuid, numeric, text, timestamptz
) to authenticated;
