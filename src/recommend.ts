import type { CatalogRom } from "./catalog";

const SERIES: [string, string][] = [
  ["pokemon", "Pokémon"],
  ["mario", "Mario"],
  ["zelda", "Zelda"],
  ["final fantasy", "Final Fantasy"],
  ["kingdom hearts", "Kingdom Hearts"],
  ["sonic", "Sonic"],
  ["metroid", "Metroid"],
  ["kirby", "Kirby"],
  ["fire emblem", "Fire Emblem"],
  ["dragon quest", "Dragon Quest"],
  ["mega man", "Mega Man"],
  ["castlevania", "Castlevania"],
];

export interface Series {
  id: string;
  label: string;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function seriesOf(title: string): Series | null {
  const t = norm(title);
  for (const [id, label] of SERIES) if (t.includes(id)) return { id, label };
  const first = t.split(" ")[0];
  return first && first.length > 3 ? { id: first, label: first[0].toUpperCase() + first.slice(1) } : null;
}

/** Eintrag der eigenen Spieleliste (nur Metadaten). */
export interface Entry {
  key: string;
  title: string;
  core: string;
  rom?: CatalogRom;
  lastPlayed?: number;
  addedAt: number;
  playtime: number;
}

export interface Recommendation {
  rom: CatalogRom;
  reason: string;
}

/** Empfehlungen aus dem Katalog, angepasst an Spielverhalten (Reihe, Konsole, Spielzeit). */
export function recommend(entries: Entry[], catalog: CatalogRom[]): Recommendation[] {
  const inLibrary = new Set(entries.map((e) => e.key));
  const seriesWeight = new Map<string, { label: string; w: number }>();
  const coreWeight = new Map<string, number>();
  for (const e of entries) {
    const w = 1 + Math.min(5, e.playtime / 3600) + (e.playtime > 0 ? 2 : 0);
    const s = seriesOf(e.title);
    if (s) seriesWeight.set(s.id, { label: s.label, w: (seriesWeight.get(s.id)?.w ?? 0) + w });
    coreWeight.set(e.core, (coreWeight.get(e.core) ?? 0) + w);
  }
  const scored = catalog
    .filter((r) => !inLibrary.has(r.id))
    .map((rom) => {
      const s = seriesOf(rom.title);
      const sw = s ? seriesWeight.get(s.id) : undefined;
      const cw = coreWeight.get(rom.system) ?? 0;
      const score = (sw?.w ?? 0) * 10 + cw;
      const reason = sw ? `Weil du ${sw.label} spielst` : cw > 0 ? "Passt zu deinen Konsolen" : "Neu im Katalog";
      return { rom, reason, score };
    });
  scored.sort((a, b) => b.score - a.score || +new Date(b.rom.created_at) - +new Date(a.rom.created_at));
  return scored.slice(0, 12).map(({ rom, reason }) => ({ rom, reason }));
}
