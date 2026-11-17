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

function catCard(r: CatalogRom, cover: string | undefined, sub: string) {
  const art = cover ? `background-image:url(${cover})` : `background:${gradient(r.title)}`;
  return `<a class="card" href="#/catalog" title="${esc(r.title)}">
    <div class="art" style="${art}">${cover ? "" : `<span>${esc(initials(r.title))}</span>`}<i class="sys">${esc(CORE_LABELS[r.system] ?? r.system)}</i></div>
    <b>${esc(r.title)}</b><small>${esc(sub)}</small></a>`;
}

const row = (html: string, empty: string) => (html ? `<div class="scroller">${html}</div>` : `<p class="muted">${empty}</p>`);

function header(active: "home" | "library" | "catalog") {
  return `<header class="top">
    <a class="brand" href="#/">ROMify</a>
    <nav><a href="#/" class="${active === "home" ? "on" : ""}">Start</a><a href="#/catalog" class="${active === "catalog" ? "on" : ""}">Katalog</a><a href="#/library" class="${active === "library" ? "on" : ""}">Bibliothek</a></nav>
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

  let cat: CatalogRom[] = [];
  let covers = new Map<string, string>();
  if (signedIn) {
    cat = await listCatalog().catch(() => [] as CatalogRom[]);
    covers = await coverUrls(cat.slice(0, 12)).catch(() => new Map<string, string>());
  }
  const haveCat = new Set(local.map((g) => g.catalogId));
  const newCat = cat.filter((r) => !haveCat.has(r.id)).slice(0, 12);
  const myCores = new Set(local.map((g) => g.core));
  const catRec = newCat.filter((r) => myCores.has(r.system)).slice(0, 6);

  app.innerHTML = `${header("home")}
  <main>
    ${addButton}
    <section><h2>Zuletzt gespielt</h2>${row(recent.map((g) => card(g, ago(g.lastPlayed!))).join(""), "Noch nichts gespielt. Starte ein Spiel aus deiner Bibliothek.")}</section>
    <section><h2>Neu hinzugefügt</h2>${row(fresh.map((g) => card(g, ago(g.addedAt))).join(""), "Füge oben deine erste ROM hinzu.")}</section>
    ${
      signedIn
        ? `<section><h2>Neu im Katalog <a class="more" href="#/catalog">Alle ansehen →</a></h2>${row(
            newCat.map((r) => catCard(r, covers.get(r.id), `${CORE_LABELS[r.system] ?? r.system}`)).join(""),
            "Noch keine Einträge im Katalog.",
          )}</section>`
        : ""
    }
    <section><h2>Empfohlen für dich</h2>
      ${row(
        rec.games.map((r) => card(r.game, r.reason)).join("") + catRec.map((r) => catCard(r, covers.get(r.id), "Im Katalog · " + (CORE_LABELS[r.system] ?? r.system))).join(""),
        "Spiele ein paar Titel, dann passen wir die Empfehlungen an dich an.",
      )}
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

/* ---------- Katalog ---------- */
const fmtMB = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function renderCatalog() {
  let items: CatalogRom[] = [];
  let admin = false;
  let err = "";
  try {
    [items, admin] = await Promise.all([listCatalog(), isAdmin()]);
  } catch (e) {
    err = (e as Error).message;
  }
  const covers = await coverUrls(items).catch(() => new Map<string, string>());
  const local = await listLocal();
  const haveCat = new Set(local.map((g) => g.catalogId).filter(Boolean));
  const reports = admin ? await listReports().catch(() => []) : [];
  resetUrls();
  setBackground(local);

  const groups = CORE_ORDER.map((core) => ({ core, roms: items.filter((r) => r.system === core) })).filter((g) => g.roms.length);
  const coreOptions = CORE_ORDER.map((c) => `<option value="${c}">${esc(CORE_LABELS[c])}</option>`).join("");

  app.innerHTML = `${header("catalog")}
  <main>
    <div class="intro"><b>ROM-Katalog</b><br>
      <span class="muted">Hier findest du ausschließlich selbst erstellte oder frei lizenzierte ROMs (Homebrew). Etwas gefunden, das hier nicht hingehört? Nutze „Melden“, wir prüfen es und entfernen es bei Bedarf.</span></div>
    ${err ? `<p class="warn">Katalog konnte nicht geladen werden: ${esc(err)}</p>` : ""}
    ${
      admin
        ? `<details class="group admin"><summary><b>Admin: ROM hinzufügen</b></summary>
      <form id="adminform" class="adminform">
        <input name="title" placeholder="Titel" required maxlength="120" />
        <input name="author" placeholder="Autor / Studio" required maxlength="120" />
        <select name="license" required>${LICENSES.map((l) => `<option>${esc(l)}</option>`).join("")}</select>
        <textarea name="description" placeholder="Beschreibung (optional)" maxlength="1000"></textarea>
        <label>ROM-Datei (max. 50 MB)<input type="file" name="rom" accept="${ACCEPT}" required /></label>
        <label>Emulator<select name="system">${coreOptions}</select></label>
        <label>Cover-Bild (optional)<input type="file" name="cover" accept="image/*" /></label>
        <label class="check"><input type="checkbox" name="rights" required /> Ich bestätige, dass ich Rechteinhaber bin oder die Datei unter der gewählten Lizenz frei verteilen darf.</label>
        <button class="primary" type="submit">Hochladen</button>
        <div id="adminmsg" class="muted" role="status"></div>
      </form></details>
      ${
        reports.length
          ? `<details class="group" open><summary><b>Meldungen</b><span class="count">${reports.length}</span></summary>
        <ul class="games">${reports
          .map((r) => {
            const rom = items.find((i) => i.id === r.rom_id);
            return `<li><div class="info"><b>${esc(rom?.title ?? "Eintrag")}</b><br><span class="muted">${esc(r.reason)}</span></div>
            <div class="row">${rom ? `<button data-catdel="${rom.id}" title="Eintrag löschen">Löschen</button>` : ""}<button data-dismiss="${r.id}">Erledigt</button></div></li>`;
          })
          .join("")}</ul></details>`
          : ""
      }`
        : ""
    }
    <div class="filters"><input id="q" type="search" placeholder="Katalog durchsuchen …" /></div>
    ${
      groups.length
        ? groups
            .map(
              (gr) => `<details class="group" open><summary><b>${esc(CORE_LABELS[gr.core])}</b><span class="count">${gr.roms.length}</span></summary>
        <ul class="games">${gr.roms
          .map((r) => {
            const cv = covers.get(r.id);
            return `<li data-text="${esc((r.title + " " + r.author + " " + (r.description ?? "")).toLowerCase())}">
              <div class="thumb" style="${cv ? `background-image:url(${cv})` : `background:${gradient(r.title)}`}"></div>
              <div class="info"><b>${esc(r.title)}</b><br><span class="muted">${esc(r.author)} · ${esc(r.license)} · ${fmtMB(r.size)}</span>
                ${r.description ? `<br><span class="muted">${esc(r.description)}</span>` : ""}</div>
              <div class="row">
                ${haveCat.has(r.id) ? '<span class="badge">✓ In Bibliothek</span>' : `<button data-catadd="${r.id}" class="primary">Hinzufügen</button>`}
                <button data-report="${r.id}" title="Problem melden">⚑</button>
                ${admin ? `<button data-catdel="${r.id}" title="Löschen (Admin)">✕</button>` : ""}
              </div></li>`;
          })
          .join("")}</ul></details>`,
            )
            .join("")
        : '<p class="muted">Der Katalog ist noch leer.</p>'
    }
  </main>`;

  document.getElementById("logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    signedIn = false;
    await render();
  });

  document.getElementById("q")?.addEventListener("input", (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>("li[data-text]").forEach((li) => li.classList.toggle("hidden", Boolean(q) && !li.dataset.text!.includes(q)));
  });

  app.querySelectorAll<HTMLElement>("[data-catadd]").forEach((b) =>
    b.addEventListener("click", async () => {
      const rom = items.find((r) => r.id === b.dataset.catadd);
      if (!rom) return;
      b.textContent = "Lade …";
      try {
        const blob = await downloadCatalogRom(rom);
        const file = new File([blob], rom.filename, { type: "application/octet-stream" });
        let cover: Blob | undefined;
        const cu = covers.get(rom.id);
        if (cu) cover = await fetch(cu).then((r) => r.blob()).catch(() => undefined);
        const sys = systemFor(rom.filename);
        await putLocal({
          key: await sha1(file),
          title: rom.title,
          core: rom.system,
          systemLabel: sys?.label ?? CORE_LABELS[rom.system] ?? rom.system,
          filename: rom.filename,
          file,
          cover,
          addedAt: Date.now(),
          catalogId: rom.id,
        });
        await checkAchievements(0);
        await render();
      } catch (e) {
        b.textContent = "Hinzufügen";
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

  const form = document.getElementById("adminform") as HTMLFormElement | null;
  form?.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "rom" && t.files?.[0]) {
      const sys = systemFor(t.files[0].name);
      if (sys) (form.elements.namedItem("system") as HTMLSelectElement).value = sys.core;
    }
  });
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("adminmsg")!;
    const d = new FormData(form);
    const rom = d.get("rom") as File;
    const cover = d.get("cover") as File;
    msg.textContent = "Lade hoch …";
    try {
      await adminUpload({
        title: String(d.get("title")).trim(),
        author: String(d.get("author")).trim(),
        license: String(d.get("license")),
        description: String(d.get("description") ?? "").trim(),
        system: String(d.get("system")),
        rom,
        cover: cover && cover.size ? cover : undefined,
      });
      await render();
    } catch (err2) {
      msg.textContent = (err2 as Error).message;
    }
  });
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
  if (location.hash.startsWith("#/catalog")) return renderCatalog();
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
