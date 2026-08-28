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
