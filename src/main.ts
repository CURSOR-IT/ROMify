import "./style.css";
import { ACHIEVEMENTS } from "./achievements";
import {
  cloudConfigured,
  countPending,
  currentUser,
  isAdmin,
  listAchievements,
  listCloudGames,
  listProfiles,
  myApproval,
  setApproved,
  supabase,
  unlock,
  type CloudGame,
} from "./cloud";
import { startGame, type Session } from "./emulator";
import { getLocal, listLocal, putLocal, removeLocal, sha1, type LocalGame } from "./library";
import { recommend } from "./recommend";
import { renderIconCover } from "./romCover";
import { readRomInfo, tidyTitle } from "./romInfo";
import { ACCEPT, CORE_LABELS, CORE_ORDER, supportedEmulators, systemFor } from "./systems";

const app = document.getElementById("app")!;
const bg = document.createElement("div");
bg.id = "bg";
document.body.prepend(bg);

const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}logo.jpg`;
let session: Session | null = null;
let signedIn = false;
let urls: string[] = [];

// Admin: Nur echte Admins (Tabelle `admins`) sehen den Umschalter. Die Rechte erzwingt die Datenbank.
let isAdminUser = false;
let adminChecked = false;
let approved = true; // false = Konto wartet auf Freischaltung
let pendingCount = 0; // offene Registrierungen (nur für Admins)
let adminView = (() => {
  try {
    return localStorage.getItem("romify.adminView") !== "user";
  } catch {
    return true;
  }
})();
async function refreshAdmin() {
  isAdminUser = signedIn ? await isAdmin().catch(() => false) : false;
  approved = !signedIn || isAdminUser ? true : (await myApproval().catch(() => "approved" as const)) === "approved";
  adminChecked = true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const blobUrl = (b: Blob) => {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
};
const resetUrls = () => {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
};
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

/* ---------- Daten: ROMs liegen nur lokal im Browser, alles andere in der Datenbank ---------- */
interface Data {
  local: LocalGame[];
  cloud: CloudGame[];
  unlocked: Set<string>;
}

async function load(): Promise<Data> {
  const local = await listLocal();
  let cloud: CloudGame[] = [];
  let unlocked = new Set<string>();
  if (signedIn) {
    try {
      cloud = await listCloudGames();
      unlocked = new Set((await listAchievements()).map((a) => a.code));
    } catch (e) {
      console.warn(e);
    }
  }
  const byKey = new Map(cloud.map((c) => [c.game_key, c]));
  for (const g of local) {
    const c = byKey.get(g.key);
    if (c && c.playtime_sec > 0) g.lastPlayed = Math.max(g.lastPlayed ?? 0, new Date(c.last_played).getTime()) || undefined;
  }
  return { local, cloud, unlocked };
}

function setBackground(local: LocalGame[]) {
  const withCover = local.filter((g) => g.cover).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  bg.style.backgroundImage = `url(${withCover[0]?.cover ? blobUrl(withCover[0].cover) : LOGO})`;
}

const artStyle = (g: LocalGame) => (g.cover ? `background-image:url(${blobUrl(g.cover)})` : `background:${gradient(g.title)}`);

function card(g: LocalGame, sub: string) {
  return `<button class="card" data-play="${g.key}" title="${esc(g.title)}">
    <div class="art" style="${artStyle(g)}">${g.cover ? "" : `<span>${esc(initials(g.title))}</span>`}<i class="sys">${esc(CORE_LABELS[g.core] ?? g.core)}</i></div>
    <b>${esc(g.title)}</b><small>${esc(sub)}</small></button>`;
}

const row = (html: string, empty: string) => (html ? `<div class="scroller">${html}</div>` : `<p class="muted">${empty}</p>`);
const sourcesHint = '<a href="#/library">Eigene ROM hinzufügen</a> oder <a href="#/sources">legale Quellen ansehen →</a>';

function header(active: "home" | "library" | "sources" | "admin") {
  const on = (k: string) => (active === k ? "on" : "");
  return `<header class="top">
    <a class="brand" href="#/">ROMify</a>
    <nav><a href="#/" class="${on("home")}">Start</a><a href="#/library" class="${on("library")}">Bibliothek</a><a href="#/sources" class="${on("sources")}">Quellen</a>${
      isAdminUser && adminView ? `<a href="#/admin" class="admintab ${on("admin")}">🛡️ Admin${pendingCount ? ` <span class="pending">${pendingCount}</span>` : ""}</a>` : ""
    }</nav>
    <div class="acct">${
      isAdminUser
        ? `<button id="adminToggle" class="admintoggle ${adminView ? "is-admin" : "is-user"}" title="Ansicht wechseln: Admin / Benutzer" aria-pressed="${adminView}">${adminView ? "ADMIN" : "USER"}</button>`
        : ""
    }${signedIn ? '<button id="logout">Abmelden</button>' : ""}</div>
  </header>`;
}

const dropHtml = `<label class="drop">
  <input id="file" type="file" accept="${ACCEPT}" multiple hidden />
  <strong>+ Eigene ROM-Datei hinzufügen</strong>
  <span class="muted">Nur Dateien, an denen du die Rechte hast. Sie bleiben ausschließlich in deinem Browser und werden nie hochgeladen.</span>
  <span id="msg" class="muted" role="status"></span>
