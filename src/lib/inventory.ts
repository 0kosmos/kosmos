import { API_BASE } from "./config";
import { settings } from "./settings.svelte";

// Your Steam inventory (through our Worker): which games you have items in, the items, and
// their Community Market prices. Steam is strict about how often it may be asked, so:
// - games and items are kept in memory for 10 minutes
// - prices are asked 10 at a time and remembered on this PC for 6 hours

export interface InvGame {
  appid: number;
  name: string;
  icon: string;
  count: number;
  contexts: { id: string; name: string; count: number }[];
}

export interface InvItem {
  id: string;
  name: string;
  hash: string; // market name
  type: string;
  color: string;
  icon: string;
  amount: number;
  marketable: boolean;
  tradable: boolean;
}

export interface Price {
  lowest: string; // e.g. "1,23€"
  median: string;
  value: number | null; // as a number, for the total
}

const cc = () => (settings.storeRegion ? `&cc=${settings.storeRegion}` : "");

const TTL = 10 * 60 * 1000;
const memory = new Map<string, { data: unknown; at: number }>();
async function get<T>(path: string, keep = true): Promise<T> {
  const hit = memory.get(path);
  if (keep && hit && Date.now() - hit.at < TTL) return hit.data as T;
  // Not "keep" (Refresh / Check again): ask Steam right now, skipping every saved copy
  const res = await fetch(API_BASE + path + (keep ? "" : "&fresh=1&t=" + Date.now()), keep ? {} : { cache: "no-store" });
  if (!res.ok) throw new Error("Request failed");
  const data = (await res.json()) as T & { busy?: boolean; private?: boolean };
  // Never keep a "busy" or "private" answer: a change on Steam should show right away
  if (!data.busy && !data.private) memory.set(path, { data, at: Date.now() });
  return data;
}

export const fetchInvGames = (steamid: string, fresh = false) =>
  get<{ private: boolean; busy?: boolean; games: InvGame[] }>(`/inventory/games?steamid=${steamid}`, !fresh);

export const fetchInvItems = (steamid: string, appid: number, context: string, fresh = false) =>
  get<{ private: boolean; busy?: boolean; items: InvItem[]; total?: number }>(
    `/inventory/items?steamid=${steamid}&appid=${appid}&context=${context}`,
    !fresh
  );

// ---------- Prices (remembered for 6 hours, per currency) ----------
const PRICE_KEY = "kosmos-item-prices";
const PRICE_TTL = 6 * 60 * 60 * 1000;
type Saved = Record<string, Price & { at: number }>;
function loadPrices(): Saved {
  try {
    return JSON.parse(localStorage.getItem(PRICE_KEY) || "{}");
  } catch {
    return {};
  }
}
let saved = loadPrices();
const priceKey = (appid: number, hash: string) => `${settings.storeRegion || "auto"}|${appid}|${hash}`;

/** A price we already know (and is less than 6 hours old) */
export function knownPrice(appid: number, hash: string): Price | null {
  const p = saved[priceKey(appid, hash)];
  return p && Date.now() - p.at < PRICE_TTL ? p : null;
}

/** Ask for up to 10 prices. Returns busy = true when Steam said "slow down". */
export async function fetchPrices(appid: number, hashes: string[]): Promise<{ prices: Record<string, Price>; busy: boolean }> {
  const names = hashes.slice(0, 10).map(encodeURIComponent).join("|");
  const res = await fetch(`${API_BASE}/market/prices?appid=${appid}&names=${names}${cc()}`);
  if (!res.ok) throw new Error("Request failed");
  const d = (await res.json()) as { prices: Record<string, Price>; busy: boolean };
  const now = Date.now();
  for (const [hash, p] of Object.entries(d.prices || {})) saved[priceKey(appid, hash)] = { ...p, at: now };
  // Drop old prices so the saved list doesn't keep growing
  for (const [k, p] of Object.entries(saved)) if (now - p.at > PRICE_TTL) delete saved[k];
  try {
    localStorage.setItem(PRICE_KEY, JSON.stringify(saved));
  } catch {
    saved = {}; // full: start over
  }
  return { prices: d.prices || {}, busy: !!d.busy };
}

/** Format a total in the same style as Steam's prices (uses the first price as the example) */
export function formatTotal(value: number, example: string) {
  const symbolBefore = /^[^\d]+/.exec(example.trim())?.[0]?.trim() ?? "";
  const symbolAfter = /[^\d.,\s-]+$/.exec(example.trim())?.[0] ?? "";
  const comma = /\d,\d{2}(?!\d)/.test(example);
  let n = value.toFixed(2);
  if (comma) n = n.replace(".", ",");
  return `${symbolBefore}${n}${symbolAfter}`;
}
