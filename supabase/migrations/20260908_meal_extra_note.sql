alter table public.meal_logs
  add column if not exists extra_note text;
