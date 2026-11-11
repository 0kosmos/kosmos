import { API_BASE } from "./config";
import { settings } from "./settings.svelte";

// Steam Community Market (through our Worker). Steam allows at most 10 items per request
// without a login, so the Worker combines 3 pages (30 items) per call and caches answers.
// List prices are converted from US dollars (shown with "≈"); an item's details show
// Steam's exact prices in your currency.

export interface MarketItem {
  hash: string; // Steam's "market hash name" (identifies the item)
  name: string;
  appid: number;
  game: string;
  type: string;
  color: string; // name color (hex, no #), e.g. rarity color in CS2
  icon: string;
  listings: number;
  usdCents: number;
  priceText: string;
}

export interface Facet {
  key: string; // e.g. "730_Weapon"
  label: string; // e.g. "Weapon"
  tags: { id: string; label: string; count: number }[];
}

export interface MarketQuery {
  appid: number; // 0 = all games
  query: string;
  sort: "popular" | "price" | "quantity" | "name";
  dir: "asc" | "desc";
  filters: string[]; // "facetKey:tagId"
  min: number | null; // your currency, cents
  max: number | null;
}

export type MarketPage = { items: MarketItem[]; total: number; next: number; busy?: boolean; currency?: string };

// Games with a busy market (any other game's items can still be found with "All games" + search)
export const MARKET_GAMES = [
  { appid: 0, name: "All games" },
  { appid: 730, name: "Counter-Strike 2" },
  { appid: 570, name: "Dota 2" },
  { appid: 440, name: "Team Fortress 2" },
  { appid: 252490, name: "Rust" },
  { appid: 753, name: "Steam (cards, backgrounds, emoticons)" },
  { appid: 578080, name: "PUBG: BATTLEGROUNDS" },
  { appid: 2923300, name: "Banana" },
];

const cc = () => (settings.storeRegion ? `&cc=${settings.storeRegion}` : "");

const TTL = 10 * 60 * 1000;
const memory = new Map<string, { data: unknown; at: number }>();

async function get<T>(path: string): Promise<T> {
  const hit = memory.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Request failed");
  const data = (await res.json()) as T;
  if (memory.size > 60) memory.delete(memory.keys().next().value!);
  memory.set(path, { data, at: Date.now() });
  return data;
}

export const fetchFacets = (appid: number) =>
  appid ? get<{ facets: Facet[] }>(`/market/filters?appid=${appid}`).then((d) => d.facets) : Promise.resolve([]);

export function searchMarket(q: MarketQuery, start = 0) {
  const p = new URLSearchParams({ q: q.query, sort: q.sort, dir: q.dir, start: String(start), count: "30" });
  if (q.appid) p.set("appid", String(q.appid));
  if (q.filters.length) p.set("f", q.filters.join(","));
  if (q.min != null) p.set("min", String(q.min));
  if (q.max != null) p.set("max", String(q.max));
  return get<MarketPage>(`/market/search?${p}${cc()}`);
}

export const fetchMarketItem = (appid: number, hash: string) =>
  get<{ lowest: string; median: string; volume: string; currency: string }>(
    `/market/item?appid=${appid}&name=${encodeURIComponent(hash)}${cc()}`
  );

/** Steam's own market page for an item (opened in the Steam client, where you can buy it) */
export const marketListingUrl = (appid: number, hash: string) =>
  `steam://openurl/https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(hash)}`;
