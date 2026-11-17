// Dateiendung -> EmulatorJS-Core. Nur Systeme, die EmulatorJS im Browser unterstützt.
// 3DS wird bewusst nicht gelistet: es gibt keinen brauchbaren WebAssembly-3DS-Core.
export interface System {
  core: string;
  label: string;
}

export const SYSTEMS: Record<string, System> = {
  nds: { core: "nds", label: "Nintendo DS" },
  z64: { core: "n64", label: "Nintendo 64" },
  n64: { core: "n64", label: "Nintendo 64" },
  v64: { core: "n64", label: "Nintendo 64" },
  gba: { core: "gba", label: "Game Boy Advance" },
  gb: { core: "gb", label: "Game Boy" },
  gbc: { core: "gb", label: "Game Boy Color" },
  nes: { core: "nes", label: "NES" },
  sfc: { core: "snes", label: "SNES" },
  smc: { core: "snes", label: "SNES" },
  md: { core: "segaMD", label: "Mega Drive" },
  gen: { core: "segaMD", label: "Mega Drive" },
  sms: { core: "segaMS", label: "Master System" },
  gg: { core: "segaGG", label: "Game Gear" },
  cue: { core: "psx", label: "PlayStation" },
  pbp: { core: "psx", label: "PlayStation" },
  iso: { core: "psx", label: "PlayStation (ISO)" },
};

export function systemFor(filename: string): System | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return SYSTEMS[ext] ?? null;
}

export const ACCEPT = Object.keys(SYSTEMS)
  .map((e) => "." + e)
  .concat(".zip", ".7z")
  .join(",");

// Anzeigename je Emulator-Core (für Gruppierung und Fußzeile).
export const CORE_LABELS: Record<string, string> = {
  nds: "Nintendo DS",
  n64: "Nintendo 64",
  gba: "Game Boy Advance",
  gb: "Game Boy / Color",
  nes: "NES",
  snes: "SNES",
  segaMD: "Sega Mega Drive",
  segaMS: "Sega Master System",
  segaGG: "Sega Game Gear",
  psx: "PlayStation",
};

export const CORE_ORDER = Object.keys(CORE_LABELS);

export function supportedEmulators(): { core: string; label: string; exts: string[] }[] {
  return CORE_ORDER.map((core) => ({
    core,
    label: CORE_LABELS[core],
    exts: Object.entries(SYSTEMS)
      .filter(([, s]) => s.core === core)
      .map(([e]) => "." + e),
  }));
}
