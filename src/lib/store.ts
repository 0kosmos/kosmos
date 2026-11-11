import { API_BASE } from "./config";
import { settings } from "./settings.svelte";

// Your store settings, added to every store request (region = currency, mature content, platform)
function prefsParams(showMature = false) {
  const p = new URLSearchParams();
  if (settings.storeRegion) p.set("cc", settings.storeRegion);
  if (settings.storeExclude.length && !showMature) p.set("exclude", [...settings.storeExclude].sort().join(","));
  if (settings.storePlatform !== "any") p.set("platform", settings.storePlatform);
  return p.toString();
}
const withPrefs = (path: string, showMature = false) => { const q = prefsParams(showMature); return q ? path + (path.includes("?") ? "&" : "?") + q : path; };

// Steam store data (through our Worker). Prices come in your country's currency.
// Answers are kept in memory for 15 minutes, so going back and forth costs nothing.

export interface StoreGame {
  appid: number;
  name: string;
  image: string;
  free: boolean;
  price: number | null; // cents
  priceText: string;
  originalText: string; // "" when not discounted
  discount: number; // %
  discountEnds: number; // ms, 0 = unknown
  reviewPct: number | null;
  reviewLabel: string;
  reviewCount: number;
}

export interface BrowseQuery {
  sort: "top" | "rating" | "name";
  tags: number[];
  discounted: boolean;
  free: boolean;
  maxPrice: number | null; // cents, null = any
  minReview: number; // %, 0 = any
}

const TTL = 15 * 60 * 1000;
const memory = new Map<string, { data: unknown; at: number }>();

async function get<T>(rawPath: string, showMature = false): Promise<T> {
  const path = withPrefs(rawPath, showMature); // settings are part of the cache key too
  const hit = memory.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Request failed");
  const data = (await res.json()) as T;
  if (memory.size > 40) memory.delete(memory.keys().next().value!);
  memory.set(path, { data, at: Date.now() });
  return data;
}

export const fetchDeals = () => get<{ items: StoreGame[] }>("/store/deals").then((d) => d.items);

/** What your content settings hid from a search, per reason (1-5 = Steam content descriptors) */
export type Hidden = Partial<Record<"1" | "2" | "3" | "4" | "5" | "platform", number>>;
export type SearchPage = { items: StoreGame[]; total: number; next: number; hidden: Hidden };

/** Full store search (same as the Steam website). First 50 results, then 40 per "Load more".
 *  showMature = ignore your mature-content settings for this search only (settings stay as they are). */
export const searchStore = (q: string, start = 0, count = 50, showMature = false) =>
  get<SearchPage>(`/store/search?q=${encodeURIComponent(q)}&start=${start}&count=${count}`, showMature);

/** First call: 50 games. "Load more": 40 more each time. */
export function browseStore(q: BrowseQuery, start = 0, count = 50) {
  const p = new URLSearchParams({ sort: q.sort, start: String(start), count: String(count) });
  if (q.tags.length) p.set("tags", q.tags.join(","));
  if (q.discounted) p.set("discounted", "1");
  if (q.free) p.set("free", "1");
  if (q.maxPrice != null) p.set("max", String(q.maxPrice));
  if (q.minReview) p.set("review", String(q.minReview));
  return get<{ items: StoreGame[]; next: number }>(`/store/browse?${p}`);
}

/** Popular Steam tags for the store's filter (Steam's own tag numbers) */
export const STORE_TAGS = [
  { id: 19, name: "Action" }, { id: 21, name: "Adventure" }, { id: 122, name: "RPG" },
  { id: 9, name: "Strategy" }, { id: 599, name: "Simulation" }, { id: 492, name: "Indie" },
  { id: 597, name: "Casual" }, { id: 1667, name: "Horror" }, { id: 3859, name: "Multiplayer" },
  { id: 1685, name: "Co-op" }, { id: 1663, name: "FPS" }, { id: 1774, name: "Shooter" },
  { id: 1695, name: "Open World" }, { id: 1662, name: "Survival" }, { id: 1716, name: "Roguelike" },
  { id: 1664, name: "Puzzle" }, { id: 1625, name: "Platformer" }, { id: 1742, name: "Story Rich" },
  { id: 701, name: "Sports" }, { id: 699, name: "Racing" }, { id: 1743, name: "Fighting" },
  { id: 3810, name: "Sandbox" }, { id: 1643, name: "Building" }, { id: 3834, name: "Exploration" },
  { id: 4085, name: "Anime" }, { id: 4182, name: "Singleplayer" }, { id: 4166, name: "Atmospheric" },
];
