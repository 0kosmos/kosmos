import { invoke } from "@tauri-apps/api/core";

// The small dot on "Downloads" in the sidebar:
//   orange = a game needs an update
//   white  = a game is installing (black in the white theme)
//   green  = a download finished since you last opened Downloads
// Read from Steam's and Epic's install files (quick reads of small local files) when Kosmos
// starts and when you come back to the window. While something is actually downloading, it
// also looks again every 30 seconds, only while the window is visible, to notice when it's done.

type SteamItem = { appid: number; status: string; firstInstall: boolean };
type EpicItem = { appName: string; installing: boolean; installed: boolean };

export const downloadsBadge = $state({
  updates: 0, // Steam games needing an update
  steamInstalls: 0, // Steam installs not finished
  epicInstalls: 0, // Epic installs not finished
  downloading: false, // a Steam download is running right now
  done: false, // something finished since you last opened Downloads
});

// What was pending last time (kept between app starts, so a download that finished while
// Kosmos was closed still turns the dot green)
const PENDING_KEY = "kosmos-pending-downloads";
function loadPending(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
let steamPending = new Set([...loadPending()].filter((k) => k.startsWith("s")));
let epicPending = new Set([...loadPending()].filter((k) => k.startsWith("e")));
function savePending() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...steamPending, ...epicPending]));
  } catch {
    /* ignore */
  }
}

/** Something that was pending is gone and now installed: it finished */
function finished(before: Set<string>, now: Set<string>, installedNow: Set<string>) {
  for (const k of before) if (!now.has(k) && installedNow.has(k)) return true;
  return false;
}

/** Called with Steam's install list (by the sidebar check and by the Downloads page) */
export function noteSteam(list: SteamItem[]) {
  const pending = list.filter((g) => g.status !== "installed");
  downloadsBadge.updates = pending.filter((g) => !g.firstInstall).length;
  downloadsBadge.steamInstalls = pending.filter((g) => g.firstInstall).length;
  downloadsBadge.downloading = pending.some((g) => g.status === "downloading");
  const now = new Set(pending.map((g) => "s" + g.appid));
  const installedNow = new Set(list.filter((g) => g.status === "installed").map((g) => "s" + g.appid));
  if (finished(steamPending, now, installedNow)) downloadsBadge.done = true;
  steamPending = now;
  savePending();
}

/** Called with your Epic games list */
export function noteEpic(games: EpicItem[]) {
  const now = new Set(games.filter((g) => g.installing).map((g) => "e" + g.appName));
  const installedNow = new Set(games.filter((g) => g.installed).map((g) => "e" + g.appName));
  if (finished(epicPending, now, installedNow)) downloadsBadge.done = true;
  epicPending = now;
  downloadsBadge.epicInstalls = now.size;
  savePending();
}

/** Dot color: orange (update) > white (installing) > green (finished), or none */
export function badgeKind(): "update" | "install" | "done" | "" {
  if (downloadsBadge.updates) return "update";
  if (downloadsBadge.steamInstalls + downloadsBadge.epicInstalls) return "install";
  return downloadsBadge.done ? "done" : "";
}

/** You opened Downloads: you've seen what finished */
export function clearDone() {
  downloadsBadge.done = false;
}

let last = 0;
export async function refreshDownloadsBadge(force = false) {
  if (!force && Date.now() - last < 60_000) return;
  last = Date.now();
  try {
    noteSteam(await invoke<SteamItem[]>("steam_installs"));
  } catch {
    /* not running inside Tauri, or no Steam */
  }
}
