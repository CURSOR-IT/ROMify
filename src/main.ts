import "./style.css";
import { ACHIEVEMENTS } from "./achievements";
import {
  addToLibrary,
  cloudConfigured,
  currentUser,
  listAchievements,
  listCloudGames,
  removeFromLibrary,
  supabase,
  unlock,
  type CloudGame,
} from "./cloud";
import {
  LICENSES,
  adminDelete,
  adminUpload,
  coverUrls,
  dismissReport,
  downloadCatalogRom,
  isAdmin,
  listCatalog,
  listReports,
  reportRom,
  type CatalogRom,
} from "./catalog";
import { startGame, type Session } from "./emulator";
import { readRomInfo, tidyTitle, type RomInfo } from "./romInfo";
import { renderIconCover } from "./romCover";
import { cacheSizes, clearCache, getCached, getPref, putCached, removeCached, setPref } from "./romcache";
import { recommend, type Entry } from "./recommend";
import { ACCEPT, CORE_LABELS, CORE_ORDER, supportedEmulators, systemFor } from "./systems";

const app = document.getElementById("app")!;
const bg = document.createElement("div");
bg.id = "bg";
document.body.prepend(bg);

const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}logo.jpg`;
let session: Session | null = null;
let signedIn = false;

// Admin-Ansicht: Nur echte Admins (Tabelle `admins`) sehen den Umschalter. Die Rechte erzwingt die Datenbank.
let isAdminUser = false;
let adminChecked = false;
let adminView = (() => {
  try {
    return localStorage.getItem("romify.adminView") !== "user";
  } catch {
    return true;
  }
})();
async function refreshAdmin() {
  isAdminUser = signedIn ? await isAdmin().catch(() => false) : false;
  adminChecked = true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtTime = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(s / 60))} min`);
