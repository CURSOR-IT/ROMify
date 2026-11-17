import "./style.css";
import { ACHIEVEMENTS } from "./achievements";
import {
  cloudConfigured,
  currentUser,
  listAchievements,
  listCloudGames,
  supabase,
  unlock,
  type CloudGame,
} from "./cloud";
import { startGame, type Session } from "./emulator";
import { getLocal, listLocal, putLocal, removeLocal, sha1, type LocalGame } from "./library";
import { ACCEPT, systemFor } from "./systems";

const app = document.getElementById("app")!;
let session: Session | null = null;
let signedIn = false;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtTime = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

async function main() {
  if (cloudConfigured) {
    signedIn = Boolean(await currentUser());
    supabase.auth.onAuthStateChange((_e, s) => {
      const now = Boolean(s?.user);
      if (now !== signedIn) {
        signedIn = now;
        if (!session) void render();
      }
    });
  }
  await render();
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
}

async function render() {
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
  const localKeys = new Set(local.map((g) => g.key));
  const cloudOnly = cloud.filter((c) => !localKeys.has(c.game_key));
  const byKey = new Map(cloud.map((c) => [c.game_key, c]));

  app.innerHTML = `
    <header>
      <h1>ROMify</h1>
      <div class="acct">${
        !cloudConfigured
          ? '<span class="muted">Cloud nicht konfiguriert</span>'
          : signedIn
            ? '<button id="logout">Abmelden</button>'
            : '<button id="showlogin" class="primary">Anmelden</button>'
      }</div>
    </header>
    <main>
      <img class="logo" src="${import.meta.env.BASE_URL}logo.jpg" alt="ROMify – Web-based Emulator" />
      <section>
        <label class="drop">
          <input id="file" type="file" accept="${ACCEPT}" multiple hidden />
          <strong>+ ROM hinzufügen</strong>
          <span class="muted">Deine Dateien bleiben lokal im Browser.</span>
        </label>
        <div id="msg" class="muted"></div>
      </section>
      <section>
        <h2>Bibliothek</h2>
        <ul class="games">
          ${
            local.length
              ? local
                  .sort((a, b) => b.addedAt - a.addedAt)
                  .map((g) => {
                    const c = byKey.get(g.key);
                    return `<li>
                      <div><b>${esc(g.title)}</b><br><span class="muted">${esc(g.systemLabel)}${c ? " · " + fmtTime(c.playtime_sec) : ""}</span></div>
                      <div class="row"><button data-play="${g.key}" class="primary">Spielen</button><button data-del="${g.key}" title="Entfernen">✕</button></div>
                    </li>`;
                  })
                  .join("")
              : '<li class="muted">Noch keine Spiele. Füge oben eine ROM hinzu.</li>'
          }
        </ul>
      </section>
      ${
        cloudOnly.length
          ? `<section><h2>Auf anderen Geräten gespielt</h2>
             <p class="muted">Füge dieselbe ROM-Datei hier hinzu, dann wird dein Spielstand automatisch geladen.</p>
             <ul class="games">${cloudOnly
               .map((c) => `<li><div><b>${esc(c.title)}</b><br><span class="muted">${esc(c.system)} · ${fmtTime(c.playtime_sec)}</span></div><span class="muted">ROM fehlt</span></li>`)
               .join("")}</ul></section>`
          : ""
      }
      ${
        signedIn
          ? `<section><h2>Erfolge</h2><ul class="ach">${ACHIEVEMENTS.map(
              (a) => `<li class="${unlocked.has(a.code) ? "on" : ""}"><b>${unlocked.has(a.code) ? "🏆" : "🔒"} ${esc(a.title)}</b><br><span class="muted">${esc(a.desc)}</span></li>`,
            ).join("")}</ul></section>`
          : ""
      }
    </main>
    <dialog id="login">
      <form method="dialog" id="loginform">
        <h2>Anmelden</h2>
        <input name="email" type="email" placeholder="E-Mail" required autocomplete="email" />
        <input name="password" type="password" placeholder="Passwort (min. 6 Zeichen)" required minlength="6" autocomplete="current-password" />
        <div id="loginmsg" class="muted"></div>
        <div class="row">
          <button value="in" class="primary" type="submit">Anmelden</button>
          <button value="up" type="button" id="signup">Registrieren</button>
          <button value="cancel" type="button" id="cancel">Abbrechen</button>
        </div>
      </form>
    </dialog>`;

  const msg = document.getElementById("msg")!;

  document.getElementById("file")!.addEventListener("change", async (ev) => {
    const files = Array.from((ev.target as HTMLInputElement).files ?? []);
    for (const f of files) {
      const sys = systemFor(f.name);
      if (!sys) {
        msg.textContent = `Unbekanntes Format: ${f.name}`;
        continue;
      }
      msg.textContent = `Verarbeite ${f.name} …`;
      const key = await sha1(f);
      await putLocal({
        key,
        title: f.name.replace(/\.[^.]+$/, ""),
        core: sys.core,
        systemLabel: sys.label,
        filename: f.name,
        file: f,
        addedAt: Date.now(),
      });
    }
    await checkAchievements(0);
    await render();
  });

  app.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) =>
    b.addEventListener("click", () => void play(b.dataset.play!)),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (confirm("ROM aus der lokalen Bibliothek entfernen? Cloud-Spielstände bleiben erhalten.")) {
        await removeLocal(b.dataset.del!);
        await render();
      }
    }),
  );

  const dlg = document.getElementById("login") as HTMLDialogElement;
  document.getElementById("showlogin")?.addEventListener("click", () => dlg.showModal());
  document.getElementById("cancel")?.addEventListener("click", () => dlg.close());
  document.getElementById("logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    signedIn = false;
    await render();
  });
  const form = document.getElementById("loginform") as HTMLFormElement;
  const lmsg = document.getElementById("loginmsg")!;
  const creds = () => {
    const d = new FormData(form);
    return { email: String(d.get("email")), password: String(d.get("password")) };
  };
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword(creds());
    if (error) lmsg.textContent = error.message;
    else {
      signedIn = true;
      dlg.close();
      await render();
    }
  });
  document.getElementById("signup")?.addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const { data, error } = await supabase.auth.signUp(creds());
    if (error) lmsg.textContent = error.message;
    else if (!data.session) lmsg.textContent = "Bestätigungs-E-Mail gesendet. Danach anmelden.";
    else {
      signedIn = true;
      dlg.close();
      await render();
    }
  });
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
  const game: LocalGame | undefined = await getLocal(key);
  if (!game) return;
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
    await checkAchievements(secs).catch(() => undefined);
    await session?.stop(); // lädt die Seite neu
  });
}

void main();
