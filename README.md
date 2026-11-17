# ROMify

Webbasierter Retro-Emulator für Handy und PC. Login per E-Mail, Spielstände und Erfolge werden über die Cloud synchronisiert.

- **Emulation:** [EmulatorJS](https://emulatorjs.org) (WebAssembly), Systeme siehe `src/systems.ts` (NDS, N64, GBA, GB/GBC, NES, SNES, Mega Drive, PSX, …). 3DS wird im Browser nicht unterstützt.
- **Backend:** Supabase Free-Tier (Auth, Postgres, Storage, Row-Level-Security).
- **ROMs liegen nie im Browser.** Nur Admins laden ROMs in den Katalog hoch. Beim Spielen wird die ROM aus dem Katalog in den Arbeitsspeicher geladen und danach verworfen. Im Konto gespeichert werden nur Spielstände, Spielzeit, Erfolge und die Spieleliste (Verweise auf Katalogeinträge). Nutzer können keine eigenen ROMs hinzufügen.
- **Oberfläche:** Login-Seite, Hauptmenü (zuletzt gespielt, meine Spiele, neu im Katalog, empfohlen, unterstützte Emulatoren), Katalog, Bibliothek nach Emulator gruppiert. Hintergrund = unscharfes Cover des zuletzt gespielten Spiels. Admins haben oben einen Umschalter ADMIN / USER.
- **Sync:** Save State pro Spiel (Hash der ROM → geräteübergreifend gleich) alle 60 s, beim Verlassen und beim Tab-Wechsel.

## Einrichtung

1. Supabase-Projekt anlegen, `supabase/schema.sql` und danach `supabase/catalog.sql` im SQL Editor ausführen (beide wiederholbar).
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
- Free-Tier von Supabase: max. 50 MB pro Datei, 1 GB Speicher und ca. 5 GB Datenverkehr pro Monat. Da die ROM bei jedem Start geladen wird, zählt jeder Start gegen das Datenvolumen.
- Erfolge sind eigene (Spielzeit, Bibliothek), keine spielinternen.
- Für manche Cores (z. B. PSP) wären COOP/COEP-Header nötig.
