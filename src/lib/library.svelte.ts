import { API_BASE } from "./config";
import { account, setSteamId } from "./account.svelte";

export interface Game {
  appid: number;
  name: string;
  hours: number;
  lastPlayed: number;
}

type Status = "idle" | "loading" | "ready" | "private" | "error";

const CACHE_KEY = "kosmos-games-v1";

export const library = $state({
  games: [] as Game[],
  status: "idle" as Status,
  updatedAt: 0,
});

export async function loadLibrary() {
  const id = account.steamid;
  if (!id) {
    library.games = [];
    library.status = "idle";
    return;
  }

  // Step 1: show the saved copy straight away
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.steamid === id) {
        library.games = cached.games;
        library.updatedAt = cached.updatedAt;
        library.status = "ready";
      }
    }
  } catch {
    /* ignore a broken cache */
  }
  if (library.status !== "ready") library.status = "loading";

  // Step 2: refresh quietly in the background
  try {
    const res = await fetch(`${API_BASE}/games?steamid=${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");

    if (data.private) {
      library.games = [];
      library.status = "private";
      return;
    }

    library.games = data.games;
    library.updatedAt = Date.now();
    library.status = "ready";
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ steamid: id, games: data.games, updatedAt: library.updatedAt })
      );
    } catch {
      /* ignore */
    }
  } catch {
    // If we already show the saved copy, keep it; otherwise show the error
    if (library.status !== "ready") library.status = "error";
  }
}

export function disconnect() {
  setSteamId("");
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  library.games = [];
  library.status = "idle";
}