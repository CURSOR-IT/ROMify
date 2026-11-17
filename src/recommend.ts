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
  ["donkey kong", "Donkey Kong"],
  ["resident evil", "Resident Evil"],
];

// Nur Titel-Metadaten für Vorschläge. Es werden keine ROMs bereitgestellt.
const CATALOG: Record<string, string[]> = {
  pokemon: ["Pokémon Platin (DS)", "Pokémon HeartGold / SoulSilver (DS)", "Pokémon Smaragd (GBA)", "Pokémon Feuerrot / Blattgrün (GBA)", "Pokémon Stadium (N64)"],
  mario: ["Super Mario 64 (N64)", "New Super Mario Bros. (DS)", "Super Mario World (SNES)", "Mario Kart 64 (N64)", "Super Mario Advance 4 (GBA)"],
  zelda: ["The Legend of Zelda: Ocarina of Time (N64)", "Majora's Mask (N64)", "A Link to the Past (SNES)", "The Minish Cap (GBA)", "Phantom Hourglass (DS)"],
  "final fantasy": ["Final Fantasy VII (PS1)", "Final Fantasy IX (PS1)", "Final Fantasy Tactics Advance (GBA)", "Final Fantasy III (DS)"],
  "kingdom hearts": ["Chain of Memories (GBA)", "358/2 Days (DS)"],
  sonic: ["Sonic the Hedgehog 2 (Mega Drive)", "Sonic Advance (GBA)"],
  metroid: ["Metroid Fusion (GBA)", "Super Metroid (SNES)"],
  kirby: ["Kirby Super Star (SNES)", "Kirby: Nightmare in Dream Land (GBA)"],
  "fire emblem": ["Fire Emblem (GBA)", "The Sacred Stones (GBA)"],
  "dragon quest": ["Dragon Quest IX (DS)"],
};

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
export interface Missing {
  seriesLabel: string;
  titles: string[];
}

export function recommend(local: LocalGame[], cloud: CloudGame[]) {
  const playedKeys = new Set([...cloud.map((c) => c.game_key), ...local.filter((g) => g.lastPlayed).map((g) => g.key)]);
  const seriesWeight = new Map<string, { label: string; w: number }>();
  const coreWeight = new Map<string, number>();
  const bump = (title: string, core: string, w: number) => {
    const s = seriesOf(title);
    if (s) seriesWeight.set(s.id, { label: s.label, w: (seriesWeight.get(s.id)?.w ?? 0) + w });
    coreWeight.set(core, (coreWeight.get(core) ?? 0) + w);
  };
  for (const g of local) bump(g.title, g.core, playedKeys.has(g.key) ? 3 : 1);
  for (const c of cloud) bump(c.title, c.system, 1 + Math.min(5, c.playtime_sec / 3600));

  const unplayed = local.filter((g) => !playedKeys.has(g.key));
  const scored = unplayed.map((game) => {
    const s = seriesOf(game.title);
    const sw = s ? seriesWeight.get(s.id) : undefined;
    const score = (sw?.w ?? 0) * 10 + (coreWeight.get(game.core) ?? 0);
    const reason = sw && sw.w > 1 ? `Weil du ${sw.label} spielst` : "Passt zu deinen Konsolen";
    return { game, reason, score };
  });
  scored.sort((a, b) => b.score - a.score || b.game.addedAt - a.game.addedAt);
  const games: Recommendation[] = scored.slice(0, 12).map(({ game, reason }) => ({ game, reason }));

  const owned = local.map((g) => norm(g.title));
  const missing: Missing[] = [...seriesWeight.entries()]
    .filter(([id]) => CATALOG[id])
    .sort((a, b) => b[1].w - a[1].w)
    .slice(0, 2)
    .map(([id, v]) => ({
      seriesLabel: v.label,
      titles: CATALOG[id].filter((t) => {
        const n = norm(t);
        return !owned.some((o) => o && (o.includes(n) || n.includes(o)));
      }),
    }))
    .filter((m) => m.titles.length);
  return { games, missing };
}