</label>`;

/* ---------- Login / Registrieren (zwei klar getrennte Reiter) ---------- */
let authEmail = "";

function authError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-Mail oder Passwort stimmt nicht. Hast du noch kein Konto? Wechsle zu „Registrieren“.";
  if (m.includes("not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse. Den Link findest du in der Mail, die wir dir geschickt haben.";
  if (m.includes("already registered")) return "Diese E-Mail ist schon registriert. Bitte melde dich an.";
  if (m.includes("rate limit") || m.includes("too many")) return "Zu viele Versuche. Bitte warte einen Moment und versuche es dann noch einmal.";
  if (m.includes("password") && m.includes("least")) return "Das Passwort ist zu kurz.";
  return msg;
}

function renderLogin(mode: "in" | "up" = "in", pending = "") {
  bg.style.backgroundImage = `url(${LOGO})`;
  const logo = `<img class="login-logo" src="${LOGO}" alt="ROMify – Web-based Emulator" />`;

  if (pending) {
    app.innerHTML = `<div class="login">${logo}
      <div class="glass up">
        <h2>📬 Fast geschafft!</h2>
        <p>Wir haben eine Bestätigungs-E-Mail an <b>${esc(pending)}</b> geschickt. Klicke auf den Link in der Mail und melde dich danach an. Bevor du spielen kannst, muss ein Admin dein Konto noch freischalten.</p>
        <p class="muted">Nichts angekommen? Schau auch im Spam-Ordner nach.</p>
        <button id="togin" class="primary">Zur Anmeldung</button>
      </div></div>`;
    document.getElementById("togin")!.addEventListener("click", () => {
      authEmail = pending;
      renderLogin("in");
    });
    return;
  }

  const up = mode === "up";
  const pw = (name: string, label: string, auto: string, min: number) => `
    <label class="field">${label}
      <span class="pwrow"><input name="${name}" type="password" required minlength="${min}" autocomplete="${auto}" />
      <button type="button" class="eye" data-eye aria-label="Passwort anzeigen">👁</button></span>
    </label>`;
  app.innerHTML = `
    <div class="login">${logo}
      <div class="glass ${up ? "up" : "in"}">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" data-mode="in" aria-selected="${!up}">Anmelden</button>
          <button type="button" role="tab" data-mode="up" aria-selected="${up}">Registrieren</button>
        </div>
        <form id="authform" novalidate>
          <h2>${up ? "Konto erstellen" : "Willkommen zurück"}</h2>
          <p class="muted">${up ? "Neu hier? Erstelle kostenlos ein Konto, damit deine Spielstände und Erfolge auf jedem Gerät gespeichert werden. Ein Admin schaltet dein Konto danach frei." : "Melde dich mit deinem bestehenden Konto an."}</p>
          <label class="field">E-Mail<input name="email" type="email" required autocomplete="email" value="${esc(authEmail)}" /></label>
          ${pw("password", up ? "Passwort wählen (mind. 8 Zeichen)" : "Passwort", up ? "new-password" : "current-password", up ? 8 : 1)}
          ${up ? pw("password2", "Passwort wiederholen", "new-password", 8) : ""}
          <div id="authmsg" class="authmsg" role="alert"></div>
          <button class="primary" type="submit">${up ? "Konto erstellen" : "Anmelden"}</button>
          <p class="switch muted">${up ? 'Schon registriert? <a href="#" id="switch">Zur Anmeldung</a>' : 'Noch kein Konto? <a href="#" id="switch">Jetzt registrieren</a>'}</p>
        </form>
      </div>
    </div>`;

  const form = document.getElementById("authform") as HTMLFormElement;
  const msg = document.getElementById("authmsg")!;
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const go = (m: "in" | "up") => {
    authEmail = field("email").value.trim();
    renderLogin(m);
  };
  app.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => go(b.dataset.mode as "in" | "up")));
  document.getElementById("switch")!.addEventListener("click", (e) => {
    e.preventDefault();
    go(up ? "in" : "up");
  });
  app.querySelectorAll<HTMLElement>("[data-eye]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = b.parentElement!.querySelector("input")!;
      input.type = input.type === "password" ? "text" : "password";
      b.setAttribute("aria-label", input.type === "password" ? "Passwort anzeigen" : "Passwort verbergen");
    }),
  );
  const show = (text: string, switchTo?: "in" | "up", label?: string) => {
    msg.innerHTML = esc(text) + (switchTo ? ` <a href="#" id="msgswitch">${esc(label ?? "")}</a>` : "");
    msg.classList.toggle("on", Boolean(text));
    document.getElementById("msgswitch")?.addEventListener("click", (e) => {
      e.preventDefault();
      go(switchTo!);
    });
  };
  show("");
  field("email").focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = field("email").value.trim();
    const password = field("password").value;
    if (!email || !field("email").checkValidity()) return show("Bitte gib eine gültige E-Mail-Adresse ein.");
    if (!password) return show("Bitte gib dein Passwort ein.");
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true;
    try {
      if (up) {
        if (password.length < 8) return show("Das Passwort braucht mindestens 8 Zeichen.");
        if (password !== field("password2").value) return show("Die beiden Passwörter sind nicht gleich.");
        show("Konto wird erstellt …");
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return show(authError(error.message), /already/i.test(error.message) ? "in" : undefined, "Zur Anmeldung");
        // Bei aktivierter E-Mail-Bestätigung meldet Supabase eine bereits vergebene E-Mail ohne Fehler (leere identities).
        if (data.user && data.user.identities?.length === 0) return show("Diese E-Mail ist schon registriert.", "in", "Jetzt anmelden");
        if (!data.session) return renderLogin("in", email);
        signedIn = true;
        await render();
      } else {
        show("Anmelden …");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return show(authError(error.message), /invalid login/i.test(error.message) ? "up" : undefined, "Registrieren");
        signedIn = true;
        await render();
      }
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Konto wartet auf Freischaltung ---------- */
function renderPending() {
  bg.style.backgroundImage = `url(${LOGO})`;
  app.innerHTML = `<div class="login">
    <img class="login-logo" src="${LOGO}" alt="ROMify – Web-based Emulator" />
    <div class="glass up">
      <h2>⏳ Freischaltung ausstehend</h2>
      <p>Dein Konto wurde erstellt, muss aber noch von einem Admin freigeschaltet werden. Das kann einen Moment dauern.</p>
      <p class="muted">Du kannst diese Seite offen lassen oder später wiederkommen und erneut prüfen.</p>
      <button id="recheck" class="primary">Erneut prüfen</button>
      <button id="logout">Abmelden</button>
    </div></div>`;
  document.getElementById("recheck")!.addEventListener("click", async () => {
    adminChecked = false;
    await render();
  });
  wireCommon();
}

/* ---------- Hauptmenü ---------- */
async function renderHome() {
  const d = await load();
  resetUrls();
  setBackground(d.local);
  const recent = d.local.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed! - a.lastPlayed!).slice(0, 12);
  const fresh = [...d.local].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  const rec = recommend(d.local, d.cloud);

  app.innerHTML = `${header("home")}
  <main>
    ${dropHtml}
    <section><h2>Zuletzt gespielt</h2>${row(recent.map((g) => card(g, ago(g.lastPlayed!))).join(""), "Noch nichts gespielt. Starte ein Spiel aus deiner Bibliothek.")}</section>
    <section><h2>Neu hinzugefügt</h2>${row(fresh.map((g) => card(g, ago(g.addedAt))).join(""), `Noch keine Spiele. ${sourcesHint}`)}</section>
    <section><h2>Empfohlen für dich</h2>${row(rec.map((r) => card(r.game, r.reason)).join(""), "Spiele ein paar Titel, dann passen wir die Empfehlungen an dich an.")}</section>
    ${
      signedIn
        ? `<section><h2>Erfolge</h2><ul class="ach">${ACHIEVEMENTS.map(
            (a) => `<li class="${d.unlocked.has(a.code) ? "on" : ""}"><b>${d.unlocked.has(a.code) ? "🏆" : "🔒"} ${esc(a.title)}</b><br><span class="muted">${esc(a.desc)}</span></li>`,
          ).join("")}</ul></section>`
        : ""
    }
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

