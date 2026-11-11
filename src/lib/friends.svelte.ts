import { API_BASE } from "./config";

// Your Steam friends with their status (through our Worker). Status is refreshed when you open
// the Friends tab, when you come back to the window, and every minute while the tab is visible.

export interface Friend {
  steamid: string;
  name: string;
  avatar: string;
  state: number; // 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 trade, 6 play
  game: string; // game they're playing, if Steam shows it
  gameId: number;
  lastOnline: number; // ms
  since: number; // friends since, ms
  profileUrl: string;
}

export async function fetchFriends(steamid: string): Promise<{ private: boolean; friends: Friend[] }> {
  const res = await fetch(`${API_BASE}/friends?steamid=${steamid}`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

// ---------- Pinned friends (saved on this PC) ----------
const PIN_KEY = "kosmos-pinned-friends";
function loadPins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}
export const pins = $state({ ids: loadPins() });

export function togglePin(steamid: string) {
  pins.ids = pins.ids.includes(steamid) ? pins.ids.filter((x) => x !== steamid) : [...pins.ids, steamid];
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins.ids));
  } catch {
    /* ignore */
  }
}

/** Opens a chat with this friend in the Steam client */
export const chatLink = (steamid: string) => `steam://friends/message/${steamid}`;
