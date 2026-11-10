\set ON_ERROR_STOP 1
-- Simulates a signed-in user. Confirmed unless the email starts with 'unconfirmed'.
create or replace function pg_temp.as_user(e text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = e;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users values (uid, e, case when e like 'unconfirmed%' then null else now() end);
  end if;
  perform set_config('request.jwt.claims', json_build_object('email', e, 'sub', uid)::text, false);
end $$;

-- ===== COACH =====
select pg_temp.as_user('coach@example.com'); set role authenticated;
select 'coach whoami' t, whoami();
select 'coach players (expect 12)' t, count(*) from players;
select 'coach guardians (expect 0)' t, count(*) from guardians;
select 'coach charges (expect 0)' t, count(*) from charges;
select 'coach payments (expect 0)' t, count(*) from payments;
select 'coach balances (expect 0)' t, count(*) from player_balances;
-- coach marks register for first (past) U9 session
insert into attendance (session_id, player_id, status)
select s.id, p.id, case p.first_name when 'Arjun' then 'present' when 'Maya' then 'late' else 'absent' end::attendance_status
from sessions s join players p on p.squad_id = s.squad_id
where s.id = (select id from sessions order by session_date limit 1);
-- upsert (correction) - Leo actually came
insert into attendance (session_id, player_id, status)
select (select id from sessions order by session_date limit 1), id, 'present' from players where first_name='Leo'
on conflict (session_id, player_id) do update set status = excluded.status;
select 'coach attendance marked_by' t, marked_by, count(*) from attendance group by 1,2;
do $$ begin
  begin insert into payments(player_id, amount) select id, 5 from players limit 1;
        raise exception 'FAIL: coach inserted payment';
  exception when insufficient_privilege then raise notice 'OK coach blocked from payments'; end;
  begin update sessions set venue = 'x';
        if found then raise exception 'FAIL coach updated sessions'; end if;
        raise notice 'OK coach cannot update sessions (0 rows)';
  end;
  begin insert into players(first_name,last_name) values ('x','y');
        raise exception 'FAIL: coach added player';
  exception when insufficient_privilege then raise notice 'OK coach blocked from adding players'; end;
end $$;
reset role;

-- ===== ADMIN =====
select pg_temp.as_user('admin@example.com'); set role authenticated;
select 'admin whoami' t, whoami();
select 'attendance creates no charges (expect 0)' t, count(*) from charges;
select 'raise Nov (expect 12 rows, 30*3+35*3+35*3+40*3=420)' t, * from raise_monthly_charges('2026-11-15');
select 'raise Nov again (expect 0, 0)' t, * from raise_monthly_charges('2026-11-01');
update players set fee_override = 20 where first_name = 'Maya';
update charges set voided = true where player_id = (select id from players where first_name='Leo') and charge_month = '2026-11-01';
select 'raise Dec (expect 12, 410)' t, * from raise_monthly_charges('2026-12-01');
insert into payments (player_id, amount, bank_ref) select id, 30, 'SH001 bank' from players where first_name='Arjun';
select 'admin balances (Arjun 30, Leo 30, Maya 50)' t, first_name, charged, paid, balance from player_balances where squad_name='U9' order by first_name;
select 'series fn' t, create_session_series((select id from squads where name='U11'), '2026-11-07','2026-12-26','09:00','10:30','Nets', array['2026-12-26']::date[]);
select 'report_attendance rows' t, count(*) from report_attendance('2026-01-01','2026-12-31');
select 'headcounts' t, squad_name, present, late, absent, excused from session_headcounts where marked>0;
reset role;

-- ===== PARENT =====
select pg_temp.as_user('parent@example.com'); set role authenticated;
select 'parent whoami' t, whoami();
select 'parent players (expect Arjun, Maya)' t, string_agg(first_name, ',' order by first_name) from players;
select 'parent guardians (expect 1)' t, count(*) from guardians;
select 'parent balances' t, first_name, balance from player_balances order by 2;
select 'parent sessions (U9 only, expect 8)' t, count(*) from sessions;
select 'parent attendance (own only, 2)' t, count(*) from attendance;
select 'parent app_users (expect 0)' t, count(*) from app_users;
do $$ begin
  begin perform raise_monthly_charges('2026-11-01');
        raise exception 'FAIL parent raised charges';
  exception when raise_exception then
        if sqlerrm like 'FAIL%' then raise; end if;
        raise notice 'OK parent cannot raise charges';
  end;
  begin insert into attendance(session_id, player_id, status)
        select (select id from sessions limit 1), id, 'present' from players limit 1;
        raise exception 'FAIL parent marked attendance';
  exception when insufficient_privilege then raise notice 'OK parent blocked from attendance'; end;
end $$;
reset role;

-- ===== STRANGER (Google account not invited) =====
select pg_temp.as_user('random@gmail.com'); set role authenticated;
select 'stranger whoami' t, whoami();
select 'stranger sees (expect 0 0 0 0)' t, (select count(*) from players), (select count(*) from guardians), (select count(*) from sessions), (select count(*) from club_settings);
reset role;

-- ===== UNCONFIRMED email/password sign-up using a parent's address =====
insert into auth.users values (gen_random_uuid(), 'parent2@example.com', null);
select set_config('request.jwt.claims', json_build_object('email','parent2@example.com','sub',(select id from auth.users where email='parent2@example.com'))::text, false);
reset role;
update guardians set email = 'parent2@example.com' where email = 'parent@example.com';
set role authenticated;
select 'unconfirmed whoami (expect is_parent false)' t, whoami();
select 'unconfirmed sees (expect 0 0)' t, (select count(*) from players), (select count(*) from guardians);
reset role;
update auth.users set email_confirmed_at = now() where email = 'parent2@example.com';
set role authenticated;
select 'after confirming (expect 2)' t, count(*) from players;
reset role;

-- ===== SIGNED OUT =====
set role anon;
do $$ begin
  begin perform count(*) from players; raise exception 'FAIL anon read players';
  exception when insufficient_privilege then raise notice 'OK anon blocked'; end;
end $$;
reset role;