/* ---------- Bibliothek ---------- */
async function renderLibrary() {
  const d = await load();
  resetUrls();
  setBackground(d.local);
  const localKeys = new Set(d.local.map((g) => g.key));
  const cloudOnly = d.cloud.filter((c) => !localKeys.has(c.game_key));
  const byKey = new Map(d.cloud.map((c) => [c.game_key, c]));
  const groups = CORE_ORDER.map((core) => ({ core, games: d.local.filter((g) => g.core === core).sort((a, b) => a.title.localeCompare(b.title)) })).filter((g) => g.games.length);

  app.innerHTML = `${header("library")}
  <main>
    ${dropHtml}
    <h2>Meine ROMs nach Emulator <span class="muted">(${d.local.length})</span></h2>
    ${
      groups.length
        ? groups
            .map(
              (gr) => `<details class="group" open>
        <summary><b>${esc(CORE_LABELS[gr.core] ?? gr.core)}</b><span class="count">${gr.games.length}</span></summary>
        <ul class="games">${gr.games
          .map((g) => {
            const c = byKey.get(g.key);
            return `<li><div class="thumb" style="${artStyle(g)}"></div>
              <div class="info"><b>${esc(g.title)}</b><br><span class="muted">${esc(g.systemLabel)} · ${fmtMB(g.file.size)}${c && c.playtime_sec ? " · " + fmtTime(c.playtime_sec) : ""}</span></div>
              <div class="row"><button data-play="${g.key}" class="primary">Spielen</button>
              <button data-cover="${g.key}" title="Eigenes Cover wählen">🖼</button>
              <button data-del="${g.key}" title="Aus dem Browser entfernen">✕</button></div></li>`;
          })
          .join("")}</ul></details>`,
            )
            .join("")
        : `<p class="muted">Noch keine ROMs im Browser. ${sourcesHint}</p>`
    }
    ${
      cloudOnly.length
        ? `<h2>Auf anderen Geräten gespielt</h2>
      <p class="muted">Füge dieselbe ROM-Datei auf diesem Gerät hinzu, dann wird dein Spielstand automatisch geladen.</p>
      <ul class="games">${cloudOnly
        .map((c) => `<li><div class="info"><b>${esc(c.title)}</b><br><span class="muted">${esc(CORE_LABELS[c.system] ?? c.system)} · ${fmtTime(c.playtime_sec)}</span></div><span class="muted">ROM fehlt</span></li>`)
        .join("")}</ul>`
        : ""
    }
  </main>`;
  wireCommon();
}

