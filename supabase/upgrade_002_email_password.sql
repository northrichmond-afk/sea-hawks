-- Only needed if you ran schema.sql BEFORE email/password sign-in was added.
-- (A fresh install using the current schema.sql already includes this.)
-- Run in Supabase → SQL Editor.

create or replace function public.current_email() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(u.email) from auth.users u
                    where u.id = auth.uid() and u.email_confirmed_at is not null), '')
$$;
grant execute on function public.current_email() to authenticated;
revoke execute on function public.current_email() from public, anon;