const fmtMB = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function ago(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 3600) return `vor ${Math.max(1, Math.round(d / 60))} Min.`;
  if (d < 86400) return `vor ${Math.round(d / 3600)} Std.`;
  return `vor ${Math.round(d / 86400)} Tg.`;
}
function gradient(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 70) % 360} 70% 35%))`;
}
const initials = (t: string) =>
  t
    .replace(/[([].*?[)\]]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/* ---------- Daten (alles aus der Cloud, nichts davon im Browser gespeichert) ---------- */
interface Data {
  catalog: CatalogRom[];
  covers: Map<string, string>;
  entries: Entry[];
  unlocked: Set<string>;
  err: string;
}

let coverCache: { sig: string; at: number; map: Map<string, string> } = { sig: "", at: 0, map: new Map() };
async function getCovers(catalog: CatalogRom[]) {
  const sig = catalog.map((r) => r.id + (r.cover_path ?? "")).join("|");
  if (coverCache.sig === sig && Date.now() - coverCache.at < 50 * 60_000) return coverCache.map;
  const map = await coverUrls(catalog).catch(() => new Map<string, string>());
  coverCache = { sig, at: Date.now(), map };
  return map;
}

async function load(): Promise<Data> {
  let catalog: CatalogRom[] = [];
  let cloud: CloudGame[] = [];
  let unlocked = new Set<string>();
  let err = "";
  if (signedIn) {
    try {
      [catalog, cloud] = await Promise.all([listCatalog(), listCloudGames()]);
      unlocked = new Set((await listAchievements()).map((a) => a.code));
    } catch (e) {
      err = (e as Error).message;
    }
  }
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const entries: Entry[] = cloud.map((c) => {
    const rom = c.catalog_id ? byId.get(c.catalog_id) : undefined;
    return {
      key: c.game_key,
      title: rom?.title ?? c.title,
      core: rom?.system ?? c.system,
      rom,
      lastPlayed: c.playtime_sec > 0 ? new Date(c.last_played).getTime() : undefined,
      addedAt: new Date(c.added_at ?? c.last_played).getTime(),
      playtime: c.playtime_sec,
    };
  });
  const covers = await getCovers(catalog);
  return { catalog, covers, entries, unlocked, err };
}

function setBackground(d: Data) {
  const last = [...d.entries].filter((e) => e.rom && d.covers.has(e.rom.id)).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
  const url = last?.rom ? d.covers.get(last.rom.id) : undefined;
  bg.style.backgroundImage = `url(${url ?? LOGO})`;
}

/* ---------- Bausteine ---------- */
function artStyle(title: string, cover?: string) {
  return cover ? `background-image:url(${cover})` : `background:${gradient(title)}`;
}

function entryCard(e: Entry, d: Data, sub: string) {
  const cover = e.rom ? d.covers.get(e.rom.id) : undefined;
  const tag = e.rom ? `data-play="${e.rom.id}"` : "disabled";
  return `<button class="card" ${tag} title="${esc(e.title)}">
    <div class="art" style="${artStyle(e.title, cover)}">${cover ? "" : `<span>${esc(initials(e.title))}</span>`}<i class="sys">${esc(CORE_LABELS[e.core] ?? e.core)}</i></div>
    <b>${esc(e.title)}</b><small>${esc(e.rom ? sub : "Nicht mehr im Katalog")}</small></button>`;
}

function catCard(r: CatalogRom, d: Data, sub: string) {
  const cover = d.covers.get(r.id);
  return `<a class="card" href="#/catalog" title="${esc(r.title)}">
    <div class="art" style="${artStyle(r.title, cover)}">${cover ? "" : `<span>${esc(initials(r.title))}</span>`}<i class="sys">${esc(CORE_LABELS[r.system] ?? r.system)}</i></div>
    <b>${esc(r.title)}</b><small>${esc(sub)}</small></a>`;
}

const row = (html: string, empty: string) => (html ? `<div class="scroller">${html}</div>` : `<p class="muted">${empty}</p>`);
const catalogHint = '<a href="#/catalog">Hol dir Spiele aus dem Katalog →</a>';

function header(active: "home" | "library" | "catalog" | "admin") {
  return `<header class="top">
    <a class="brand" href="#/">ROMify</a>
    <nav><a href="#/" class="${active === "home" ? "on" : ""}">Start</a><a href="#/catalog" class="${active === "catalog" ? "on" : ""}">Katalog</a><a href="#/library" class="${active === "library" ? "on" : ""}">Bibliothek</a>${isAdminUser && adminView ? `<a href="#/admin" class="admintab ${active === "admin" ? "on" : ""}">🛡️ Admin</a>` : ""}</nav>
    <div class="acct">${
      isAdminUser
        ? `<button id="adminToggle" class="admintoggle ${adminView ? "is-admin" : "is-user"}" title="Ansicht wechseln: Admin / Benutzer" aria-pressed="${adminView}">${adminView ? "ADMIN" : "USER"}</button>`
        : ""
    }${signedIn ? '<button id="logout">Abmelden</button>' : ""}</div>
  </header>`;
}

/* ---------- Login ---------- */
function renderLogin() {
  bg.style.backgroundImage = `url(${LOGO})`;
  app.innerHTML = `
    <div class="login">
      <img class="login-logo" src="${LOGO}" alt="ROMify – Web-based Emulator" />
      <form id="loginform" class="glass">
        <h2>Willkommen zurück</h2>
        <input name="email" type="email" placeholder="E-Mail" required autocomplete="email" />
        <input name="password" type="password" placeholder="Passwort (min. 6 Zeichen)" required minlength="6" autocomplete="current-password" />
        <div id="loginmsg" class="muted" role="status"></div>
        <button class="primary" type="submit">Anmelden</button>
        <button type="button" id="signup">Neues Konto erstellen</button>
      </form>
    </div>`;
  const form = document.getElementById("loginform") as HTMLFormElement;
  const msg = document.getElementById("loginmsg")!;
  const creds = () => {
    const d = new FormData(form);
    return { email: String(d.get("email")), password: String(d.get("password")) };
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Anmelden …";
    const { error } = await supabase.auth.signInWithPassword(creds());
    if (error) msg.textContent = error.message;
    else {
      signedIn = true;
      await render();
    }
  });
  document.getElementById("signup")!.addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    msg.textContent = "Konto wird erstellt …";
    const { data, error } = await supabase.auth.signUp(creds());
    if (error) msg.textContent = error.message;
    else if (!data.session) msg.textContent = "Bestätigungs-E-Mail gesendet. Bestätige sie und melde dich danach an.";
    else {
      signedIn = true;
      await render();
    }
  });
}

/* ---------- Hauptmenü ---------- */
async function renderHome() {
  const d = await load();
  setBackground(d);
  const recent = d.entries.filter((e) => e.lastPlayed).sort((a, b) => b.lastPlayed! - a.lastPlayed!).slice(0, 12);
  const mine = [...d.entries].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  const inLib = new Set(d.entries.map((e) => e.key));
  const newCat = d.catalog.filter((r) => !inLib.has(r.id)).slice(0, 12);
  const rec = recommend(d.entries, d.catalog);

  app.innerHTML = `${header("home")}
  <main>
    ${d.err ? `<p class="warn">Daten konnten nicht geladen werden: ${esc(d.err)}</p>` : ""}
    <section><h2>Zuletzt gespielt</h2>${row(recent.map((e) => entryCard(e, d, ago(e.lastPlayed!))).join(""), "Noch nichts gespielt. Starte ein Spiel aus deiner Bibliothek.")}</section>
    <section><h2>Meine Spiele</h2>${row(mine.map((e) => entryCard(e, d, ago(e.addedAt))).join(""), `Noch keine Spiele. ${catalogHint}`)}</section>
    <section><h2>Neu im Katalog <a class="more" href="#/catalog">Alle ansehen →</a></h2>${row(newCat.map((r) => catCard(r, d, ago(+new Date(r.created_at)))).join(""), "Es gibt nichts Neues im Katalog.")}</section>
    <section><h2>Empfohlen für dich</h2>${row(rec.map((r) => catCard(r.rom, d, r.reason)).join(""), "Sobald der Katalog gefüllt ist, siehst du hier Empfehlungen.")}</section>
    <section><h2>Erfolge</h2><ul class="ach">${ACHIEVEMENTS.map(
      (a) => `<li class="${d.unlocked.has(a.code) ? "on" : ""}"><b>${d.unlocked.has(a.code) ? "🏆" : "🔒"} ${esc(a.title)}</b><br><span class="muted">${esc(a.desc)}</span></li>`,
    ).join("")}</ul></section>
  </main>
  <footer class="emus">
    <h2>Unterstützte Emulatoren</h2>
    <ul>${supportedEmulators()
      .map((e) => `<li><b>${esc(e.label)}</b><span class="muted">${esc(e.exts.join(" "))}</span></li>`)
      .join("")}</ul>
    <p class="muted">Nicht unterstützt: Nintendo 3DS, PlayStation 2, Switch (im Browser nicht machbar).</p>
  </footer>`;
  wireCommon();
}

/* ---------- Bibliothek (nur Verweise, keine Dateien) ---------- */
async function renderLibrary() {
  const d = await load();
  const cached = await cacheSizes();
  setBackground(d);
  const groups = CORE_ORDER.map((core) => ({
    core,
    games: d.entries.filter((e) => e.core === core).sort((a, b) => a.title.localeCompare(b.title)),
  })).filter((g) => g.games.length);

  app.innerHTML = `${header("library")}
  <main>
    ${d.err ? `<p class="warn">Daten konnten nicht geladen werden: ${esc(d.err)}</p>` : ""}
    <div class="intro"><b>Meine Bibliothek</b><br><span class="muted">Hier stehen deine Spiele nach Emulator. ROMs werden beim Spielen aus dem Katalog geladen. Nur wenn du beim Start „Ja“ wählst, wird die ROM zusätzlich im Browser-Cache gespeichert. Spielstände, Spielzeit und Erfolge liegen in der Datenbank.</span>
      ${
        cached.size
          ? `<br><span class="muted">Im Cache: ${cached.size} ROM${cached.size === 1 ? "" : "s"} · ${fmtMB([...cached.values()].reduce((a, b) => a + b, 0))}</span> <button id="cacheclear" class="morebtn">Cache leeren</button>`
          : ""
      }</div>
    ${
      groups.length
        ? groups
            .map(
              (gr) => `<details class="group" open>
        <summary><b>${esc(CORE_LABELS[gr.core] ?? gr.core)}</b><span class="count">${gr.games.length}</span></summary>
        <ul class="games">${gr.games
          .map((e) => {
            const cover = e.rom ? d.covers.get(e.rom.id) : undefined;
            return `<li><div class="thumb" style="${artStyle(e.title, cover)}"></div>
              <div class="info"><b>${esc(e.title)}</b><br><span class="muted">${esc(CORE_LABELS[e.core] ?? e.core)}${e.playtime ? " · " + fmtTime(e.playtime) : ""}${e.rom ? "" : " · nicht mehr im Katalog"}${cached.has(e.key) ? ' · <span class="badge">💾 im Cache</span>' : ""}</span></div>
              <div class="row">${e.rom ? `<button data-play="${e.rom.id}" class="primary">Spielen</button>` : ""}
              ${cached.has(e.key) ? `<button data-uncache="${e.key}" title="Aus dem Cache entfernen">💾✕</button>` : ""}
              <button data-rm="${e.key}" title="Aus Bibliothek entfernen">✕</button></div></li>`;
          })
          .join("")}</ul></details>`,
            )
            .join("")
        : `<p class="muted">Noch keine Spiele in deiner Bibliothek. ${catalogHint}</p>`
    }
  </main>`;
  wireCommon();
}

/* ---------- Katalog ---------- */
async function renderCatalog() {
  const d = await load();
  setBackground(d);
  const items = d.catalog;
  const inLib = new Set(d.entries.map((e) => e.key));

  const groups = CORE_ORDER.map((core) => ({ core, roms: items.filter((r) => r.system === core) })).filter((g) => g.roms.length);
  app.innerHTML = `${header("catalog")}
  <main>
    <div class="intro"><b>ROM-Katalog</b><br>
      <span class="muted">Hier findest du ausschließlich selbst erstellte oder frei lizenzierte ROMs (Homebrew). Etwas gefunden, das hier nicht hingehört? Nutze „Melden“, wir prüfen es und entfernen es bei Bedarf.</span></div>
    ${d.err ? `<p class="warn">Katalog konnte nicht geladen werden: ${esc(d.err)}</p>` : ""}
    <div class="filters"><input id="q" type="search" placeholder="Katalog durchsuchen …" /></div>
    ${
      groups.length
        ? groups
            .map(
              (gr) => `<details class="group" open><summary><b>${esc(CORE_LABELS[gr.core])}</b><span class="count">${gr.roms.length}</span></summary>
        <ul class="games">${gr.roms
          .map((r) => {
            const cv = d.covers.get(r.id);
            return `<li data-text="${esc((r.title + " " + r.author + " " + (r.description ?? "")).toLowerCase())}">
              <div class="thumb" style="${artStyle(r.title, cv)}"></div>
              <div class="info"><b>${esc(r.title)}</b><br><span class="muted">${esc(r.author)} · ${esc(r.license)} · ${fmtMB(r.size)}</span>
                ${r.description ? `<br><span class="muted">${esc(r.description)}</span>` : ""}</div>
              <div class="row">
                <button data-play="${r.id}" class="primary">Spielen</button>
                ${inLib.has(r.id) ? '<span class="badge">✓ In Bibliothek</span>' : `<button data-catadd="${r.id}" title="Zur Bibliothek hinzufügen">＋</button>`}
                <button data-report="${r.id}" title="Problem melden">⚑</button>
              </div></li>`;
          })
          .join("")}</ul></details>`,
            )
            .join("")
        : '<p class="muted">Der Katalog ist noch leer.</p>'
    }
  </main>`;
  wireCommon();

  document.getElementById("q")?.addEventListener("input", (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>("li[data-text]").forEach((li) => li.classList.toggle("hidden", Boolean(q) && !li.dataset.text!.includes(q)));
  });

  app.querySelectorAll<HTMLElement>("[data-catadd]").forEach((b) =>
    b.addEventListener("click", async () => {
      const rom = items.find((r) => r.id === b.dataset.catadd);
      if (!rom) return;
      b.textContent = "…";
      try {
        await addToLibrary(rom);
        await checkAchievements(0);
        await render();
      } catch (e) {
        b.textContent = "＋";
        alert((e as Error).message);
      }
    }),
  );

  app.querySelectorAll<HTMLElement>("[data-report]").forEach((b) =>
    b.addEventListener("click", async () => {
      const reason = prompt("Was stimmt nicht? (z. B. Urheberrechtsverletzung, defekte Datei)");
      if (!reason?.trim()) return;
      try {
        await reportRom(b.dataset.report!, reason.trim().slice(0, 500));
        alert("Danke, die Meldung wurde gesendet.");
      } catch (e) {
        alert((e as Error).message);
      }
    }),
  );
}

/* ---------- Admin-Tab: ROM hinzufügen (liest Infos aus dem ROM-Header) ---------- */
let adminFlash = "";

async function renderAdmin() {
  if (!(isAdminUser && adminView)) {
    if (location.hash !== "#/catalog") location.hash = "#/catalog";
    else return renderCatalog();
    return;
  }
  const d = await load();
  const reports = await listReports().catch(() => []);
  setBackground(d);
  const items = d.catalog;
  const coreOptions = CORE_ORDER.map((c) => `<option value="${c}">${esc(CORE_LABELS[c])}</option>`).join("");

  app.innerHTML = `${header("admin")}
  <main>
    ${adminFlash ? `<p class="ok">${esc(adminFlash)}</p>` : ""}
    ${d.err ? `<p class="warn">Daten konnten nicht geladen werden: ${esc(d.err)}</p>` : ""}
    <section>
      <h2>ROM hinzufügen</h2>
      <form id="adminform" class="adminform panel">
        <label class="drop">
          <strong>ROM-Datei wählen</strong>
          <span class="muted">Titel, Konsole, Region, Version und Hersteller werden aus dem ROM-Header gelesen (max. 50 MB).</span>
          <input type="file" name="rom" accept="${ACCEPT}" required />
        </label>
        <div id="rominfo" class="rominfo hidden" aria-live="polite"></div>
        <div id="coverbox" class="coverbox hidden"><img id="coverimg" alt="Cover aus der ROM" />
          <label class="check"><input type="checkbox" id="useicon" checked /> Icon aus der ROM als Cover verwenden</label></div>
        <input name="title" placeholder="Titel" required maxlength="120" />
        <input name="author" placeholder="Autor / Studio" required maxlength="120" />
        <label>Lizenz<select name="license" required>${LICENSES.map((l) => `<option>${esc(l)}</option>`).join("")}</select></label>
        <label>Emulator<select name="system">${coreOptions}</select></label>
        <textarea name="description" placeholder="Beschreibung (optional)" maxlength="1000"></textarea>
        <label>Eigenes Cover-Bild (optional, ersetzt das Icon)<input type="file" name="cover" accept="image/*" /></label>
        <label class="check"><input type="checkbox" name="rights" required /> Ich bestätige, dass ich Rechteinhaber bin oder die Datei unter der gewählten Lizenz frei verteilen darf.</label>
        <button class="primary" type="submit">Hochladen</button>
        <div id="adminmsg" class="muted" role="status"></div>
      </form>
    </section>
    ${
      reports.length
        ? `<section><h2>Meldungen <span class="count">${reports.length}</span></h2><ul class="games">${reports
            .map((r) => {
              const rom = items.find((i) => i.id === r.rom_id);
              return `<li><div class="info"><b>${esc(rom?.title ?? "Eintrag")}</b><br><span class="muted">${esc(r.reason)}</span></div>
              <div class="row">${rom ? `<button data-catdel="${rom.id}" title="Eintrag löschen">Löschen</button>` : ""}<button data-dismiss="${r.id}">Erledigt</button></div></li>`;
            })
            .join("")}</ul></section>`
        : ""
    }
    <section>
      <h2>Katalog verwalten <span class="count">${items.length}</span></h2>
      ${
        items.length
          ? `<ul class="games">${items
              .map(
                (r) => `<li><div class="thumb" style="${artStyle(r.title, d.covers.get(r.id))}"></div>
              <div class="info"><b>${esc(r.title)}</b><br><span class="muted">${esc(CORE_LABELS[r.system] ?? r.system)} · ${esc(r.author)} · ${esc(r.license)} · ${fmtMB(r.size)}</span></div>
              <div class="row"><button data-catdel="${r.id}" title="Löschen">✕</button></div></li>`,
              )
              .join("")}</ul>`
          : '<p class="muted">Der Katalog ist noch leer.</p>'
      }
    </section>
  </main>`;
  adminFlash = "";
  wireCommon();

  app.querySelectorAll<HTMLElement>("[data-catdel]").forEach((b) =>
    b.addEventListener("click", async () => {
      const rom = items.find((r) => r.id === b.dataset.catdel);
      if (!rom || !confirm(`„${rom.title}“ endgültig aus dem Katalog löschen?`)) return;
      try {
        await adminDelete(rom);
        await render();
      } catch (e) {
        alert((e as Error).message);
      }
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-dismiss]").forEach((b) =>
    b.addEventListener("click", async () => {
      await dismissReport(b.dataset.dismiss!);
      await render();
    }),
  );

  const form = document.getElementById("adminform") as HTMLFormElement;
  const panel = document.getElementById("rominfo")!;
  const coverBox = document.getElementById("coverbox")!;
  const coverImg = document.getElementById("coverimg") as HTMLImageElement;
  const useIcon = document.getElementById("useicon") as HTMLInputElement;
  let iconBlob: Blob | null = null;
  let iconUrl = "";

  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const AUTO = ["title", "author", "description"];
  // Automatisch gefüllte Felder werden bei einer neuen Datei ersetzt, selbst getippte Werte bleiben.
  const fill = (name: string, val?: string) => {
    if (!val) return;
    const el = field(name);
    if (!el.value || el.dataset.auto === el.value) {
      el.value = val;
      el.dataset.auto = val;
    }
  };
  const showInfo = (file: File, info: RomInfo) => {
    const rows: [string, string | undefined][] = [
      ["Konsole", info.consoleLabel],
      ["Interner Titel", info.title],
      ["Spielcode", info.code],
      ["Hersteller", info.maker],
      ["Region", info.region],
      ["Version", info.version],
      ...info.details,
      ["Dateigröße", fmtMB(file.size)],
      ["SHA-1", info.sha1 ? info.sha1.slice(0, 12) + "…" : undefined],
    ];
    const dup = items.find((r) => r.system === info.core && tidyTitle(info.title, file.name).toLowerCase() === r.title.toLowerCase());
    panel.innerHTML = `<b>${info.headerOk ? "✓ ROM-Header gelesen" : "⚠ Kein gültiger ROM-Header gefunden"}</b>
      <dl>${rows.filter((r) => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v!)}</dd>`).join("")}</dl>
      ${[...info.notes, ...(dup ? [`Ein Eintrag „${dup.title}“ existiert für diese Konsole bereits.`] : [])].map((n) => `<p class="warn">${esc(n)}</p>`).join("")}`;
    panel.classList.remove("hidden");
  };

  form.addEventListener("change", async (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== "rom" || !t.files?.[0]) return;
    const file = t.files[0];
    panel.classList.remove("hidden");
    panel.textContent = "Lese ROM-Header …";
    for (const n of AUTO) {
      const el = field(n);
      if (el.dataset.auto === el.value) el.value = "";
      delete el.dataset.auto;
    }
    const info = await readRomInfo(file);
    showInfo(file, info);
    if (info.core) (field("system") as HTMLSelectElement).value = info.core;
    fill("title", tidyTitle(info.title, file.name));
    fill("author", info.maker);
    fill("description", [info.region && `Region: ${info.region}`, info.version && `Version ${info.version}`, info.code && `Code ${info.code}`].filter(Boolean).join(" · "));
    if (iconUrl) URL.revokeObjectURL(iconUrl);
    iconBlob = null;
    coverBox.classList.add("hidden");
    if (info.iconRgba) {
      try {
        iconBlob = await renderIconCover(info.iconRgba);
        iconUrl = URL.createObjectURL(iconBlob);
        coverImg.src = iconUrl;
        useIcon.checked = true;
        coverBox.classList.remove("hidden");
      } catch {
        /* Cover bleibt optional */
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("adminmsg")!;
    const fd = new FormData(form);
    const rom = fd.get("rom") as File;
    const own = fd.get("cover") as File;
    const cover = own && own.size ? own : iconBlob && useIcon.checked ? new File([iconBlob], "cover.png", { type: "image/png" }) : undefined;
    msg.textContent = "Lade hoch …";
    try {
      await adminUpload({
        title: String(fd.get("title")).trim(),
        author: String(fd.get("author")).trim(),
        license: String(fd.get("license")),
        description: String(fd.get("description") ?? "").trim(),
        system: String(fd.get("system")),
        rom,
        cover,
      });
      adminFlash = `✓ „${String(fd.get("title")).trim()}“ wurde in den Katalog hochgeladen.`;
      await render();
    } catch (err2) {
      msg.textContent = (err2 as Error).message;
    }
  });
}

