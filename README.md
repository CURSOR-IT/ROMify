# ROMify

Webbasierter Retro-Emulator für Handy und PC. Login per E-Mail, Spielstände und Erfolge werden über die Cloud synchronisiert.

- **Emulation:** [EmulatorJS](https://emulatorjs.org) (WebAssembly), Systeme siehe `src/systems.ts` (NDS, N64, GBA, GB/GBC, NES, SNES, Mega Drive, PSX, …). 3DS wird im Browser nicht unterstützt.
- **Backend:** Supabase Free-Tier (Auth, Postgres, Storage, Row-Level-Security).
- **ROMs** liegen lokal (IndexedDB). Optional sicherst du sie **privat** in deinem eigenen Cloud-Speicher (Supabase Storage, nur für dich lesbar per RLS). Es gibt keinen gemeinsamen ROM-Katalog und es werden keine ROMs/BIOS mitgeliefert. Nutze nur eigene, legal erworbene Dateien.
- **Oberfläche:** Login-Seite, Hauptmenü (zuletzt gespielt, neu, empfohlen, unterstützte Emulatoren), Bibliothek nach Emulator gruppiert. Hintergrund = unscharfes Cover des zuletzt gespielten Spiels (Screenshot beim Beenden oder eigenes Bild).
- **Sync:** Save State pro Spiel (Hash der ROM → geräteübergreifend gleich) alle 60 s, beim Verlassen und beim Tab-Wechsel.

## Einrichtung

1. Supabase-Projekt anlegen, `supabase/schema.sql` im SQL Editor ausführen (idempotent, kann erneut ausgeführt werden).
2. `.env.example` nach `.env` kopieren und `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` setzen.
3. `npm install && npm run dev`

## ROM-Katalog (Admins laden hoch, Nutzer sehen)
- Der Katalog enthält **ausschließlich selbst erstellte oder frei lizenzierte ROMs** (Homebrew). Er ist leer, es wird nichts mitgeliefert.
- Einspielen: `supabase/catalog.sql` im SQL Editor ausführen (wiederholbar). Dann den ersten Admin setzen (Zeile am Dateiende, E-Mail anpassen).
- Nur Admins können hochladen und löschen (Row-Level-Security über `public.is_admin()`). Angemeldete Nutzer lesen und laden Einträge in ihre Bibliothek.
- Pflichtangaben je Eintrag: Autor, Lizenz und Rechte-Bestätigung. Nutzer können Einträge über ⚑ melden, Admins sehen die Meldungen im Katalog und können löschen.
- Admins sind verantwortlich für die hochgeladenen Inhalte.

## Bekannte Grenzen

- Cloud-Sync nutzt Save States, die an den Core gebunden sind. Core-Updates können alte States ungültig machen.
- Ein Spiel gleichzeitig auf zwei Geräten: der letzte Upload gewinnt.
- Free-Tier: max. 50 MB pro Datei und 1 GB Speicher gesamt. Große Spiele (viele DS-/PSX-ROMs) passen nicht in den Cloud-Speicher und bleiben lokal.
- Erfolge sind eigene (Spielzeit, Bibliothek), keine spielinternen.
- Für manche Cores (z. B. PSP) wären COOP/COEP-Header nötig.
