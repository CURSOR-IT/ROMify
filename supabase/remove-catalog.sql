-- OPTIONAL: Räumt den früheren ROM-Katalog auf (nur nötig, wenn du catalog.sql schon ausgeführt hattest).
-- ROMify speichert keine ROMs mehr auf dem Server. Die ROM-Dateien im Storage-Bucket "catalog" löschst du
-- im Dashboard unter Storage (direktes Löschen per SQL ist bei Supabase gesperrt).

drop table if exists public.catalog_reports;
drop table if exists public.catalog_roms cascade;

drop policy if exists "catalog files read"   on storage.objects;
drop policy if exists "catalog files insert" on storage.objects;
drop policy if exists "catalog files update" on storage.objects;
drop policy if exists "catalog files delete" on storage.objects;
drop policy if exists "own roms read"   on storage.objects;
drop policy if exists "own roms write"  on storage.objects;
drop policy if exists "own roms update" on storage.objects;
drop policy if exists "own roms delete" on storage.objects;

alter table public.games drop column if exists catalog_id;

notify pgrst, 'reload schema';
