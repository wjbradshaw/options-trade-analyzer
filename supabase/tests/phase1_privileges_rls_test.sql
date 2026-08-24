begin;

select plan(12);

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
      user_id, trade_alert_id, source_analysis_id,
      source_analysis_verdict, latest_analysis_id
    ) values (
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

select * from finish();
rollback;
