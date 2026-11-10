export interface Game {
  appid: number;
  name: string;
  hours: number; // total playtime
  lastPlayed: number; // time stamp
  installed: boolean;
}

const names = [
  "Star Harbor", "Pixel Knights", "Deep Signal", "Rogue Orchard",
  "Neon Drift", "Mossbound", "Iron Lantern", "Cloud Atlas Racing",
  "Tiny Kingdoms", "Echo Valley", "Gravity Garden", "Salt & Ember",
  "Hollow Tide", "Crimson Circuit", "Paper Skies", "Lost Almanac",
  "Orbit Chef", "Stonebreak", "Midnight Depot", "Wild Lanterns",
  "Fable Forge", "Glass Harbor", "Zero Hour Cafe", "Ashen Trails",
];

export const FAKE_GAMES: Game[] = names.map((name, i) => ({
  appid: 1000 + i,
  name,
  hours: (i * 37) % 240,
  lastPlayed: Date.now() - ((i * 13) % 90) * 86400000,
  installed: i % 3 === 0,
}));