/* ---------- Quellen: nur legale Anlaufstellen ---------- */
function renderSources() {
  resetUrls();
  bg.style.backgroundImage = `url(${LOGO})`;
  const link = (href: string, name: string, text: string) =>
    `<li><div class="info"><b><a href="${href}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a></b><br><span class="muted">${esc(text)}</span></div></li>`;
  app.innerHTML = `${header("sources")}
  <main>
    <div class="intro"><b>Woher bekomme ich ROMs?</b><br>
      <span class="muted">ROMify liefert keine Spiele mit. Du brauchst Dateien, an denen du die Rechte hast. Seiten, die urheberrechtlich geschützte Spiele ohne Erlaubnis verbreiten, verlinken wir nicht.</span></div>
    <section><h2>✅ Frei und legal</h2>
      <ul class="games">
        ${link("https://hh.gbdev.io/", "Homebrew Hub", "Selbst entwickelte Spiele für Game Boy und Game Boy Color, mit Angabe von Autor und Lizenz.")}
        ${link("https://pdroms.de/", "PDRoms", "Homebrew und freie Spiele für viele Konsolen, von den Autoren zum Download freigegeben.")}
        ${link("https://itch.io/", "itch.io", "Viele Entwickler veröffentlichen dort kostenlose Homebrew-Spiele, zum Beispiel für Game Boy Advance. Suche nach dem Tag der Konsole.")}
      </ul>
      <p class="muted">Prüfe vor dem Spielen die Lizenz des jeweiligen Spiels. Die Angaben der Autoren gelten.</p>
    </section>
    <section><h2>📀 Deine eigenen Spielmodule</h2>
      <div class="panel"><p>Besitzt du Spiele auf Modulen oder Discs, kannst du davon für den privaten Gebrauch selbst eine Sicherung erstellen. Ob das erlaubt ist, hängt vom Land und vom Kopierschutz ab. In Deutschland ist das Umgehen eines Kopierschutzes in der Regel verboten, informiere dich also vorher.</p></div>
    </section>
    <section><h2>🔒 So geht ROMify mit deinen Dateien um</h2>
      <ul class="games">
        <li><div class="info"><b>Nur in deinem Browser</b><br><span class="muted">ROMs werden nie hochgeladen. Sie liegen lokal bei dir und verschwinden, wenn du sie entfernst oder die Browserdaten löschst.</span></div></li>
        <li><div class="info"><b>In der Datenbank</b><br><span class="muted">Nur Spielstände, Spielzeit, Erfolge und die Titel deiner Spiele. Damit kannst du auf jedem Gerät weiterspielen, sobald du dort dieselbe ROM-Datei hinzufügst.</span></div></li>
      </ul>
    </section>
  </main>`;
  wireCommon();
}

