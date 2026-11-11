import { API_BASE } from "./config";

export interface GameInfo {
  available: boolean;
  appid?: number;
  name?: string;
  shortDescription?: string;
  developers?: string[];
  publishers?: string[];
  releaseDate?: string;
  genres?: string[];
  header?: string;
  screenshots?: { thumb: string; full: string }[];
  requirements?: { minimum: string; recommended: string };
  reviews?: null | {
    summary: string;
    positive: number;
    negative: number;
    total: number;
    list: { text: string; positive: boolean; helpful: number; hours: number }[];
  };
}

export interface Review {
  id: string;
  steamid: string;
  name: string; // empty if Steam didn't send it
  avatar: string; // empty if Steam didn't send it
  text: string;
  positive: boolean;
  helpful: number;
  hours: number;
  date: number; // ms
  deck?: boolean; // played mostly on Steam Deck
  /** PC specs the reviewer chose to share on Steam (null if not shared) */
  hardware?: { os: string; cpu: string; gpu: string; ram: string; vram: string } | null;
}

// ---------- News / patch notes ----------
export type NewsBlock =
  | { t: "h" | "p" | "li"; text: string }
  | { t: "img"; src: string }
  | { t: "yt"; id: string }
  | { t: "hr" };

export interface NewsItem {
  id: string;
  title: string;
  date: number; // ms
  url: string;
  image: string;
  preview: string;
  blocks: NewsBlock[];
}

const newsMemory = new Map<number, NewsItem[]>();

export async function fetchNews(appid: number): Promise<NewsItem[]> {
  const hit = newsMemory.get(appid);
  if (hit) return hit;
  const res = await fetch(`${API_BASE}/news?appid=${appid}`);
  if (!res.ok) throw new Error("Request failed");
  const items = ((await res.json()).items ?? []) as NewsItem[];
  if (newsMemory.size > 15) newsMemory.delete(newsMemory.keys().next().value!);
  newsMemory.set(appid, items);
  return items;
}

export interface ReviewPage {
  list: Review[];
  cursor: string | null; // null = no more reviews
}

// First page of reviews per game, kept in memory so reopening a game is instant
const firstPages = new Map<number, ReviewPage>();

/** cursor "*" = first page. */
export async function fetchReviews(appid: number, cursor = "*"): Promise<ReviewPage> {
  if (cursor === "*") {
    const hit = firstPages.get(appid);
    if (hit) return hit;
  }
  const res = await fetch(
    `${API_BASE}/reviews?appid=${appid}&cursor=${encodeURIComponent(cursor)}`
  );
  if (!res.ok) throw new Error("Request failed");
  const page = (await res.json()) as ReviewPage;
  if (cursor === "*") {
    if (firstPages.size > 30) firstPages.delete(firstPages.keys().next().value!);
    firstPages.set(appid, page);
  }
  return page;
}

// Small in-memory copy so reopening a game is instant
const memory = new Map<number, GameInfo>();

export async function fetchGameInfo(appid: number): Promise<GameInfo> {
  const hit = memory.get(appid);
  if (hit) return hit;

     const res = await fetch(`${API_BASE}/game?appid=${appid}&v=2`);
  if (!res.ok) throw new Error("Request failed");
  const info = (await res.json()) as GameInfo;

  if (memory.size > 30) memory.delete(memory.keys().next().value!);
  memory.set(appid, info);
  return info;
}