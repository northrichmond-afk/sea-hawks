-- =====================================================================
-- Sea Hawks Cricket Coaching — database schema for Supabase
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to read top to bottom: tables, helper functions, triggers,
-- report views, then Row Level Security (who can see what).
-- =====================================================================

-- ---------- Types ----------------------------------------------------
create type public.staff_role as enum ('admin', 'coach');
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

-- ---------- Tables ---------------------------------------------------

-- Staff who may sign in (admins and coaches). Parents do NOT go here:
-- a parent gets access automatically when their Google email matches
-- the email on a guardian record.
create table public.app_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  full_name   text,
  role        public.staff_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index app_users_email_key on public.app_users (lower(email));

-- One-row table for club details shown to parents ("How to pay").
create table public.club_settings (
  id                 boolean primary key default true check (id),
  club_name          text not null default 'Sea Hawks Cricket',
  bank_account_name  text,
  bank_sort_code     text,
  bank_account_no    text,
  payment_note       text default 'Please use your child''s payment reference when you pay.'
);
insert into public.club_settings (id) values (true);

create table public.squads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  monthly_fee  numeric(8,2) not null default 0 check (monthly_fee >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create sequence public.player_ref_seq start 1;

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  dob          date,
  squad_id     uuid references public.squads(id) on delete set null,
  fee_override numeric(8,2) check (fee_override >= 0),  -- optional, e.g. sibling discount
  payment_ref  text not null unique
               default ('SH' || lpad(nextval('public.player_ref_seq')::text, 3, '0')),
  status       text not null default 'active' check (status in ('active', 'left')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index players_squad_idx on public.players (squad_id);

-- Addresses and contact details live ONLY here. Coaches have no access
-- to this table, which is how addresses stay admin/parent-only.
create table public.guardians (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text,
  phone             text,
  address_line1     text,
  address_line2     text,
  town              text,
  postcode          text,
  consent_given_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index guardians_email_idx on public.guardians (lower(email));

create table public.player_guardians (
  player_id     uuid not null references public.players(id) on delete cascade,
  guardian_id   uuid not null references public.guardians(id) on delete cascade,
  relationship  text,
  primary key (player_id, guardian_id)
);
create index player_guardians_guardian_idx on public.player_guardians (guardian_id);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  squad_id      uuid not null references public.squads(id) on delete restrict,
  session_date  date not null,
  start_time    time,
  end_time      time,
  venue         text,
  cancelled     boolean not null default false,
  series_id     uuid,                            -- groups sessions made together
  notes         text,
  created_at    timestamptz not null default now()
);
create index sessions_date_idx on public.sessions (session_date);
create index sessions_squad_idx on public.sessions (squad_id);

create table public.attendance (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  status      public.attendance_status not null,
  marked_by   text,
  marked_at   timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index attendance_player_idx on public.attendance (player_id);

-- Money owed. One charge per player per month, raised by the admin with
-- raise_monthly_charges(). Admin can also add manual charges/credits
-- (charge_month null). A voided charge counts as zero (e.g. fee waived).
create table public.charges (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  charge_month  date check (charge_month = date_trunc('month', charge_month)::date),
  amount        numeric(8,2) not null,
  description   text,
  voided        boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (player_id, charge_month)
);
create index charges_player_idx on public.charges (player_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  amount       numeric(8,2) not null check (amount > 0),
  paid_on      date not null default current_date,
  bank_ref     text,
  notes        text,
  recorded_by  text,
  created_at   timestamptz not null default now()
);
create index payments_player_idx on public.payments (player_id);
create index payments_date_idx on public.payments (paid_on);

-- ---------- Helper functions (used by security rules) ----------------

-- The signed-in user's email, but ONLY once it has been confirmed.
-- Google accounts are confirmed automatically. Email/password accounts
-- are confirmed when the person clicks the link in the sign-up email.
-- This stops someone registering with a parent's email address and
-- seeing that family's data without owning the mailbox.
create or replace function public.current_email() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(u.email) from auth.users u
                    where u.id = auth.uid() and u.email_confirmed_at is not null), '')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users
                 where lower(email) = current_email() and active and role = 'admin')
$$;

-- Staff = admin or coach
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users
                 where lower(email) = current_email() and active)
$$;

-- Players whose guardian email matches the signed-in user
create or replace function public.my_player_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pg.player_id
  from player_guardians pg
  join guardians g on g.id = pg.guardian_id
  where g.email is not null and lower(g.email) = current_email()
$$;

create or replace function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_player_ids())
$$;

