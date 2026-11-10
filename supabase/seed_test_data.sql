-- =====================================================================
-- MADE-UP test data. Run after schema.sql, while testing only.
-- 1) Replace the three emails below with real Google accounts you can
--    sign in with (e.g. your own, a spare Gmail for "coach", another
--    for "parent").
-- 2) Run in Supabase → SQL Editor.
-- =====================================================================

-- >>> EDIT THESE <<<
insert into public.app_users (email, full_name, role) values
  ('admin@example.com', 'Club Admin', 'admin'),
  ('coach@example.com', 'Test Coach', 'coach');

update public.club_settings set
  bank_account_name = 'Sea Hawks Cricket Club',
  bank_sort_code    = '00-00-00',
  bank_account_no   = '00000000';

insert into public.squads (name, monthly_fee) values
  ('U9', 30.00), ('U11', 35.00), ('U13', 35.00), ('U15', 40.00);

-- 12 pretend players across the squads
insert into public.players (first_name, last_name, dob, squad_id)
select v.fn, v.ln, v.dob::date, (select id from public.squads where name = v.sq)
from (values
  ('Arjun','Test','2017-03-02','U9'),  ('Maya','Test','2017-07-19','U9'),
  ('Leo','Sample','2016-01-11','U9'),  ('Isla','Sample','2015-05-30','U11'),
  ('Omar','Demo','2015-09-14','U11'),  ('Priya','Demo','2014-12-01','U11'),
  ('Sam','Example','2013-04-22','U13'),('Zara','Example','2013-08-08','U13'),
  ('Kai','Mock','2012-02-17','U13'),   ('Ella','Mock','2011-06-03','U15'),
  ('Ravi','Dummy','2011-10-27','U15'), ('Noah','Dummy','2010-11-15','U15')
) as v(fn, ln, dob, sq);

-- >>> EDIT THIS EMAIL: the parent test account <<<
insert into public.guardians (full_name, email, phone, address_line1, town, postcode, consent_given_at)
values ('Test Parent', 'parent@example.com', '07700 900000', '1 Test Street', 'Testtown', 'TE1 1ST', now());

-- Test Parent has two children (siblings)
insert into public.player_guardians (player_id, guardian_id, relationship)
select p.id, g.id, 'Parent'
from public.players p, public.guardians g
where g.email = 'parent@example.com' and p.last_name = 'Test';

-- Weekly Saturday sessions for U9 for the next 8 weeks
select public.create_session_series(
  (select id from public.squads where name = 'U9'),
  current_date - extract(dow from current_date)::int + 6 - 14,  -- two Saturdays ago
  current_date - extract(dow from current_date)::int + 6 + 35,
  '10:00', '11:30', 'Main ground', '{}');
