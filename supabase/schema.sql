-- ROMify: einmalig im Supabase SQL Editor ausführen.
-- ROMs werden NIE hochgeladen. Gespeichert werden nur Metadaten, Spielstände und Erfolge.

create table if not exists public.games (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_key     text not null,              -- SHA-1 der ROM-Datei (geräteübergreifend gleich)
  title        text not null,
  system       text not null,              -- z. B. nds, n64, gba
  playtime_sec integer not null default 0,
  last_played  timestamptz not null default now(),
  primary key (user_id, game_key)
);

create table if not exists public.achievements (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.games        enable row level security;
alter table public.achievements enable row level security;

drop policy if exists "own games" on public.games;
create policy "own games" on public.games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own achievements" on public.achievements;
create policy "own achievements" on public.achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Privater Bucket für Save States. Pfad: <user_id>/<game_key>/state.bin
insert into storage.buckets (id, name, public)
values ('saves', 'saves', false)
on conflict (id) do nothing;

drop policy if exists "own saves read"   on storage.objects;
drop policy if exists "own saves write"  on storage.objects;
drop policy if exists "own saves update" on storage.objects;
drop policy if exists "own saves delete" on storage.objects;

create policy "own saves read" on storage.objects for select
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own saves write" on storage.objects for insert
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own saves update" on storage.objects for update
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own saves delete" on storage.objects for delete
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Privater ROM-Speicher pro Nutzer (Free-Tier: max. 50 MB pro Datei, 1 GB gesamt) =====
alter table public.games add column if not exists filename text;
alter table public.games add column if not exists rom_path text;
alter table public.games add column if not exists rom_size bigint;

insert into storage.buckets (id, name, public, file_size_limit)
values ('roms', 'roms', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "own roms read"   on storage.objects;
drop policy if exists "own roms write"  on storage.objects;
drop policy if exists "own roms update" on storage.objects;
drop policy if exists "own roms delete" on storage.objects;

create policy "own roms read" on storage.objects for select
  using (bucket_id = 'roms' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own roms write" on storage.objects for insert
  with check (bucket_id = 'roms' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own roms update" on storage.objects for update
  using (bucket_id = 'roms' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own roms delete" on storage.objects for delete
  using (bucket_id = 'roms' and (storage.foldername(name))[1] = auth.uid()::text);
