create extension if not exists dblink with schema extensions;

select plan(10);

delete from auth.users
where id = '10101010-1010-1010-1010-101010101010';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10101010-1010-1010-1010-101010101010',
  'authenticated',
  'authenticated',
  'candidate-concurrency@example.test',
  'not-used',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.trader_sources (id, user_id, name)
values (
  '20202020-2020-2020-2020-202020202020',
  '10101010-1010-1010-1010-101010101010',
  'Concurrency source'
);

insert into public.trade_alerts (
  id, user_id, trader_source_id, raw_text, symbol, option_side, strike,
  expiration, contract_confirmed, submitted_at
) values
  (
    '30303030-3030-3030-3030-303030303030',
    '10101010-1010-1010-1010-101010101010',
    '20202020-2020-2020-2020-202020202020',
    'Decision-first concurrency alert',
    'SPX', 'call', 6000, '2030-01-18', true, now()
  ),
  (
    '31313131-3131-3131-3131-313131313131',
    '10101010-1010-1010-1010-101010101010',
    '20202020-2020-2020-2020-202020202020',
    'Refresh-first concurrency alert',
    'SPX', 'put', 5900, '2030-01-18', true, now()
  );

insert into public.entry_analyses (
  id, user_id, trade_alert_id, verdict, evidence_score,
  analysis_factors, summary, analyzed_at
) values
  (
    '40404040-4040-4040-4040-404040404040',
    '10101010-1010-1010-1010-101010101010',
    '30303030-3030-3030-3030-303030303030',
    'Wait', 60, '{"test":"decision-first-source"}',
    'Decision-first source analysis', now()
  ),
  (
    '41414141-4141-4141-4141-414141414141',
    '10101010-1010-1010-1010-101010101010',
    '31313131-3131-3131-3131-313131313131',
    'Wait', 61, '{"test":"refresh-first-source"}',
    'Refresh-first source analysis', now()
  );

insert into public.watch_candidates (
  id, user_id, trade_alert_id, source_analysis_id,
  source_analysis_verdict, latest_analysis_id,
  unresolved_confirmation_conditions, status
) values
  (
    '50505050-5050-5050-5050-505050505050',
    '10101010-1010-1010-1010-101010101010',
    '30303030-3030-3030-3030-303030303030',
    '40404040-4040-4040-4040-404040404040',
    'Wait',
    '40404040-4040-4040-4040-404040404040',
    '[]', 'watching'
  ),
  (
    '51515151-5151-5151-5151-515151515151',
    '10101010-1010-1010-1010-101010101010',
    '31313131-3131-3131-3131-313131313131',
    '41414141-4141-4141-4141-414141414141',
    'Wait',
    '41414141-4141-4141-4141-414141414141',
    '[]', 'watching'
  );

select is(
  extensions.dblink_connect(
    'decision_first',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable application_name=phase1_decision_first'
  ),
  'OK',
  'opens the terminal-decision connection'
);
select is(
  extensions.dblink_connect(
    'refresh_second',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable application_name=phase1_refresh_second'
  ),
  'OK',
  'opens the competing refresh connection'
);

select extensions.dblink_exec('decision_first', 'set role authenticated');
select extensions.dblink_exec(
  'decision_first',
  $$set request.jwt.claim.sub = '10101010-1010-1010-1010-101010101010'$$
);
select extensions.dblink_exec('refresh_second', 'set role authenticated');
select extensions.dblink_exec(
  'refresh_second',
  $$set request.jwt.claim.sub = '10101010-1010-1010-1010-101010101010'$$
);

select extensions.dblink_exec('decision_first', 'begin');
select result
from extensions.dblink(
  'decision_first',
  $$
    select public.commit_watch_candidate_decision(
      '10101010-1010-1010-1010-101010101010',
      '50505050-5050-5050-5050-505050505050',
      '30303030-3030-3030-3030-303030303030',
      '40404040-4040-4040-4040-404040404040',
      'purchased', 1::smallint, 1.25,
      '{"test":"decision-first-terminal"}', now()
    )
  $$
) as terminal(result jsonb);

select is(
  extensions.dblink_send_query(
    'refresh_second',
    $$
      select public.commit_wait_candidate_refresh(
        '10101010-1010-1010-1010-101010101010',
        '50505050-5050-5050-5050-505050505050',
        '30303030-3030-3030-3030-303030303030',
        '{"test":"decision-first-refresh"}', now(),
        'Pass', 40, '{"test":"decision-first-refresh"}',
        'Refresh racing a terminal decision', now()
      )
    $$
  ),
  1,
  'starts the competing refresh asynchronously'
);

do $poll$
declare
  attempt integer;
