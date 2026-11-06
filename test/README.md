Database security tests. With a local Postgres running:
  psql -f stub_supabase.sql -f ../supabase/schema.sql -f ../supabase/seed_test_data.sql -f rls_tests.sql
stub_supabase.sql imitates Supabase's auth.jwt() and roles. Every line should match its "expect" note,
and every NOTICE should say OK.
