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
