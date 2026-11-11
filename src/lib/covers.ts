import { API_BASE } from "./config";

// Finds cover images for games whose normal image links don't work.
// Newer games keep their images at "coded" addresses that only Steam's store API knows,
// so we ask our Worker for them. Requests are grouped (up to 50 games per request)
// and the answers are saved on disk for 7 days.

const KEY = "kosmos-covers-v1";
const TTL = 7 * 24 * 60 * 60 * 1000;
const BATCH = 50;

type Entry = { url: string | null; at: number }; // url null = Steam has no image
let cache: Record<string, Entry> = {};
try {
  cache = JSON.parse(localStorage.getItem(KEY) || "{}");
} catch {
  /* ignore a broken cache */
}

/** string = saved cover, null = we know there's no image, undefined = never asked */
export function cachedCover(appid: number): string | null | undefined {
  const e = cache[appid];
  if (!e || Date.now() - e.at > TTL) return undefined;
  return e.url;
}

const waiting = new Map<number, ((url: string | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Ask for a cover. Calls made close together are sent as one request. */
export function findCover(appid: number): Promise<string | null> {
  return new Promise((resolve) => {
    const list = waiting.get(appid) ?? [];
    list.push(resolve);
    waiting.set(appid, list);
    timer ??= setTimeout(flush, 150);
  });
}

async function flush() {
  timer = undefined;
  const jobs = new Map(waiting);
  waiting.clear();
  const ids = [...jobs.keys()];

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let covers: Record<string, string | null> = {};
    let ok = false;
    try {
      const res = await fetch(`${API_BASE}/covers?appids=${chunk.join(",")}`);
      if (res.ok) {
        covers = (await res.json()).covers ?? {};
        ok = true;
      }
    } catch {
      /* network problem: don't save anything, try again next time */
    }

    for (const id of chunk) {
      const url = covers[id] ?? null;
      if (ok) cache[id] = { url, at: Date.now() };
      for (const done of jobs.get(id)!) done(url);
    }
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore: covers just won't be remembered */
  }
}
