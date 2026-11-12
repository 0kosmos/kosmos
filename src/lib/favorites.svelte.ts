// Your favorite games in the Library (the star on each tile). Saved on this PC.
// Each game is stored by a short key: "s<appid>" for Steam games, "e<Epic app name>" for Epic
// games (the same keys the Library uses for its list).

const KEY = "kosmos-favorites";

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export const favorites = $state({ keys: load() });

export const steamKey = (appid: number) => "s" + appid;
export const epicKey = (appName: string) => "e" + appName;

export function isFavorite(key: string) {
  return favorites.keys.includes(key);
}

export function toggleFavorite(key: string) {
  favorites.keys = isFavorite(key) ? favorites.keys.filter((k) => k !== key) : [...favorites.keys, key];
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites.keys));
  } catch {
    /* ignore: it just won't be remembered */
  }
}
