import { API_BASE } from "./config";

// Your own Steam profile (picture, name, online status) for the box at the bottom of the sidebar.
// Saved on this PC so it shows instantly at startup, then refreshed: when you sign in, and when
// you come back to the window (at most once a minute). No timer runs in the background.

export interface MyProfile {
  steamid: string;
  name: string;
  avatar: string;
  state: number | null; // 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 trade, 6 play (null = unknown)
  game: string; // the game Steam says you're in
}

const KEY = "kosmos-my-profile";
const MIN_GAP = 60_000;

function loadSaved(): MyProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    return p && typeof p.steamid === "string" ? p : null;
  } catch {
    return null;
  }
}

export const me = $state<{ p: MyProfile | null }>({ p: loadSaved() });
let lastFetch = 0;
let lastId = "";

export async function refreshProfile(steamid: string, force = false) {
  if (!steamid) {
    me.p = null;
    lastId = "";
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  if (!force && steamid === lastId && Date.now() - lastFetch < MIN_GAP) return;
  lastId = steamid;
  lastFetch = Date.now();
  try {
    const res = await fetch(`${API_BASE}/profile?steamid=${steamid}`);
    if (!res.ok) return;
    const d = await res.json();
    const p: MyProfile = {
      steamid: d.steamid ?? steamid,
      name: d.name ?? "",
      avatar: d.avatar ?? "",
      state: typeof d.state === "number" ? d.state : null,
      game: d.game ?? "",
    };
    me.p = p;
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* offline: keep what we had */
  }
}

const STATE: Record<number, string> = { 0: "Offline", 1: "Online", 2: "Busy", 3: "Away", 4: "Snooze", 5: "Looking to trade", 6: "Looking to play" };

/** "Online", "Playing X", "Offline"... (empty if the Worker didn't say) */
export function statusText(p: MyProfile): string {
  if (p.game) return "Playing " + p.game;
  return p.state == null ? "" : STATE[p.state] ?? "Online";
}

/** Color group for the status dot */
export function statusKind(p: MyProfile): "game" | "online" | "away" | "offline" {
  if (p.game) return "game";
  if (p.state == null || p.state === 0) return "offline";
  return p.state === 3 || p.state === 4 ? "away" : "online";
}
