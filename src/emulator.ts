import { downloadState, uploadState, upsertGame } from "./cloud";

const DATA_PATH = "https://cdn.emulatorjs.org/stable/data/";
const SYNC_INTERVAL_MS = 60_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;

export interface Game {
  key: string; // Katalog-ID
  title: string;
  core: string;
}

export interface Session {
  stop(): Promise<void>;
  seconds(): number;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("EmulatorJS konnte nicht geladen werden (Netzwerk?)"));
    document.body.appendChild(s);
  });
}

// ROM nur als Blob im Arbeitsspeicher. Sie wird nie im Browser (IndexedDB/localStorage) gespeichert.
export async function startGame(
  game: Game,
  rom: Blob,
  mount: HTMLElement,
  signedIn: boolean,
  onStatus: (msg: string) => void,
  onReady?: () => void,
): Promise<Session> {
  mount.innerHTML = '<div id="ejs"></div>';

  const romUrl = URL.createObjectURL(rom);
  let stateUrl: string | undefined;
  if (signedIn) {
    onStatus("Lade Cloud-Spielstand …");
    const state = await downloadState(game.key).catch(() => null);
    if (state) stateUrl = URL.createObjectURL(state);
  }

  w.EJS_player = "#ejs";
  w.EJS_core = game.core;
  w.EJS_gameUrl = romUrl;
  w.EJS_gameName = game.title;
  w.EJS_gameID = game.key;
  w.EJS_pathtodata = DATA_PATH;
  w.EJS_startOnLoaded = true;
  w.EJS_onGameStart = () => onReady?.(); // Spiel läuft: Ladeanzeige ausblenden
  w.EJS_color = "#a855f7";
  if (stateUrl) w.EJS_loadStateURL = stateUrl;
  else delete w.EJS_loadStateURL;

  await loadScript(DATA_PATH + "loader.js");

  const started = Date.now();
  let lastSync = started;

  async function sync(final: boolean) {
    const emu = w.EJS_emulator;
    const elapsed = Math.ceil((Date.now() - lastSync) / 1000);
    lastSync = Date.now();
    try {
      if (signedIn) {
        const state: Uint8Array | undefined = emu?.gameManager?.getState?.();
        if (state && state.length) await uploadState(game.key, state);
        await upsertGame({ key: game.key, title: game.title, system: game.core }, elapsed);
        onStatus(final ? "Gespeichert ✓" : "Cloud-Sync ✓ " + new Date().toLocaleTimeString());
      }
    } catch (e) {
      onStatus("Sync-Fehler: " + (e as Error).message);
    }
  }

  const timer = window.setInterval(() => void sync(false), SYNC_INTERVAL_MS);
  const onHide = () => {
    if (document.visibilityState === "hidden") void sync(false);
  };
  document.addEventListener("visibilitychange", onHide);

  return {
    seconds: () => (Date.now() - started) / 1000,
    async stop() {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      await sync(true);
      try {
        w.EJS_emulator?.callEvent?.("exit");
        w.EJS_emulator?.pause?.();
      } catch {
        /* ignorieren */
      }
      URL.revokeObjectURL(romUrl);
      if (stateUrl) URL.revokeObjectURL(stateUrl);
      // EmulatorJS hält globalen Zustand -> sauberster Reset ist ein Reload.
      location.reload();
    },
  };
}
