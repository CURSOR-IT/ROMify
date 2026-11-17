// Eigene, systemunabhängige Erfolge (Spielzeit, Bibliothek, Systeme).
// Echte Spiel-Erfolge (RetroAchievements) wären eine spätere Erweiterung.
export interface Achievement {
  code: string;
  title: string;
  desc: string;
  test: (s: Stats) => boolean;
}

export interface Stats {
  games: number;
  systems: number;
  totalSeconds: number;
  sessionSeconds: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { code: "first_game", title: "Erster Start", desc: "Ein Spiel zur Bibliothek hinzufügen", test: (s) => s.games >= 1 },
  { code: "five_games", title: "Sammler", desc: "5 Spiele in der Bibliothek", test: (s) => s.games >= 5 },
  { code: "two_systems", title: "Multi-Konsole", desc: "Spiele von 2 Systemen spielen", test: (s) => s.systems >= 2 },
  { code: "play_10m", title: "Warmgespielt", desc: "10 Minuten Gesamtspielzeit", test: (s) => s.totalSeconds >= 600 },
  { code: "play_1h", title: "Dranbleiber", desc: "1 Stunde Gesamtspielzeit", test: (s) => s.totalSeconds >= 3600 },
  { code: "play_10h", title: "Veteran", desc: "10 Stunden Gesamtspielzeit", test: (s) => s.totalSeconds >= 36000 },
  { code: "session_30m", title: "Marathon", desc: "30 Minuten am Stück", test: (s) => s.sessionSeconds >= 1800 },
];
