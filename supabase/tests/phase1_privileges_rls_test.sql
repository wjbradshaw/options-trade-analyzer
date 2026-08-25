begin;

select plan(31);

-- This test fails if the authenticated CRUD grants are removed from the
-- migration, even though the ownership policies still exist.
select is(
  (
    select count(*)::integer
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname in (
        'profiles', 'trader_sources', 'trade_alerts', 'market_snapshots',
        'entry_analyses', 'trade_decisions', 'watch_candidates'
      )
      and (
        select count(*)
        from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege_type
        where has_table_privilege('authenticated', c.oid, privilege_type)
      ) = 4
      and not exists (
        select 1
        from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege_type
        where has_table_privilege('authenticated', c.oid, privilege_type)
      )
  ),
  7,
  'authenticated has exactly CRUD on every user-owned table'
);

select is_empty(
  $$
    select 1
    from pg_class c
    cross join unnest(array[
      'DELETE', 'INSERT', 'REFERENCES', 'SELECT',
      'TRIGGER', 'TRUNCATE', 'UPDATE'
    ]) as privilege_type
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname in (
        'profiles', 'trader_sources', 'trade_alerts', 'market_snapshots',
        'entry_analyses', 'trade_decisions', 'watch_candidates'
      )
      and has_table_privilege('anon', c.oid, privilege_type)
  $$,
  'anon has no table privileges on user-owned tables'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'trader_sources', 'trade_alerts', 'market_snapshots',
        'entry_analyses', 'trade_decisions', 'watch_candidates'
      )
  ),
  28,
  'all seven tables retain their four ownership policies'
);

select is(
  (
    select count(*)::integer
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and relname in (
        'profiles', 'trader_sources', 'trade_alerts', 'market_snapshots',
        'entry_analyses', 'trade_decisions', 'watch_candidates'
      )
      and relrowsecurity
  ),
  7,
  'RLS remains enabled on all user-owned tables'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
    'privilege-user-a@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
    'privilege-user-b@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.profiles (user_id, options_budget) values
  ('11111111-1111-1111-1111-111111111111', 1000),
  ('22222222-2222-2222-2222-222222222222', 2000);

insert into public.trader_sources (id, user_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A source'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B source');

insert into public.trade_alerts (
  id, user_id, trader_source_id, raw_text, symbol, option_side, strike,
  expiration, contract_confirmed, submitted_at
) values
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'A confirmed alert', 'ACME', 'call', 100, '2030-01-18', true, now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'A unconfirmed alert', null, null, null, null, false, now()
  );

insert into public.entry_analyses (
  id, user_id, trade_alert_id, verdict, evidence_score, analyzed_at
) values
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333', 'Consider', 1, now()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333', 'Wait', 1, now()
  );

set local role anon;
select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'anon cannot read user-owned rows'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$select user_id from public.profiles order by user_id$$,
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'authenticated user A reads only A rows'
);

select results_eq(
  $$
    insert into public.trader_sources (user_id, name)
    values ('11111111-1111-1111-1111-111111111111', 'A created source')
    returning user_id
  $$,
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'authenticated user A can write A rows'
);

select is_empty(
  $$
    update public.trader_sources
    set name = 'stolen by A'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    returning id
  $$,
  'authenticated user A cannot update B rows'
);

select throws_ok(
  $$
    insert into public.trade_alerts (
      user_id, trader_source_id, raw_text, submitted_at
    ) values (
      '11111111-1111-1111-1111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cross-tenant source link', now()
    )
  $$,
  '23503',
  null,
  'authenticated user A cannot cross-link B trader source'
);

select throws_ok(
  $$
    insert into public.entry_analyses (
      user_id, trade_alert_id, alert_contract_confirmed, verdict,
      evidence_score, analyzed_at
    ) values (
      '11111111-1111-1111-1111-111111111111',
      '44444444-4444-4444-4444-444444444444', true, 'Wait', 1, now()
    )
  $$,
  '23503',
  null,
  'an analysis cannot use the actual unconfirmed alert as a confirmed parent'
);

select throws_ok(
  $$
    insert into public.watch_candidates (
      user_id, trade_alert_id, source_analysis_id,
      source_analysis_verdict, latest_analysis_id
    ) values (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555', 'Wait',
      '66666666-6666-6666-6666-666666666666'
    )
  $$,
  '23503',
  null,
  'a watch candidate cannot label an actual Consider analysis as Wait'
);