-- Tells the app who is signed in and what they may see.
create or replace function public.whoami() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'email',     current_email(),
    'role',      (select role from app_users
                  where lower(email) = current_email() and active limit 1),
    'is_parent', is_parent()
  )
$$;

-- ---------- Triggers ------------------------------------------------

-- Stamp who marked attendance, and when
create or replace function public.trg_attendance_stamp() returns trigger
language plpgsql as $$
begin
  new.marked_by := coalesce(nullif(current_email(), ''), new.marked_by);
  new.marked_at := now();
  return new;
end $$;

create trigger attendance_stamp
  before insert or update on public.attendance
  for each row execute function public.trg_attendance_stamp();

-- ---------- Monthly fees ---------------------------------------------
-- Admin runs this once a month (Payments tab → "Raise charges").
-- Charges every ACTIVE player in a squad their monthly fee (squad fee,
-- or the player's own fee if set). Safe to run twice: a player is never
-- charged twice for the same month, and a waived (voided) month stays waived.
create or replace function public.raise_monthly_charges(p_month date)
returns table (charges_created int, total numeric)
language plpgsql security invoker set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  n int;
  t numeric;
begin
  if not is_admin() then
    raise exception 'Only admins can raise charges';
  end if;
  with ins as (
    insert into charges (player_id, charge_month, amount, description)
    select p.id, m, coalesce(p.fee_override, sq.monthly_fee),
           'Monthly fee ' || to_char(m, 'FMMonth YYYY')
    from players p
    join squads sq on sq.id = p.squad_id
    where p.status = 'active' and coalesce(p.fee_override, sq.monthly_fee) > 0
    on conflict (player_id, charge_month) do nothing
    returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into n, t from ins;
  return query select n, t;
end $$;

-- Stamp who recorded a payment
create or replace function public.trg_payment_stamp() returns trigger
language plpgsql as $$
begin
  new.recorded_by := coalesce(nullif(current_email(), ''), new.recorded_by);
  return new;
end $$;

create trigger payment_stamp
  before insert on public.payments
  for each row execute function public.trg_payment_stamp();

-- ---------- Admin helper: create a weekly series of sessions --------
-- Runs as the caller, so only admins succeed (security rules apply).
create or replace function public.create_session_series(
  p_squad uuid, p_first_date date, p_last_date date,
  p_start time, p_end time, p_venue text,
  p_skip date[] default '{}'
) returns int
language plpgsql security invoker set search_path = public as $$
declare
  d date := p_first_date;
  sid uuid := gen_random_uuid();
  n int := 0;
begin
  if p_last_date < p_first_date then
    raise exception 'Last date is before first date';
  end if;
  if p_last_date > p_first_date + 366 then
    raise exception 'A series can be at most one year long';
  end if;
  while d <= p_last_date loop
    if not (d = any(coalesce(p_skip, '{}'))) then
      insert into sessions (squad_id, session_date, start_time, end_time, venue, series_id)
      values (p_squad, d, p_start, p_end, p_venue, sid);
      n := n + 1;
    end if;
    d := d + 7;
  end loop;
  return n;
end $$;

-- ---------- Report views (respect the security rules) ---------------

create view public.player_balances with (security_invoker = true) as
select p.id as player_id,
       p.first_name, p.last_name, p.payment_ref, p.status,
       p.squad_id, sq.name as squad_name,
       coalesce(c.charged, 0)                      as charged,
       coalesce(pm.paid, 0)                        as paid,
       coalesce(c.charged, 0) - coalesce(pm.paid, 0) as balance,
       pm.last_paid_on,
       c.oldest_charge
from players p
left join squads sq on sq.id = p.squad_id
left join (select player_id, sum(amount) charged, min(coalesce(charge_month, created_at::date)) oldest_charge
             from charges where not voided group by player_id) c on c.player_id = p.id
left join (select player_id, sum(amount) paid, max(paid_on) last_paid_on
             from payments group by player_id) pm on pm.player_id = p.id
where public.is_admin() or p.id in (select public.my_player_ids());

create view public.session_headcounts with (security_invoker = true) as
select s.id as session_id, s.session_date, s.start_time, s.squad_id,
       sq.name as squad_name, s.venue, s.cancelled,
       count(a.*) filter (where a.status = 'present') as present,
       count(a.*) filter (where a.status = 'late')    as late,
       count(a.*) filter (where a.status = 'absent')  as absent,
       count(a.*) filter (where a.status = 'excused') as excused,
       count(a.*)                                     as marked
from sessions s
join squads sq on sq.id = s.squad_id
left join attendance a on a.session_id = s.id
group by s.id, sq.name;

-- Attendance % per player between two dates (admin report)
create or replace function public.report_attendance(p_from date, p_to date)
returns table (player_id uuid, first_name text, last_name text, squad_name text,
               sessions_held bigint, attended bigint, late bigint, absent bigint,
               excused bigint, attendance_pct numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.first_name, p.last_name, sq.name,
         count(s.id),
         count(a.*) filter (where a.status in ('present','late')),
         count(a.*) filter (where a.status = 'late'),
         count(s.id) - count(a.*) filter (where a.status in ('present','late','excused')),
         count(a.*) filter (where a.status = 'excused'),
         round(100.0 * count(a.*) filter (where a.status in ('present','late'))
               / nullif(count(s.id), 0), 1)
  from players p
  left join squads sq on sq.id = p.squad_id
  left join sessions s on s.squad_id = p.squad_id and not s.cancelled
                       and s.session_date between p_from and p_to
                       and s.session_date <= current_date
  left join attendance a on a.session_id = s.id and a.player_id = p.id
  where p.status = 'active'
  group by p.id, sq.name
  order by sq.name, p.last_name, p.first_name
$$;

-- =====================================================================
-- Row Level Security — deny by default, then allow per role
-- =====================================================================
alter table public.app_users        enable row level security;
alter table public.club_settings    enable row level security;
alter table public.squads           enable row level security;
alter table public.players          enable row level security;
alter table public.guardians        enable row level security;
alter table public.player_guardians enable row level security;
alter table public.sessions         enable row level security;
alter table public.attendance       enable row level security;
alter table public.charges          enable row level security;
alter table public.payments         enable row level security;

-- Signed-out visitors get nothing at all
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- app_users: admin manages; staff can read their own row
create policy admin_all on public.app_users for all to authenticated
  using (is_admin()) with check (is_admin());
create policy self_read on public.app_users for select to authenticated
  using (lower(email) = current_email());

-- club_settings: anyone with access reads; admin edits
create policy read_settings on public.club_settings for select to authenticated
  using (is_staff() or is_parent());
create policy admin_update on public.club_settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- squads
create policy admin_all on public.squads for all to authenticated
  using (is_admin()) with check (is_admin());
create policy read_squads on public.squads for select to authenticated
  using (is_staff() or is_parent());

-- players: coaches read all (names for registers); parents read own
create policy admin_all on public.players for all to authenticated
  using (is_admin()) with check (is_admin());
create policy staff_read on public.players for select to authenticated
  using (is_staff());
create policy parent_read on public.players for select to authenticated
  using (id in (select my_player_ids()));

-- guardians: admin only, plus a parent's own record. NO coach access.
create policy admin_all on public.guardians for all to authenticated
  using (is_admin()) with check (is_admin());
create policy parent_read_self on public.guardians for select to authenticated
  using (email is not null and lower(email) = current_email());

create policy admin_all on public.player_guardians for all to authenticated
  using (is_admin()) with check (is_admin());
create policy parent_read on public.player_guardians for select to authenticated
  using (player_id in (select my_player_ids()));

-- sessions: admin manages; coaches read; parents read their kids' squads
create policy admin_all on public.sessions for all to authenticated
  using (is_admin()) with check (is_admin());
create policy staff_read on public.sessions for select to authenticated
  using (is_staff());
create policy parent_read on public.sessions for select to authenticated
  using (squad_id in (select squad_id from players where id in (select my_player_ids())));

-- attendance: coaches mark it; parents read own
create policy admin_all on public.attendance for all to authenticated
  using (is_admin()) with check (is_admin());
create policy staff_read on public.attendance for select to authenticated
  using (is_staff());
create policy staff_insert on public.attendance for insert to authenticated
  with check (is_staff());
create policy staff_update on public.attendance for update to authenticated
  using (is_staff()) with check (is_staff());
create policy parent_read on public.attendance for select to authenticated
  using (player_id in (select my_player_ids()));

-- charges & payments: admin only, parents read own. NO coach access.
create policy admin_all on public.charges for all to authenticated
  using (is_admin()) with check (is_admin());
create policy parent_read on public.charges for select to authenticated
  using (player_id in (select my_player_ids()));

create policy admin_all on public.payments for all to authenticated
  using (is_admin()) with check (is_admin());
create policy parent_read on public.payments for select to authenticated
  using (player_id in (select my_player_ids()));
