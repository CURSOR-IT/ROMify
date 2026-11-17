-- ROMify ROM-Katalog: einmalig im Supabase SQL Editor ausführen (wiederholbar).
-- Nur Admins laden hoch, angemeldete Nutzer lesen. Nur selbst erstellte oder frei lizenzierte ROMs einstellen.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins for select using (auth.uid() = user_id);
-- Absichtlich keine Insert-/Update-Policy: Admins werden nur per SQL gesetzt (siehe unten).

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.catalog_roms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  system      text not null,                 -- Emulator-Core, z. B. nds, gba
  description text check (description is null or char_length(description) <= 1000),
  author      text not null check (char_length(author) between 1 and 120),
  license     text not null,
  filename    text not null,
  file_path   text not null,
  cover_path  text,
  size        bigint not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.catalog_roms enable row level security;

drop policy if exists "catalog read"   on public.catalog_roms;
drop policy if exists "catalog insert" on public.catalog_roms;
drop policy if exists "catalog update" on public.catalog_roms;
drop policy if exists "catalog delete" on public.catalog_roms;
create policy "catalog read"   on public.catalog_roms for select to authenticated using (true);
create policy "catalog insert" on public.catalog_roms for insert to authenticated with check (public.is_admin());
create policy "catalog update" on public.catalog_roms for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "catalog delete" on public.catalog_roms for delete to authenticated using (public.is_admin());

-- Meldungen von Nutzern (Rechteverletzung, defekte Datei, ...)
create table if not exists public.catalog_reports (
  id         uuid primary key default gen_random_uuid(),
  rom_id     uuid not null references public.catalog_roms(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.catalog_reports enable row level security;
drop policy if exists "report insert" on public.catalog_reports;
drop policy if exists "report read"   on public.catalog_reports;
drop policy if exists "report delete" on public.catalog_reports;
create policy "report insert" on public.catalog_reports for insert to authenticated with check (auth.uid() = user_id);
create policy "report read"   on public.catalog_reports for select to authenticated using (public.is_admin());
create policy "report delete" on public.catalog_reports for delete to authenticated using (public.is_admin());

-- Privater Bucket (Free-Tier: max. 50 MB pro Datei). Lesen nur angemeldet, Schreiben nur Admins.
insert into storage.buckets (id, name, public, file_size_limit)
values ('catalog', 'catalog', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "catalog files read"   on storage.objects;
drop policy if exists "catalog files insert" on storage.objects;
drop policy if exists "catalog files update" on storage.objects;
drop policy if exists "catalog files delete" on storage.objects;
create policy "catalog files read"   on storage.objects for select to authenticated using (bucket_id = 'catalog');
create policy "catalog files insert" on storage.objects for insert to authenticated with check (bucket_id = 'catalog' and public.is_admin());
create policy "catalog files update" on storage.objects for update to authenticated using (bucket_id = 'catalog' and public.is_admin());
create policy "catalog files delete" on storage.objects for delete to authenticated using (bucket_id = 'catalog' and public.is_admin());

-- Bibliothek: ROMs liegen NIE im Browser. Die Spieleliste verweist nur auf Katalogeinträge.
alter table public.games add column if not exists catalog_id uuid references public.catalog_roms(id) on delete set null;
alter table public.games add column if not exists added_at timestamptz not null default now();

-- Aufräumen: privater Nutzer-ROM-Speicher aus einer früheren Version wird nicht mehr verwendet.
drop policy if exists "own roms read"   on storage.objects;
drop policy if exists "own roms write"  on storage.objects;
drop policy if exists "own roms update" on storage.objects;
drop policy if exists "own roms delete" on storage.objects;

-- Ersten Admin festlegen (E-Mail anpassen, dann diese Zeile separat ausführen):
-- insert into public.admins (user_id) select id from auth.users where email = 'DEINE@EMAIL.DE' on conflict do nothing;

-- Supabase-API informieren, dass sich das Schema geändert hat (sonst: "Could not find the ... column in the schema cache").
notify pgrst, 'reload schema';
