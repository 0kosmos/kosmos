import { API_BASE } from "./config";

// Steam store tags for your games (Horror, Multiplayer, FPS ...) for the Categories tab.
// Fetched only when that tab is opened, 50 games per request, saved on disk for 7 days.
// After that, only games that are new in your library (or older than 7 days) are fetched again.

const KEY = "kosmos-game-tags-v1";
const TTL = 7 * 24 * 60 * 60 * 1000;
const BATCH = 50;

type Saved = Record<string, { t: string[]; at: number }>;

let saved: Saved = {};
try {
  saved = JSON.parse(localStorage.getItem(KEY) || "{}");
} catch {
  /* ignore a broken file */
}

function current(): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const [id, e] of Object.entries(saved)) out[Number(id)] = e.t;
  return out;
}

export const gameTags = $state({
  tags: current(), // appid -> tags, most popular first
  loading: false,
  failed: false,
});

let running = false;

/** Make sure we have tags for these games. Safe to call more than once. */
export async function loadTags(appids: number[]) {
  if (running) return;
  const now = Date.now();
  const missing = appids.filter((id) => !saved[id] || now - saved[id].at > TTL);
  if (!missing.length) return;

  running = true;
  gameTags.loading = true;
  gameTags.failed = false;
  try {
    // One batch after the other (not all at once), to be gentle with Steam
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const res = await fetch(`${API_BASE}/tags?appids=${chunk.join(",")}`);
      if (!res.ok) throw new Error("Request failed");
      const data = (await res.json()).tags as Record<string, string[]>;
      const at = Date.now();
      for (const id of chunk) saved[id] = { t: data[id] ?? [], at };
      gameTags.tags = current(); // show what we have so far
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* ignore: tags just won't be remembered */
    }
  } catch {
    gameTags.failed = true;
  } finally {
    gameTags.loading = false;
    running = false;
  }
}
