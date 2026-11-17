import "./style.css";
import { ACHIEVEMENTS } from "./achievements";
import {
  cloudConfigured,
  currentUser,
  listAchievements,
  downloadCover,
  downloadRom,
  listCloudGames,
  supabase,
  unlock,
  uploadRom,
  type CloudGame,
} from "./cloud";
import { startGame, type Session } from "./emulator";
import { getLocal, listLocal, putLocal, removeLocal, sha1, type LocalGame } from "./library";
import { recommend } from "./recommend";
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
    if (c) g.lastPlayed = Math.max(g.lastPlayed ?? 0, new Date(c.last_played).getTime()) || undefined;
  }
  return { local, cloud, unlocked };
}

function setBackground(local: LocalGame[]) {
  const withCover = local.filter((g) => g.cover).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  bg.style.backgroundImage = `url(${withCover[0]?.cover ? blobUrl(withCover[0].cover) : LOGO})`;
}

function card(g: LocalGame, sub: string) {
  const art = g.cover
    ? `background-image:url(${blobUrl(g.cover)})`
    : `background:${gradient(g.title)}`;
  return `<button class="card" data-play="${g.key}" title="${esc(g.title)}">
    <div class="art" style="${art}">${g.cover ? "" : `<span>${esc(initials(g.title))}</span>`}<i class="sys">${esc(CORE_LABELS[g.core] ?? g.core)}</i></div>
    <b>${esc(g.title)}</b><small>${esc(sub)}</small></button>`;
}

const row = (html: string, empty: string) => (html ? `<div class="scroller">${html}</div>` : `<p class="muted">${empty}</p>`);

function header(active: "home" | "library") {
  return `<header class="top">
    <a class="brand" href="#/">ROMify</a>
    <nav><a href="#/" class="${active === "home" ? "on" : ""}">Start</a><a href="#/library" class="${active === "library" ? "on" : ""}">Bibliothek</a></nav>
    <div>${signedIn ? '<button id="logout">Abmelden</button>' : ""}</div>
  </header>`;
}

const addButton = `<label class="drop">
  <input id="file" type="file" accept="${ACCEPT}" multiple hidden />
  <strong>+ ROM hinzufügen</strong>
  <span class="muted">Dateien bleiben im Browser. Optional sicherst du sie privat in deiner Cloud (nur für dich sichtbar).</span>
  <span id="msg" class="muted"></span>
</label>`;

