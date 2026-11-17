import type { CloudGame } from "./cloud";
import type { LocalGame } from "./library";

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

export interface Recommendation {
  game: LocalGame;
  reason: string;
}

/** Empfehlungen aus der eigenen Bibliothek: Noch nicht gespielte Titel, sortiert nach Reihe, Konsole und Spielzeit. */
export function recommend(local: LocalGame[], cloud: CloudGame[]): Recommendation[] {
  const played = new Set([...cloud.filter((c) => c.playtime_sec > 0).map((c) => c.game_key), ...local.filter((g) => g.lastPlayed).map((g) => g.key)]);
  const playtime = new Map(cloud.map((c) => [c.game_key, c.playtime_sec]));
  const seriesWeight = new Map<string, { label: string; w: number }>();
  const coreWeight = new Map<string, number>();
  for (const g of local) {
    const w = played.has(g.key) ? 3 + Math.min(5, (playtime.get(g.key) ?? 0) / 3600) : 1;
    const s = seriesOf(g.title);
    if (s) seriesWeight.set(s.id, { label: s.label, w: (seriesWeight.get(s.id)?.w ?? 0) + w });
    coreWeight.set(g.core, (coreWeight.get(g.core) ?? 0) + w);
  }
  const scored = local
    .filter((g) => !played.has(g.key))
    .map((game) => {
      const s = seriesOf(game.title);
      const sw = s ? seriesWeight.get(s.id) : undefined;
      const score = (sw?.w ?? 0) * 10 + (coreWeight.get(game.core) ?? 0);
      const reason = sw && sw.w > 1 ? `Weil du ${sw.label} spielst` : "Passt zu deinen Konsolen";
      return { game, reason, score };
    });
  scored.sort((a, b) => b.score - a.score || b.game.addedAt - a.game.addedAt);
  return scored.slice(0, 12).map(({ game, reason }) => ({ game, reason }));
}
