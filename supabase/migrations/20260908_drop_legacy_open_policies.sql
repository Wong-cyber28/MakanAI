-- Drop leftover open policies so owner-only RLS is not OR'd with "allow all".

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'meal_logs'
      and policyname not in (
        'Users can read own meals',
        'Users can insert own meals',
        'Users can update own meals',
        'Users can delete own meals'
      )
  loop
    execute format('drop policy if exists %I on public.meal_logs', pol.policyname);
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname not in (
        'Users can read own profile',
        'Users can upsert own profile'
      )
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;
