import { API_BASE } from "./config";

export interface GameInfo {
  available: boolean;
  appid?: number;
  name?: string;
  shortDescription?: string;
  developers?: string[];
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