/* ---------- gemeinsame Aktionen ---------- */
function wireCommon() {
  app.querySelectorAll<HTMLElement>("[data-play]").forEach((b) => b.addEventListener("click", () => void play(b.dataset.play!)));
  app.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Spiel aus deiner Bibliothek entfernen? Spielstände in der Cloud bleiben erhalten.")) return;
      try {
        await removeFromLibrary(b.dataset.rm!);
        await render();
      } catch (e) {
        alert((e as Error).message);
      }
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-uncache]").forEach((b) =>
    b.addEventListener("click", async () => {
      await removeCached(b.dataset.uncache!);
      setPref(b.dataset.uncache!, null); // beim nächsten Start wird erneut gefragt
      await render();
    }),
  );
  document.getElementById("cacheclear")?.addEventListener("click", async () => {
    if (!confirm("Alle gecachten ROMs aus diesem Browser löschen? Spielstände bleiben in der Datenbank.")) return;
    await clearCache();
    for (const e of Object.keys(localStorage)) if (e.startsWith("romify.cache.")) localStorage.removeItem(e);
    await render();
  });
  document.getElementById("logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    signedIn = false;
    await render();
  });
}

/** Ja/Nein-Abfrage im eigenen Dialog (gibt true bei „Ja“ zurück). */
function ask(title: string, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "ask";
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="row"><button value="yes" class="primary" id="askyes">${esc(yes)}</button><button value="no" id="askno">${esc(no)}</button></div></form>`;
    dlg.addEventListener("close", () => {
      resolve(dlg.returnValue === "yes");
      dlg.remove();
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

async function render() {
  if (session) return;
  if (cloudConfigured && !signedIn) {
    adminChecked = false;
    isAdminUser = false;
    return renderLogin();
  }
  if (signedIn && !adminChecked) await refreshAdmin();
  if (location.hash.startsWith("#/admin")) return renderAdmin();
  if (location.hash.startsWith("#/catalog")) return renderCatalog();
  return location.hash.startsWith("#/library") ? renderLibrary() : renderHome();
}

async function checkAchievements(sessionSeconds: number) {
  if (!signedIn) return;
  const cloud = await listCloudGames().catch(() => [] as CloudGame[]);
  const stats = {
    games: cloud.length,
    systems: new Set(cloud.map((c) => c.system)).size,
    totalSeconds: cloud.reduce((n, c) => n + c.playtime_sec, 0) + sessionSeconds,
    sessionSeconds,
  };
  for (const a of ACHIEVEMENTS) if (a.test(stats)) await unlock(a.code).catch(() => undefined);
}

/* ---------- Spielen: ROM kommt aus dem Katalog in den Arbeitsspeicher, nie in den Browser-Speicher ---------- */
async function play(romId: string) {
  app.innerHTML = `
    <div class="player">
      <div class="bar"><button id="back">← Beenden</button><span id="status" class="muted">Lade ROM …</span></div>
      <div id="screen"></div>
    </div>`;
  const status = document.getElementById("status")!;
  const back = document.getElementById("back")!;
  let leave = () => location.reload();
  back.addEventListener("click", () => leave());
  try {
    const catalog = await listCatalog();
    const rom = catalog.find((r) => r.id === romId);
    if (!rom) throw new Error("Dieses Spiel ist nicht mehr im Katalog.");
    await addToLibrary(rom); // sorgt dafür, dass Spielzeit und Spielstand gespeichert werden
    // ROM aus dem Cache, sonst aus dem Katalog. Gespeichert wird nur nach ausdrücklichem „Ja“.
    const hit = await getCached(rom.id);
    let blob: Blob;
    if (hit && hit.size === rom.size) {
      blob = hit.blob;
      status.textContent = "ROM aus dem Cache …";
    } else {
      if (hit) await removeCached(rom.id); // veraltet (Katalogeintrag wurde ersetzt)
      let pref = getPref(rom.id);
      if (!pref) {
        const yes = await ask(
          "ROM im Cache speichern?",
          `„${rom.title}“ (${fmtMB(rom.size)}) im Browser-Cache speichern? Dann startet das Spiel schneller und spart Datenvolumen, und du kannst es später ohne erneuten Download spielen. Bei „Nein“ wird die ROM nur kurz im Arbeitsspeicher gehalten. Spielstände liegen in jedem Fall in der Datenbank.`,
          "Ja, speichern",
          "Nein",
        );
        pref = yes ? "yes" : "no";
        setPref(rom.id, pref);
      }
      status.textContent = "Lade ROM …";
      blob = await downloadCatalogRom(rom);
      if (pref === "yes") {
        const ok = await putCached(rom.id, blob);
        if (!ok) status.textContent = "Cache nicht verfügbar, die ROM wird nur für diese Sitzung verwendet.";
      }
    }
    status.textContent = "Starte …";
    session = await startGame({ key: rom.id, title: rom.title, core: rom.system }, blob, document.getElementById("screen")!, signedIn, (m) => (status.textContent = m));
    leave = async () => {
      const secs = session?.seconds() ?? 0;
      status.textContent = "Speichere …";
      await checkAchievements(secs).catch(() => undefined);
      if (session) await session.stop(); // lädt die Seite neu
      else location.reload();
    };
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

async function main() {
  if (cloudConfigured) {
    signedIn = Boolean(await currentUser());
    supabase.auth.onAuthStateChange((_e, s) => {
      const now = Boolean(s?.user);
      if (now !== signedIn) {
        signedIn = now;
        void render();
      }
    });
  }
  window.addEventListener("hashchange", () => void render());
  app.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("#adminToggle")) return;
    adminView = !adminView;
    try {
      localStorage.setItem("romify.adminView", adminView ? "admin" : "user");
    } catch {
      /* ohne Speicher: nur für diese Sitzung */
    }
    void render();
  });
  await render();
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => undefined);
  }
}

void main();