/* ---------- Admin: Registrierungen freischalten ---------- */
async function renderAdmin() {
  if (!(isAdminUser && adminView)) {
    location.hash = "#/";
    return;
  }
  const profiles = await listProfiles().catch(() => []);
  const me = await currentUser();
  const waiting = profiles.filter((p) => !p.approved);
  const members = profiles.filter((p) => p.approved && p.user_id !== me?.id);
  const when = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  resetUrls();
  bg.style.backgroundImage = `url(${LOGO})`;

  app.innerHTML = `${header("admin")}
  <main>
    <section>
      <h2>Registrierungen <span class="count">${waiting.length}</span></h2>
      ${
        waiting.length
          ? `<ul class="games">${waiting
              .map(
                (u) => `<li><div class="info"><b>${esc(u.email ?? "Unbekannt")}</b><br><span class="muted">registriert am ${when(u.created_at)}</span></div>
              <div class="row"><button data-approve="${u.user_id}" class="primary">Freischalten</button></div></li>`,
              )
              .join("")}</ul>`
          : '<p class="muted">Keine offenen Anfragen. 🎉</p>'
      }
    </section>
    ${
      members.length
        ? `<section><details class="group"><summary><b>Freigeschaltete Nutzer</b><span class="count">${members.length}</span></summary><ul class="games">${members
            .map(
              (u) => `<li><div class="info"><b>${esc(u.email ?? "Unbekannt")}</b><br><span class="muted">seit ${when(u.decided_at ?? u.created_at)}</span></div>
            <div class="row"><button data-block="${u.user_id}" title="Zugang sperren">Sperren</button></div></li>`,
            )
            .join("")}</ul></details></section>`
        : ""
    }
  </main>`;
  wireCommon();
  app.querySelectorAll<HTMLElement>("[data-approve]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.textContent = "…";
      try {
        await setApproved(b.dataset.approve!, true);
        await render();
      } catch (e) {
        b.textContent = "Freischalten";
        alert((e as Error).message);
      }
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-block]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Zugang dieses Nutzers sperren? Er sieht dann wieder die Freischaltungs-Seite.")) return;
      try {
        await setApproved(b.dataset.block!, false);
        await render();
      } catch (e) {
        alert((e as Error).message);
      }
    }),
  );
}

