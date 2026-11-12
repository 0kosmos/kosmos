// Kosmos wishlists, saved on this PC: games from the Store and items from the Community Market.
// (Kosmos can't change your Steam wishlist: that needs your Steam login, which Kosmos never has.
// The Store's wishlist pop-up links to your Steam wishlist too.)
// The price is the one shown when you added it.

export interface WishGame {
  appid: number;
  name: string;
  image: string;
  priceText: string;
  added: number;
}

export interface WishItem {
  appid: number;
  hash: string;
  name: string;
  icon: string;
  color: string;
  game: string;
  type: string;
  priceText: string;
  listings: number;
  usdCents: number;
  added: number;
}

const GAMES_KEY = "kosmos-wishlist-games";
const ITEMS_KEY = "kosmos-wishlist-items";

function load<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function save(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const wishlist = $state({ games: load<WishGame>(GAMES_KEY), items: load<WishItem>(ITEMS_KEY) });

// ---------- Games ----------
export const isWishedGame = (appid: number) => wishlist.games.some((g) => g.appid === appid);

export function toggleWishGame(g: Omit<WishGame, "added">) {
  wishlist.games = isWishedGame(g.appid)
    ? wishlist.games.filter((x) => x.appid !== g.appid)
    : [{ ...g, added: Date.now() }, ...wishlist.games];
  save(GAMES_KEY, wishlist.games);
}

// ---------- Market items ----------
export const isWishedItem = (appid: number, hash: string) =>
  wishlist.items.some((i) => i.appid === appid && i.hash === hash);

export function toggleWishItem(it: Omit<WishItem, "added">) {
  wishlist.items = isWishedItem(it.appid, it.hash)
    ? wishlist.items.filter((x) => !(x.appid === it.appid && x.hash === it.hash))
    : [{ ...it, added: Date.now() }, ...wishlist.items];
  save(ITEMS_KEY, wishlist.items);
}
