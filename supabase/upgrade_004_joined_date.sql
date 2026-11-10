-- =====================================================================
-- Upgrade: add a "joined" date to every player
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Not needed for a brand-new install using the current schema.sql.
--
--   • adds players.joined_on (new players default to the day they're added)
--   • gives EXISTING players a random joined date between 1 Jan this year
--     and today (test data) — change any of them on the player's page
--   • monthly charges now skip players who hadn't joined by that month
-- =====================================================================
begin;

do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'players' and column_name = 'joined_on') then
    alter table public.players add column joined_on date;
    update public.players
       set joined_on = date_trunc('year', current_date)::date
                       + floor(random() * (current_date - date_trunc('year', current_date)::date + 1))::int;
    alter table public.players alter column joined_on set default current_date;
    alter table public.players alter column joined_on set not null;
  end if;
end $$;

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
      and p.joined_on < (m + interval '1 month')::date
    on conflict (player_id, charge_month) do nothing
    returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into n, t from ins;
  return query select n, t;
end $$;

revoke execute on function public.raise_monthly_charges(date) from public, anon;
grant execute on function public.raise_monthly_charges(date) to authenticated;

commit;
