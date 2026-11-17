# ROMify

Webbasierter Retro-Emulator für Handy und PC. Login per E-Mail, Spielstände und Erfolge werden über die Cloud synchronisiert.

- **Emulation:** [EmulatorJS](https://emulatorjs.org) (WebAssembly), Systeme siehe `src/systems.ts` (NDS, N64, GBA, GB/GBC, NES, SNES, Mega Drive, PSX, …). 3DS wird im Browser nicht unterstützt.
- **Backend:** Supabase Free-Tier (Auth, Postgres, Storage, Row-Level-Security).
- **ROMs** liegen nur lokal (IndexedDB) und werden nie hochgeladen. Es werden keine ROMs/BIOS mitgeliefert, nutze nur eigene, legal erworbene Dateien.
- **Sync:** Save State pro Spiel (Hash der ROM → geräteübergreifend gleich) alle 60 s, beim Verlassen und beim Tab-Wechsel.

## Einrichtung

1. Supabase-Projekt anlegen, `supabase/schema.sql` im SQL Editor ausführen.
2. `.env.example` nach `.env` kopieren und `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` setzen.
3. `npm install && npm run dev`

## Bekannte Grenzen

- Cloud-Sync nutzt Save States, die an den Core gebunden sind. Core-Updates können alte States ungültig machen.
- Ein Spiel gleichzeitig auf zwei Geräten: der letzte Upload gewinnt.
- Erfolge sind eigene (Spielzeit, Bibliothek), keine spielinternen.
- Für manche Cores (z. B. PSP) wären COOP/COEP-Header nötig.
