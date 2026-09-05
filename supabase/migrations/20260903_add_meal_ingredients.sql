alter table public.meal_logs
add column if not exists ingredients jsonb default '[]'::jsonb;
