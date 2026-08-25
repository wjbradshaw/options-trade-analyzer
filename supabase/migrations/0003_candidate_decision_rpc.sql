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