/* ---------- gemeinsame Aktionen ---------- */
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

const OWN_KEY = "romify.ownRomsConfirmed";
const ownConfirmed = () => {
  try {
    return localStorage.getItem(OWN_KEY) === "1";
  } catch {
    return false;
  }
};

async function addFiles(files: File[], msg: HTMLElement | null) {
  if (!files.length) return;
  if (!ownConfirmed()) {
    const ok = await ask(
      "Eigene ROMs hinzufügen",
      "Ich bestätige, dass ich an den ausgewählten Dateien die Rechte besitze (zum Beispiel selbst erstellte Sicherungen meiner eigenen Spiele oder frei lizenzierte Homebrew). Die Dateien bleiben nur in meinem Browser.",
      "Bestätigen",
      "Abbrechen",
    );
    if (!ok) return;
    try {
      localStorage.setItem(OWN_KEY, "1");
    } catch {
      /* wird beim nächsten Mal erneut gefragt */
    }
  }
  const skipped: string[] = [];
  let added = 0;
  for (const f of files) {
    const sys = systemFor(f.name);
    if (!sys) {
      skipped.push(f.name);
      continue;
    }
    if (msg) msg.textContent = `Lese ${f.name} …`;
    const info = await readRomInfo(f); // Titel, Konsole und (bei DS) Icon stammen aus dem ROM-Header
    const key = info.sha1 || (await sha1(f));
    const old = await getLocal(key);
    const cover = old?.cover ?? (info.iconRgba ? await renderIconCover(info.iconRgba).catch(() => undefined) : undefined);
    await putLocal({
      ...(old ?? {}),
      key,
      title: old?.title ?? tidyTitle(info.title, f.name),
      core: info.core ?? sys.core,
      systemLabel: info.consoleLabel ?? sys.label,
      filename: f.name,
      file: f,
      addedAt: old?.addedAt ?? Date.now(),
      cover,
    });
    added++;
  }
  if (msg && skipped.length) msg.textContent = `Nicht unterstützt: ${skipped.join(", ")} (ZIP-Dateien bitte zuerst entpacken)`;
  await checkAchievements(0);
  if (added || !skipped.length) await render();
}

function wireCommon() {
  const msg = document.getElementById("msg");
  document.getElementById("file")?.addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void addFiles(files, msg);
  });
  app.querySelectorAll<HTMLElement>("[data-play]").forEach((b) => b.addEventListener("click", () => void play(b.dataset.play!)));
  app.querySelectorAll<HTMLElement>("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("ROM aus dem Browser entfernen? Spielstände in der Datenbank bleiben erhalten.")) return;
      await removeLocal(b.dataset.del!);
      await render();
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-cover]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const f = input.files?.[0];
        const g = await getLocal(b.dataset.cover!);
        if (f && g) {
          await putLocal({ ...g, cover: f });
          await render();
        }
      };
      input.click();
    }),
  );
  document.getElementById("logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    signedIn = false;
    await render();
  });
}

let renderSeq = 0;
/** Zeigt beim Seitenwechsel einen Drehkreis in der Mitte, bis die Daten da sind. */
async function render() {
  if (session) return;
  const mine = ++renderSeq;
  app.classList.add("busy");
  try {
    await renderRoute();
  } finally {
    if (mine === renderSeq) app.classList.remove("busy");
  }
}

