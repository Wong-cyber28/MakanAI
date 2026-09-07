alter table public.meal_logs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists meal_logs_user_id_created_at_idx
  on public.meal_logs (user_id, created_at desc);

alter table public.meal_logs enable row level security;

drop policy if exists "Users can read own meals" on public.meal_logs;
create policy "Users can read own meals"
  on public.meal_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own meals" on public.meal_logs;
create policy "Users can insert own meals"
  on public.meal_logs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own meals" on public.meal_logs;
create policy "Users can update own meals"
  on public.meal_logs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own meals" on public.meal_logs;
create policy "Users can delete own meals"
  on public.meal_logs
  for delete
  using (auth.uid() = user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  height text,
  weight text,
  dob text,
  gender text,
  activity_level text,
  primary_goal text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can upsert own profile" on public.profiles;
create policy "Users can upsert own profile"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
