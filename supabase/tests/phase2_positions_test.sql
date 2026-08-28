create extension if not exists pgtap with schema extensions;

select plan(22);

-- 1-3: Table existence
select has_table('public', 'user_positions', 'user_positions table exists');
select has_table('public', 'user_position_events', 'user_position_events table exists');
select has_table('public', 'host_events', 'host_events table exists');

-- 4: Authenticated permissions
select is(
  (
    select count(*)::integer
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname in ('user_positions', 'user_position_events', 'host_events')
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
  3,
  'authenticated has exactly CRUD on phase 2 tables'
);

-- Cleanup users
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

-- Seed users
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user1@example.test', 'not-used', now(), '{"provider":"email"}', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'user2@example.test', 'not-used', now(), '{"provider":"email"}', '{}', now(), now());

-- Seed trader source
insert into public.trader_sources (id, user_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Source 1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Source 2');

-- Seed trade alerts
insert into public.trade_alerts (
  id, user_id, trader_source_id, raw_text, symbol, option_side, strike, expiration, contract_confirmed, submitted_at
) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alert 1', 'SPX', 'call', 6000, '2030-01-18', true, now()),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Alert 2', 'SPX', 'put', 5900, '2030-01-18', true, now());

-- Seed entry analyses
insert into public.entry_analyses (
  id, user_id, trade_alert_id, verdict, evidence_score, analysis_factors, summary, analyzed_at
) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Consider', 85, '{}', 'Summary 1', now()),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Consider', 80, '{}', 'Summary 2', now());

-- Set role as user 1
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- 5: Open position RPC
select lives_ok(
  $$
    select public.commit_user_purchase_and_open_position(
      '11111111-1111-1111-1111-111111111111'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid,
      2::smallint,
      2.50::numeric,
      '{"notes":"Entry note"}'::jsonb,
      now()
    )
  $$,
  'User 1 can open a 2-contract position via RPC'
);

-- 6-8: Check created position values
select is(
  (select count(*)::integer from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111' and status = 'open'),
  1,
  'one open position exists for user 1'
);
select is(
  (select remaining_quantity::integer from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'position remaining quantity is 2'
);
select is(
  (select count(*)::integer from public.user_position_events where user_id = '11111111-1111-1111-1111-111111111111' and event_type = 'purchase'),
  1,
  'one purchase event recorded'
);

-- 9: Trim 1 contract
select lives_ok(
  $$
    select public.commit_position_trim(
      '11111111-1111-1111-1111-111111111111'::uuid,
      (select id from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111' limit 1),
      1::smallint,
      3.75::numeric,
      '50% profit trim'::text,
      now()
    )
  $$,
  'User 1 can trim 1 contract'
);

-- 10-12: Check updated state after trim
select is(
  (select remaining_quantity::integer from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'position remaining quantity is now 1 (runner)'
);
select is(
  (select status from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111'),
  'open',
  'position remains open as runner'
);
select is(
  (select count(*)::integer from public.user_position_events where user_id = '11111111-1111-1111-1111-111111111111' and event_type = 'trim'),
  1,
  'one trim event recorded'
);

-- 13: Close remaining runner
select lives_ok(
  $$
    select public.commit_position_close(
      '11111111-1111-1111-1111-111111111111'::uuid,
      (select id from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111' limit 1),
      5.00::numeric,
      'Runner closed at 100% gain'::text,
      now()
    )
  $$,
  'User 1 can close remaining runner'
);

-- 14-16: Check closed position state
select is(
  (select remaining_quantity::integer from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'closed position has 0 remaining quantity'
);
select is(
  (select status from public.user_positions where user_id = '11111111-1111-1111-1111-111111111111'),
  'closed',
  'position status is now closed'
);
select is(
  (select count(*)::integer from public.user_position_events where user_id = '11111111-1111-1111-1111-111111111111' and event_type = 'close'),
  1,
  'one close event recorded'
);

-- 17: Log host event
select lives_ok(
  $$
    insert into public.host_events (
      user_id, trade_alert_id, raw_text, event_type, claimed_exit_premium, claimed_percentage
    ) values (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      'ALL OUT @ 5.00',
      'all_out',
      5.00,
      100.0
    )
  $$,
  'User 1 can insert host follow-up event'
);

-- 18-20: Test tenant isolation as User 2
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$select id from public.user_positions$$,
  'User 2 cannot see User 1 positions'
);
select is_empty(
  $$select id from public.user_position_events$$,
  'User 2 cannot see User 1 position events'
);
select is_empty(
  $$select id from public.host_events$$,
  'User 2 cannot see User 1 host events'
);

-- 21-22: Cross-user mutation rejections
select throws_ok(
  $$
    select public.commit_position_trim(
      '22222222-2222-2222-2222-222222222222'::uuid,
      (select id from public.user_positions limit 1),
      1::smallint,
      3.00::numeric,
      'Unauthorized trim'::text,
      now()
    )
  $$,
  'P0002',
  null,
  'User 2 cannot trim User 1 position'
);

select throws_ok(
  $$
    select public.commit_position_close(
      '22222222-2222-2222-2222-222222222222'::uuid,
      (select id from public.user_positions limit 1),
      3.00::numeric,
      'Unauthorized close'::text,
      now()
    )
  $$,
  'P0002',
  null,
  'User 2 cannot close User 1 position'
);

reset role;
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

select * from finish();
