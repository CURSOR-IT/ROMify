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