/* ---------- Login ---------- */
function renderLogin() {
  resetUrls();
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
  const { local, cloud, unlocked } = await load();
  resetUrls();
  setBackground(local);
  const recent = [...local].filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed! - a.lastPlayed!).slice(0, 12);
  const fresh = [...local].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  const rec = recommend(local, cloud);

  app.innerHTML = `${header("home")}
  <main>
    ${addButton}
    <section><h2>Zuletzt gespielt</h2>${row(recent.map((g) => card(g, ago(g.lastPlayed!))).join(""), "Noch nichts gespielt. Starte ein Spiel aus deiner Bibliothek.")}</section>
    <section><h2>Neu hinzugefügt</h2>${row(fresh.map((g) => card(g, ago(g.addedAt))).join(""), "Füge oben deine erste ROM hinzu.")}</section>
    <section><h2>Empfohlen für dich</h2>
      ${row(rec.games.map((r) => card(r.game, r.reason)).join(""), "Spiele ein paar Titel, dann passen wir die Empfehlungen an dich an.")}
      ${rec.missing
        .map(
          (m) => `<div class="suggest"><b>Mehr aus der ${esc(m.seriesLabel)}-Reihe</b>
          <div class="chips">${m.titles.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
          <span class="muted">Nur Titelvorschläge. ROMs musst du selbst besitzen und hinzufügen.</span></div>`,
        )
        .join("")}
    </section>
    ${
      signedIn
        ? `<section><h2>Erfolge</h2><ul class="ach">${ACHIEVEMENTS.map(
            (a) => `<li class="${unlocked.has(a.code) ? "on" : ""}"><b>${unlocked.has(a.code) ? "🏆" : "🔒"} ${esc(a.title)}</b><br><span class="muted">${esc(a.desc)}</span></li>`,
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
  const { local, cloud } = await load();
  resetUrls();
  setBackground(local);
  const localKeys = new Set(local.map((g) => g.key));
  const cloudOnly = cloud.filter((c) => !localKeys.has(c.game_key));
  const byKey = new Map(cloud.map((c) => [c.game_key, c]));

  const groups = CORE_ORDER.map((core) => ({ core, games: local.filter((g) => g.core === core).sort((a, b) => a.title.localeCompare(b.title)) })).filter((g) => g.games.length);

  app.innerHTML = `${header("library")}
  <main>
    ${addButton}
    <h2>Meine ROMs nach Emulator <span class="muted">(${local.length})</span></h2>
    ${
      groups.length
        ? groups
            .map(
              (gr) => `<details class="group" open>
        <summary><b>${esc(CORE_LABELS[gr.core])}</b><span class="count">${gr.games.length}</span></summary>
        <ul class="games">${gr.games
          .map((g) => {
            const c = byKey.get(g.key);
            return `<li><div class="thumb" style="${g.cover ? `background-image:url(${blobUrl(g.cover)})` : `background:${gradient(g.title)}`}"></div>
              <div class="info"><b>${esc(g.title)}</b><br><span class="muted">${esc(g.systemLabel)}${c ? " · " + fmtTime(c.playtime_sec) : ""}${c?.rom_path ? ' · <span class="badge">☁ gesichert</span>' : ""}</span></div>
              <div class="row"><button data-play="${g.key}" class="primary">Spielen</button>
              ${signedIn && !c?.rom_path ? `<button data-up="${g.key}" title="ROM privat in deiner Cloud sichern">☁</button>` : ""}
              <button data-cover="${g.key}" title="Eigenes Cover wählen">🖼</button>
              <button data-del="${g.key}" title="Entfernen">✕</button></div></li>`;
          })
          .join("")}</ul></details>`,
            )
            .join("")
        : '<p class="muted">Noch keine ROMs. Füge oben deine erste hinzu.</p>'
    }
    ${
      cloudOnly.length
        ? `<h2>Auf anderen Geräten gespielt</h2>
      <p class="muted">Füge dieselbe ROM-Datei hier hinzu, dann wird dein Spielstand automatisch geladen.</p>
      <ul class="games">${cloudOnly
        .map((c) => `<li><div class="info"><b>${esc(c.title)}</b><br><span class="muted">${esc(CORE_LABELS[c.system] ?? c.system)} · ${fmtTime(c.playtime_sec)}</span></div>${c.rom_path ? `<button data-down="${c.game_key}" class="primary">Aus Cloud laden</button>` : '<span class="muted">ROM fehlt</span>'}</li>`)
        .join("")}</ul>`
        : ""
    }
  </main>`;
  wireCommon();
}

/* ---------- gemeinsame Aktionen ---------- */
function wireCommon() {
  const msg = document.getElementById("msg");
  document.getElementById("file")?.addEventListener("change", async (ev) => {
    const files = Array.from((ev.target as HTMLInputElement).files ?? []);
    for (const f of files) {
      const sys = systemFor(f.name);
      if (!sys) {
        if (msg) msg.textContent = `Unbekanntes Format: ${f.name}`;
        continue;
      }
      if (msg) msg.textContent = `Verarbeite ${f.name} …`;
      const key = await sha1(f);
      const old = await getLocal(key);
      await putLocal({
        ...(old ?? {}),
        key,
        title: old?.title ?? f.name.replace(/\.[^.]+$/, ""),
        core: sys.core,
        systemLabel: sys.label,
        filename: f.name,
        file: f,
        addedAt: old?.addedAt ?? Date.now(),
      });
    }
    await checkAchievements(0);
    await render();
  });

  app.querySelectorAll<HTMLElement>("[data-play]").forEach((b) => b.addEventListener("click", () => void play(b.dataset.play!)));
  app.querySelectorAll<HTMLElement>("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (confirm("ROM aus der lokalen Bibliothek entfernen? Cloud-Spielstände bleiben erhalten.")) {
        await removeLocal(b.dataset.del!);
        await render();
      }
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-up]").forEach((b) =>
    b.addEventListener("click", async () => {
      const g = await getLocal(b.dataset.up!);
      if (!g) return;
      if (!confirm("Diese ROM privat in deiner Cloud sichern? Nur du hast Zugriff. Lade nur Dateien hoch, die du selbst besitzt.")) return;
      b.textContent = "…";
      try {
        await uploadRom(g.key, g.file, { title: g.title, core: g.core, filename: g.filename }, g.cover);
        await render();
      } catch (e) {
        b.textContent = "☁";
        alert((e as Error).message);
      }
    }),
  );
  app.querySelectorAll<HTMLElement>("[data-down]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.textContent = "Lade …";
      try {
        const c = (await listCloudGames()).find((x) => x.game_key === b.dataset.down);
        if (!c?.rom_path) throw new Error("Keine ROM in der Cloud");
        const file = await downloadRom(c.rom_path);
        const cover = await downloadCover(c.rom_path);
        await putLocal({
          key: c.game_key,
          title: c.title,
          core: c.system,
          systemLabel: CORE_LABELS[c.system] ?? c.system,
          filename: c.filename ?? c.title,
          file,
          cover: cover ?? undefined,
          addedAt: Date.now(),
        });
        await render();
      } catch (e) {
        b.textContent = "Aus Cloud laden";
        alert((e as Error).message);
      }
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

async function render() {
  if (session) return;
  if (cloudConfigured && !signedIn) return renderLogin();
  return location.hash.startsWith("#/library") ? renderLibrary() : renderHome();
}

async function checkAchievements(sessionSeconds: number) {
  if (!signedIn) return;
  const local = await listLocal();
  const cloud = await listCloudGames().catch(() => [] as CloudGame[]);
  const stats = {
    games: local.length,
    systems: new Set(local.map((g) => g.core)).size,
    totalSeconds: cloud.reduce((n, c) => n + c.playtime_sec, 0) + sessionSeconds,
    sessionSeconds,
  };
  for (const a of ACHIEVEMENTS) if (a.test(stats)) await unlock(a.code).catch(() => undefined);
}

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
    </div>`;
  const status = document.getElementById("status")!;
  try {
    session = await startGame(game, document.getElementById("screen")!, signedIn, (m) => (status.textContent = m));
  } catch (e) {
    status.textContent = (e as Error).message;
  }
  document.getElementById("back")!.addEventListener("click", async () => {
    const secs = session?.seconds() ?? 0;
    status.textContent = "Speichere …";
    const shot = await session?.screenshot().catch(() => null);
    if (shot) await putLocal({ ...game, cover: shot, lastPlayed: Date.now() });
    await checkAchievements(secs).catch(() => undefined);
    if (session) await session.stop(); // lädt die Seite neu
    else location.reload();
  });
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
  await render();
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => undefined);
  }
}

void main();