begin
  for attempt in 1..500 loop
    if exists (
      select 1
      from pg_stat_activity
      where application_name = 'phase1_refresh_second'
        and wait_event_type = 'Lock'
    ) then
      return;
    end if;
    perform pg_sleep(0.01);
  end loop;
  raise exception 'Timed out waiting for the competing refresh row lock';
end;
$poll$;

select extensions.dblink_exec('decision_first', 'commit');

create temporary table decision_first_refresh_result (result jsonb);
insert into decision_first_refresh_result (result)
select result
from extensions.dblink_get_result('refresh_second', false) as refresh(result jsonb);

select is_empty(
  $$select result from decision_first_refresh_result$$,
  'a refresh queued behind a terminal decision cannot succeed'
);
select ok(
  extensions.dblink_error_message('refresh_second')
    like '%Watching candidate was not found%',
  'the losing refresh reports that the candidate is no longer watching'
);
select is(
  (
    select count(*)::integer
    from public.market_snapshots
    where snapshot_payload->>'test' = 'decision-first-refresh'
  ),
  0,
  'the losing refresh leaves no orphan snapshot'
);
select is(
  (
    select c.latest_analysis_id
    from public.watch_candidates c
    where c.id = '50505050-5050-5050-5050-505050505050'
  ),
  (
    select d.entry_analysis_id
    from public.trade_decisions d
    where d.decision_payload->>'test' = 'decision-first-terminal'
  ),
  'a resolved candidate keeps its terminal decision as the final latest analysis'
);

select extensions.dblink_disconnect('decision_first');
select extensions.dblink_disconnect('refresh_second');

select extensions.dblink_connect(
  'refresh_first',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable application_name=phase1_refresh_first'
);
select extensions.dblink_connect(
  'decision_second',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable application_name=phase1_decision_second'
);
select extensions.dblink_exec('refresh_first', 'set role authenticated');
select extensions.dblink_exec(
  'refresh_first',
  $$set request.jwt.claim.sub = '10101010-1010-1010-1010-101010101010'$$
);
select extensions.dblink_exec('decision_second', 'set role authenticated');
select extensions.dblink_exec(
  'decision_second',
  $$set request.jwt.claim.sub = '10101010-1010-1010-1010-101010101010'$$
);

select extensions.dblink_exec('refresh_first', 'begin');
create temporary table refresh_first_result (result jsonb);
insert into refresh_first_result (result)
select result
from extensions.dblink(
  'refresh_first',
  $$
    select public.commit_wait_candidate_refresh(
      '10101010-1010-1010-1010-101010101010',
      '51515151-5151-5151-5151-515151515151',
      '31313131-3131-3131-3131-313131313131',
      '{"test":"refresh-first"}', now(),
      'Consider', 80, '{"test":"refresh-first"}',
      'Refresh commits before a stale terminal decision', now()
    )
  $$
) as refresh(result jsonb);

select extensions.dblink_send_query(
  'decision_second',
  $$
    select public.commit_watch_candidate_decision(
      '10101010-1010-1010-1010-101010101010',
      '51515151-5151-5151-5151-515151515151',
      '31313131-3131-3131-3131-313131313131',
      '41414141-4141-4141-4141-414141414141',
      'purchased', 1::smallint, 1.25,
      '{"test":"decision-second-stale"}', now()
    )
  $$
);

do $poll$
declare
  attempt integer;
begin
  for attempt in 1..500 loop
    if exists (
      select 1
      from pg_stat_activity
      where application_name = 'phase1_decision_second'
        and wait_event_type = 'Lock'
    ) then
      return;
    end if;
    perform pg_sleep(0.01);
  end loop;
  raise exception 'Timed out waiting for the competing terminal-decision row lock';
end;
$poll$;

select extensions.dblink_exec('refresh_first', 'commit');

create temporary table decision_second_result (result jsonb);
insert into decision_second_result (result)
select result
from extensions.dblink_get_result('decision_second', false) as decision(result jsonb);

select is_empty(
  $$select result from decision_second_result$$,
  'a stale terminal decision queued behind a refresh cannot succeed'
);
select is(
  (
    select status
    from public.watch_candidates
    where id = '51515151-5151-5151-5151-515151515151'
  ),
  'watching',
  'refresh-first ordering leaves the candidate watching'
);
select is(
  (
    select latest_analysis_id
    from public.watch_candidates
    where id = '51515151-5151-5151-5151-515151515151'
  ),
  (
    select (result->>'analysis_id')::uuid
    from refresh_first_result
  ),
  'refresh-first ordering keeps the committed refresh as latest analysis'
);

select extensions.dblink_disconnect('refresh_first');
select extensions.dblink_disconnect('decision_second');

delete from auth.users
where id = '10101010-1010-1010-1010-101010101010';

select * from finish();
