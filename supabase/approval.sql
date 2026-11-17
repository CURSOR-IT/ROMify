-- ROMify: Registrierungen müssen von einem Admin freigeschaltet werden.
-- Reihenfolge: schema.sql -> catalog.sql -> approval.sql (wiederholbar).

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  approved   boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.profiles enable row level security;

drop policy if exists "profiles read"          on public.profiles;
drop policy if exists "profiles admin update"  on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Absichtlich keine Insert-Policy: Profile entstehen nur über den Trigger unten.

-- Freigeschaltet = Admin oder Profil mit approved = true
create or replace function public.is_approved() returns boolean
language sql security definer set search_path = public stable as $$
  select public.is_admin() or exists (select 1 from public.profiles where user_id = auth.uid() and approved);
$$;
revoke all on function public.is_approved() from public;
grant execute on function public.is_approved() to authenticated;

-- Neue Konten bekommen automatisch ein Profil, zunächst NICHT freigeschaltet
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, approved) values (new.id, new.email, false) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bestehende Konten gelten als freigeschaltet (Admins können sie später sperren)
insert into public.profiles (user_id, email, approved)
select id, email, true from auth.users
on conflict (user_id) do nothing;

-- Daten nur für freigeschaltete Nutzer
drop policy if exists "own games" on public.games;
create policy "own games" on public.games for all
  using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());

drop policy if exists "own achievements" on public.achievements;
create policy "own achievements" on public.achievements for all
  using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());

drop policy if exists "catalog read" on public.catalog_roms;
create policy "catalog read" on public.catalog_roms for select to authenticated using (public.is_approved());

drop policy if exists "report insert" on public.catalog_reports;
create policy "report insert" on public.catalog_reports for insert to authenticated
  with check (auth.uid() = user_id and public.is_approved());

drop policy if exists "catalog files read" on storage.objects;
create policy "catalog files read" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and public.is_approved());

drop policy if exists "own saves read"   on storage.objects;
drop policy if exists "own saves write"  on storage.objects;
drop policy if exists "own saves update" on storage.objects;
drop policy if exists "own saves delete" on storage.objects;
create policy "own saves read"   on storage.objects for select
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "own saves write"  on storage.objects for insert
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "own saves update" on storage.objects for update
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "own saves delete" on storage.objects for delete
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());

notify pgrst, 'reload schema';