async function renderRoute() {
  if (session) return;
  if (cloudConfigured && !signedIn) {
    adminChecked = false;
    isAdminUser = false;
    return renderLogin();
  }
  if (signedIn && !adminChecked) await refreshAdmin();
  if (signedIn && !approved) return renderPending();
  if (isAdminUser) pendingCount = await countPending().catch(() => 0);
  if (location.hash.startsWith("#/admin")) return renderAdmin();
  if (location.hash.startsWith("#/sources")) return renderSources();
  return location.hash.startsWith("#/library") ? renderLibrary() : renderHome();
}

async function checkAchievements(sessionSeconds: number) {
  if (!signedIn) return;
  const [local, cloud] = await Promise.all([listLocal(), listCloudGames().catch(() => [] as CloudGame[])]);
  const stats = {
    games: local.length,
    systems: new Set(local.map((g) => g.core)).size,
    totalSeconds: cloud.reduce((n, c) => n + c.playtime_sec, 0) + sessionSeconds,
    sessionSeconds,
  };
  for (const a of ACHIEVEMENTS) if (a.test(stats)) await unlock(a.code).catch(() => undefined);
}

/* ---------- Spielen: ROM kommt aus dem lokalen Browser-Speicher ---------- */
async function play(key: string) {
  const game = await getLocal(key);
  if (!game) return;
  game.lastPlayed = Date.now();
  await putLocal(game);
  resetUrls();
  app.innerHTML = `
    <div class="player">
      <div class="bar"><button id="back">← Beenden</button><span id="status" class="muted"></span></div>
      <div id="screen"></div>
      <div id="loading" class="loading" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <p id="loadmsg">Spiel wird vorbereitet …</p>
      </div>
    </div>`;
  const status = document.getElementById("status")!;
  const loading = document.getElementById("loading")!;
  const msgEl = document.getElementById("loadmsg")!;
  const setLoad = (msg: string) => {
    loading.classList.remove("hidden");
    msgEl.textContent = msg;
  };
  const hideLoad = () => loading.classList.add("hidden");
  const fail = (msg: string) => {
    loading.classList.remove("hidden");
    loading.classList.add("error");
    loading.innerHTML = `<p class="errmsg">⚠️ ${esc(msg)}</p><button id="errback" class="primary">Zurück</button>`;
    document.getElementById("errback")!.addEventListener("click", () => location.reload());
  };

  let leave = () => location.reload();
  document.getElementById("back")!.addEventListener("click", () => leave());
  let ready = false;
  let slowTimer = 0;
  let giveUpTimer = 0;
  const onReady = () => {
    ready = true;
    window.clearTimeout(slowTimer);
    window.clearTimeout(giveUpTimer);
    hideLoad();
  };

  try {
    setLoad(signedIn ? "Spielstand wird geladen …" : "Spiel wird geladen …");
    session = await startGame(
      { key: game.key, title: game.title, core: game.core },
      game.file,
      document.getElementById("screen")!,
      signedIn,
      (m) => (loading.classList.contains("hidden") ? (status.textContent = m) : setLoad(m)),
      onReady,
    );
    if (!ready) {
      setLoad("Emulator wird gestartet … (beim ersten Mal wird der Emulator-Kern geladen)");
      slowTimer = window.setTimeout(() => !ready && setLoad("Das dauert länger als üblich. Bitte noch einen Moment Geduld …"), 25_000);
      giveUpTimer = window.setTimeout(() => hideLoad(), 90_000); // danach zeigt der Emulator seine eigenen Meldungen
    }
    leave = async () => {
      const secs = session?.seconds() ?? 0;
      setLoad("Spielstand wird gespeichert … bitte kurz warten");
      await checkAchievements(secs).catch(() => undefined);
      if (session) await session.stop(); // lädt die Seite neu
      else location.reload();
    };
  } catch (e) {
    fail((e as Error).message);
  }
}

async function main() {
  if (cloudConfigured) {
    signedIn = Boolean(await currentUser());
    supabase.auth.onAuthStateChange((_e, s) => {
      const now = Boolean(s?.user);
      if (now !== signedIn) {
        signedIn = now;
        adminChecked = false;
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
