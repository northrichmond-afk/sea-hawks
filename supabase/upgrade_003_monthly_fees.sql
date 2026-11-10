-- =====================================================================
-- Upgrade: per-session fees → MONTHLY fees
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Not needed for a brand-new install using the current schema.sql.
--
-- What it does:
--   • stops charging per session attended (attendance no longer costs money)
--   • removes the price from training sessions
--   • renames each squad's fee to a MONTHLY fee (check the amounts afterwards!)
--   • adds an optional per-player monthly fee (e.g. sibling discount)
--   • DELETES the old per-session charges (test data). Payments are kept.
-- Everything runs in one transaction: if anything fails, nothing changes.
-- =====================================================================
begin;

-- 1. Remove per-session charging
drop trigger if exists attendance_charge        on public.attendance;
drop trigger if exists attendance_charge_delete on public.attendance;
drop trigger if exists attendance_stamp         on public.attendance;
drop trigger if exists session_resync           on public.sessions;
drop trigger if exists session_default_fee      on public.sessions;
drop function if exists public.trg_attendance_charge_after();
drop function if exists public.trg_attendance_charge();
drop function if exists public.trg_session_resync();
drop function if exists public.trg_session_default_fee();
drop function if exists public.sync_charge(uuid, uuid);
drop function if exists public.create_session_series(uuid, date, date, time, time, text, numeric, date[]);

-- Views depend on the columns being changed; recreated below
drop view if exists public.session_headcounts;
drop view if exists public.player_balances;

-- 2. Fees: squads get a monthly fee; players an optional override
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'squads' and column_name = 'default_fee') then
    alter table public.squads rename column default_fee to monthly_fee;
  end if;
end $$;
alter table public.players add column if not exists fee_override numeric(8,2) check (fee_override >= 0);
alter table public.sessions drop column if exists fee;

-- 3. Charges become one per player per month
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'charges' and column_name = 'session_id') then
    delete from public.charges where session_id is not null;
    alter table public.charges drop constraint if exists charges_session_id_player_id_key;
    alter table public.charges drop column session_id;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'charges' and column_name = 'charge_month') then
    alter table public.charges add column charge_month date
      check (charge_month = date_trunc('month', charge_month)::date);
    alter table public.charges add constraint charges_player_id_charge_month_key unique (player_id, charge_month);
  end if;
end $$;

-- 4. Attendance: just stamp who marked it
create or replace function public.trg_attendance_stamp() returns trigger
language plpgsql as $$
begin
  new.marked_by := coalesce(nullif(current_email(), ''), new.marked_by);
  new.marked_at := now();
  return new;
end $$;
drop trigger if exists attendance_stamp on public.attendance;
create trigger attendance_stamp
  before insert or update on public.attendance
  for each row execute function public.trg_attendance_stamp();

-- 5. Monthly charges (admin: Payments tab → "Raise charges")
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

-- 6. Session series without a price
create or replace function public.create_session_series(
  p_squad uuid, p_first_date date, p_last_date date,
  p_start time, p_end time, p_venue text, p_skip date[] default '{}'
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

-- 7. Recreate report views
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

-- 8. Permissions for the new/changed objects
revoke all on public.player_balances, public.session_headcounts from anon;
grant select on public.player_balances, public.session_headcounts to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

commit;

-- AFTERWARDS: open the app → Squads, and set each squad's MONTHLY fee
-- (the old per-session amounts were carried over and will be too low).
