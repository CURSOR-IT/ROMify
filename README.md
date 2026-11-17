<div align="center">

<img src="public/logo.jpg" alt="ROMify – Web-based Emulator" width="560" />

### 🕹️ Dein Retro-Arcade im Browser 👾
**Kein Download. Kein Setup. Einloggen, eigene ROM hinzufügen, loslegen.** ⚡

[![Live](https://img.shields.io/badge/%E2%96%B6%20PLAY-cursor--it.github.io%2FROMify-a855f7?style=for-the-badge)](https://cursor-it.github.io/ROMify/)

![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Free%20Tier-3ecf8e?logo=supabase&logoColor=white)
![EmulatorJS](https://img.shields.io/badge/EmulatorJS-WebAssembly-22d3ee)
![PWA](https://img.shields.io/badge/PWA-Handy%20%26%20PC-d946ef)

</div>

---

## ▶️ Press Start 🔥

ROMify ist ein webbasierter Retro-Emulator für **Handy 📱 und PC 💻**. Du meldest dich an, fügst deine **eigenen ROM-Dateien** hinzu und spielst sofort im Browser. Deine Spielstände 💾, Spielzeit ⏱️ und Erfolge 🏆 folgen dir auf jedes Gerät.

ROMify liefert **keine Spiele** mit und hostet keine ROMs. Die Dateien liegen ausschließlich im Browser der Nutzer 🔒.

## 🎮 Features ✨

- ⚡ **Sofort spielen:** Emulation per WebAssembly (EmulatorJS), Touch-Gamepad auf dem Handy, Tastatur und Controller am PC
- 🔒 **ROMs bleiben im Browser:** Eigene Dateien werden lokal gespeichert und nie hochgeladen
- 🔍 **Header wird automatisch gelesen:** Titel, Konsole und bei DS-Spielen sogar das Icon als Cover
- ☁️ **Login & Cloud-Saves:** Spielstände werden automatisch in der Datenbank gesichert und geräteübergreifend geladen
- 🏆 **Highscore-Feeling:** Erfolge für Spielzeit, Sammlung und Konsolen
- 🏠 **Dein Hauptmenü:** zuletzt gespielt, neu hinzugefügt und Empfehlungen, die sich an dein Spielverhalten anpassen (zum Beispiel mehr aus der Pokémon-Reihe, wenn du Pokémon spielst)
- 📚 **Bibliothek nach Konsole** sortiert, dazu eine Seite mit legalen Quellen für freie Spiele
- 📲 **Als App installierbar** (PWA): „Zum Startbildschirm hinzufügen“, fertig
- ✅ **Freischaltung:** Neue Konten müssen von einem Admin freigeschaltet werden (mit Zähler am Admin-Tab). Das erzwingt die Datenbank, nicht nur die Oberfläche
- 🛡️ **Admin-Tab** mit ADMIN/USER-Umschalter: Registrierungen freischalten und Nutzer sperren

## 🕹️ Unterstützte Konsolen 👾

| 🎯 Konsole | 📁 Dateiendungen |
|---|---|
| 🎴 Nintendo DS | `.nds` |
| 🧩 Nintendo 64 | `.z64` `.n64` `.v64` |
| 🟣 Game Boy Advance | `.gba` |
| 🟢 Game Boy / Color | `.gb` `.gbc` |
| 🔴 NES | `.nes` |
| 🎮 SNES | `.sfc` `.smc` |
| 🔵 Sega Mega Drive | `.md` `.gen` |
| ⚫ Sega Master System | `.sms` |
| 🟠 Sega Game Gear | `.gg` |
| 💿 PlayStation | `.cue` `.pbp` `.iso` |

> 🚫 Nicht möglich im Browser: Nintendo 3DS, PlayStation 2, Switch.

## 🧩 So funktioniert's ⚙️

```
Du fügst deine eigene ROM-Datei hinzu ──► sie bleibt lokal in deinem Browser
        │
        ▼
EmulatorJS startet ──► Spielstand, Spielzeit & Erfolge landen in der Datenbank
        │
        ▼
Anderes Gerät? Gleiche ROM-Datei hinzufügen ──► dein Spielstand wird geladen
```

| 📦 Was | 📍 Wo gespeichert |
|---|---|
| 👾 ROM-Dateien, Cover | 🌐 nur im Browser (IndexedDB), nie auf dem Server |
| 💾 Spielstände (Save States), ⏱️ Spielzeit, 🏆 Erfolge, Spieltitel | ☁️ Datenbank (Supabase), auf allen Geräten verfügbar |
| 🔑 Anmeldung, Admin/User-Wahl | 🌐 Browser (localStorage) |

🍪 Cookies werden für Spieldaten nicht genutzt.

## ⚖️ Fair Play 🤝

- 🚫 ROMify enthält, hostet und verlinkt **keine** urheberrechtlich geschützten Spiele von Seiten, die sie ohne Erlaubnis verbreiten.
- ✅ Nutzer fügen nur Dateien hinzu, an denen sie **die Rechte besitzen** (eigene Sicherungen, freie Homebrew). Beim ersten Hinzufügen bestätigen sie das.
- 📚 Die Seite **Quellen** verweist nur auf legale Anlaufstellen für freie Spiele (Homebrew Hub, PDRoms, itch.io).
- 🔒 ROMs verlassen den Browser nie, es gibt keinen Server-Speicher dafür.
- 🛡️ Neue Konten werden von Admins freigeschaltet.

## 🚀 Selbst hosten 🛠️

Voraussetzungen: Node.js 20+ und ein kostenloses [Supabase](https://supabase.com)-Projekt.

**1️⃣ Datenbank einrichten.** Im Supabase **SQL Editor** nacheinander ausführen (alle wiederholbar):

1. `supabase/schema.sql` (Tabellen, Spielstand-Speicher, Zugriffsregeln)
2. `supabase/approval.sql` (Admins und Freischaltung neuer Konten; bestehende Konten gelten als freigeschaltet)

> Hattest du früher den ROM-Katalog eingespielt? Mit `supabase/remove-catalog.sql` räumst du ihn optional auf.

**2️⃣ Konfiguration.**

```bash
cp .env.example .env
```

Trage in `.env` ein: `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` (unter *Project Settings → API*). Der Publishable Key ist öffentlich und durch die Zugriffsregeln geschützt. Der **Secret-Key** gehört nie ins Frontend und nie ins Repo.

**3️⃣ Starten.**

```bash
npm install && npm run dev
```

**4️⃣ Veröffentlichen (GitHub Pages).** *Settings → Pages → Source: GitHub Actions*. Jeder Push auf `main` baut und veröffentlicht die Seite. Trage die Seiten-URL in Supabase unter *Authentication → URL Configuration → Site URL* ein.

## 🛡️ Admin werden 👑

1. 📝 In der App normal registrieren (mit einem **starken** Passwort).
2. 🧾 Im SQL Editor ausführen und die E-Mail anpassen:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'DEINE@EMAIL.DE'
on conflict do nothing;
```

3. 🔁 Neu anmelden. (Admins sind automatisch freigeschaltet.) Oben erscheint der Tab **🛡️ Admin** mit den offenen Registrierungen. Mit **ADMIN / USER** schaltest du zwischen beiden Ansichten um.

## 🧱 Tech-Stack 🧰

Vite · TypeScript · [EmulatorJS](https://emulatorjs.org) · Supabase (Auth, Postgres, Storage, Row-Level-Security) · GitHub Pages · PWA

## 🧗 Bekannte Grenzen & Next Level 🚧

- 💽 ROMs liegen nur im Browser. Löscht der Nutzer die Browserdaten, muss er sie neu hinzufügen. Der Speicherplatz hängt vom Browser ab.
- 💾 Save States hängen am Emulator-Core. Ein Core-Update kann alte Stände ungültig machen.
- 👯 Läuft dasselbe Spiel gleichzeitig auf zwei Geräten, gewinnt der letzte Upload.
- 🏅 Erfolge sind eigene (Spielzeit, Sammlung, Konsolen), keine spielinternen.
- 🧠 EmulatorJS speichert seine eigenen Spielstände zusätzlich lokal. Diese Kopie wird nicht synchronisiert.
- 🌐 Manche Cores brauchen zusätzliche Browser-Header (COOP/COEP).

💡 **Ideen für später:** Passwort-vergessen-Funktion, Controller-Belegung pro Konsole speichern, Rechtstexte (Impressum, Nutzungsbedingungen).

---

<div align="center">

**Made for players. Player 1 ready.** 🕹️👾🎮

</div>