select results_eq(
  $$
    insert into public.watch_candidates (
      id, user_id, trade_alert_id, source_analysis_id,
      source_analysis_verdict, latest_analysis_id
    ) values (
      '77777777-7777-7777-7777-777777777777',
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      '66666666-6666-6666-6666-666666666666', 'Wait',
      '66666666-6666-6666-6666-666666666666'
    )
    returning source_analysis_id
  $$,
  array['66666666-6666-6666-6666-666666666666'::uuid],
  'a valid Wait candidate uses an actual Wait source analysis'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_entry_analysis_workflow(uuid,uuid,text,jsonb,text,text,numeric,date,numeric,timestamptz,jsonb,jsonb,jsonb,timestamptz,text,numeric,jsonb,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated can execute the initial analysis transaction'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commit_entry_analysis_workflow(uuid,uuid,text,jsonb,text,text,numeric,date,numeric,timestamptz,jsonb,jsonb,jsonb,timestamptz,text,numeric,jsonb,text,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute the initial analysis transaction'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_wait_candidate_refresh(uuid,uuid,uuid,jsonb,timestamptz,text,numeric,jsonb,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated can execute the candidate refresh transaction'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commit_wait_candidate_refresh(uuid,uuid,uuid,jsonb,timestamptz,text,numeric,jsonb,text,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute the candidate refresh transaction'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_watch_candidate_decision(uuid,uuid,uuid,uuid,text,smallint,numeric,jsonb,timestamptz)',
    'EXECUTE'
  ),
  'authenticated can execute the candidate decision transaction'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commit_watch_candidate_decision(uuid,uuid,uuid,uuid,text,smallint,numeric,jsonb,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute the candidate decision transaction'
);

select isnt(
  public.commit_entry_analysis_workflow(
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Transactional workflow alert',
    '{"expiration":"1/18"}',
    'ACME', 'call', 100, '2030-01-18', 1.25, now(), '[]', '[]',
    '{"optionPremium":1.25,"underlyingPrice":100,"source":"manual","dte":5}',
    now(), 'Wait', 65,
    '{"modelVersion":"phase-1-v1","evidenceCoverage":45,"factors":[]}',
    'Wait for confirmation', now()
  )->>'analysis_id',
  null::text,
  'initial analysis RPC returns a completed analysis identifier'
);

select is(
  (select count(*)::integer from public.trade_alerts where raw_text = 'Transactional workflow alert'),
  1,
  'initial analysis RPC persists its alert exactly once'
);

select throws_ok(
  $$
    select public.commit_entry_analysis_workflow(
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Must roll back completely', '{}',
      'ACME', 'call', 100, '2030-01-18', 1.25, now(), '[]', '[]',
      '{"optionPremium":1.25,"underlyingPrice":100,"source":"manual","dte":5}',
      now(), 'Invalid', 65, '{"factors":[]}', null, now()
    )
  $$,
  '23514',
  null,
  'analysis-stage constraint failure aborts the workflow RPC'
);

select is_empty(
  $$select id from public.trade_alerts where raw_text = 'Must roll back completely'$$,
  'failed analysis RPC leaves no partial alert write'
);

select isnt(
  public.commit_wait_candidate_refresh(
    '11111111-1111-1111-1111-111111111111',
    '77777777-7777-7777-7777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    '{"optionPremium":1.30,"underlyingPrice":101,"source":"manual","dte":4}',
    now(), 'Consider', 75,
    '{"modelVersion":"phase-1-v1","evidenceCoverage":80,"factors":[]}',
    'Confirmation improved', now()
  )->>'analysis_id',
  null::text,
  'candidate refresh returns the newly persisted analysis identifier'
);

select isnt(
  (
    select latest_analysis_id
    from public.watch_candidates
    where id = '77777777-7777-7777-7777-777777777777'
  ),
  '66666666-6666-6666-6666-666666666666'::uuid,
  'candidate refresh advances the latest analysis pointer'
);

select throws_ok(
  $$
    select public.commit_watch_candidate_decision(
      '11111111-1111-1111-1111-111111111111',
      '77777777-7777-7777-7777-777777777777',
      '33333333-3333-3333-3333-333333333333',
      (
        select latest_analysis_id
        from public.watch_candidates
        where id = '77777777-7777-7777-7777-777777777777'
      ),
      'purchased', 4::smallint, 1.25,
      '{"modelVersion":"phase-1-v1","source":"pgTAP candidate"}', now()
    )
  $$,
  '23514',
  null,
  'an invalid decision aborts the candidate decision transaction'
);

select is(
  (
    select status
    from public.watch_candidates
    where id = '77777777-7777-7777-7777-777777777777'
  ),
  'watching',
  'a failed candidate decision leaves the candidate watching'
);

select is(
  (
    select count(*)::integer
    from public.trade_decisions
    where decision_payload->>'source' = 'pgTAP candidate'
  ),
  0,
  'a failed candidate decision leaves no partial decision row'
);

select isnt(
  public.commit_watch_candidate_decision(
    '11111111-1111-1111-1111-111111111111',
    '77777777-7777-7777-7777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    (
      select latest_analysis_id
      from public.watch_candidates
      where id = '77777777-7777-7777-7777-777777777777'
    ),
    'purchased', 2::smallint, 1.25,
    '{"modelVersion":"phase-1-v1","source":"pgTAP candidate"}', now()
  )->>'id',
  null::text,
  'candidate decision transaction returns its persisted decision identifier'
);

select is(
  (
    select status
    from public.watch_candidates
    where id = '77777777-7777-7777-7777-777777777777'
  ),
  'resolved',
  'a committed candidate decision resolves the watching candidate'
);

select is(
  (
    select count(*)::integer
    from public.trade_decisions
    where decision_payload->>'source' = 'pgTAP candidate'
  ),
  1,
  'candidate decision transaction persists exactly one decision'
);

select results_eq(
  $$
    select d.entry_analysis_id
    from public.trade_decisions d
    join public.watch_candidates c
      on c.id = '77777777-7777-7777-7777-777777777777'
    where d.decision_payload->>'source' = 'pgTAP candidate'
      and d.entry_analysis_id = c.latest_analysis_id
  $$,
  $$values (
    (
      select latest_analysis_id
      from public.watch_candidates
      where id = '77777777-7777-7777-7777-777777777777'
    )
  )$$,
  'candidate decision is bound to the candidate latest analysis'
);

select * from finish();
rollback;
