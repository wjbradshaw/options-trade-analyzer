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
