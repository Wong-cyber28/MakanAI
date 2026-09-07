-- Public read, owner-only write for meal photos.
-- Paths must be `{auth.uid()}/filename.jpg`.

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%meal_images%'
        or coalesce(with_check, '') ilike '%meal_images%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

drop policy if exists "Public read meal images" on storage.objects;
create policy "Public read meal images"
on storage.objects
for select
using (bucket_id = 'meal_images');

drop policy if exists "Users upload own meal images" on storage.objects;
create policy "Users upload own meal images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meal_images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Users update own meal images" on storage.objects;
create policy "Users update own meal images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'meal_images'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'meal_images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Users delete own meal images" on storage.objects;
create policy "Users delete own meal images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meal_images'
  and split_part(name, '/', 1) = auth.uid()::text
);
