import { TABS, type TabId } from "./tabs";

export type Theme = "dark" | "light";
export type Accent =
  | "mono" | "red" | "orange" | "amber" | "emerald" | "teal"
  | "cyan" | "blue" | "indigo" | "violet" | "pink" | "rose";
/** Accent colors offered in Settings, in rainbow order (the actual colors are in app.css) */
export const ACCENTS: { id: Accent; label: string }[] = [
  { id: "mono", label: "Mono" },
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
  { id: "amber", label: "Amber" },
  { id: "emerald", label: "Emerald" },
  { id: "teal", label: "Teal" },
  { id: "cyan", label: "Cyan" },
  { id: "blue", label: "Blue" },
  { id: "indigo", label: "Indigo" },
  { id: "violet", label: "Violet" },
  { id: "pink", label: "Pink" },
  { id: "rose", label: "Rose" },
];
export type StorePlatform = "any" | "windows" | "mac" | "linux" | "deck";

interface Settings {
  order: TabId[];
  enabled: Record<TabId, boolean>;
  reduceMotion: boolean;
  storeRegion: string; // "" = automatic (where you are), or a 2-letter country code (sets the currency)
  storeExclude: number[]; // Steam mature-content descriptors to hide in the store (1-5)
  storePlatform: StorePlatform; // only show store games that run on this
  closeToTray: boolean; // X minimizes to the system tray instead of quitting (off by default)
  liveStats: boolean; // live CPU / GPU / RAM of the running game (off by default)
  theme: Theme;
  accent: Accent; // color of buttons, switches and links
  librarySteam: boolean; // show Steam games in the Library
  libraryEpic: boolean; // show games installed with the Epic Games Launcher
  storeEpic: boolean; // Epic Games free games in the Store (Steam is always shown)
  statusBar: boolean; // thin bar at the bottom: time, version, CPU and memory
  timeZone: string; // time zone for the status bar clock, e.g. "Europe/Rome" ("" = this PC's)
  sidebarWidth: number; // px, dragged with the handle on the sidebar's right edge
}

// Sidebar width: default 220 px; at most 2 game columns wider (2 x (160 px tile + 14 px gap))
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = SIDEBAR_MIN + 2 * (160 + 14);
export const clampSidebar = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

const KEY = "kosmos-settings-v1";
const ALL_IDS = TABS.map((t) => t.id);

function defaults(): Settings {
  const enabled = {} as Record<TabId, boolean>;
  for (const id of ALL_IDS) enabled[id] = true;
  return { order: [...ALL_IDS], enabled, reduceMotion: windowsReducesMotion(), liveStats: false, closeToTray: false, storeRegion: "", storeExclude: [3, 4], storePlatform: "any", theme: "dark", accent: "mono", librarySteam: true, libraryEpic: true, storeEpic: true, statusBar: true, timeZone: "", sidebarWidth: SIDEBAR_MIN };
}

// On first launch, start out matching Windows' "Show animations" setting
function windowsReducesMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function load(): Settings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);

    const order: TabId[] = Array.isArray(saved.order)
      ? saved.order.filter((id: TabId) => ALL_IDS.includes(id))
      : [];
    // If a future version adds a tab, make sure it shows up
    for (const id of ALL_IDS) if (!order.includes(id)) order.push(id);

    const enabled = { ...base.enabled, ...saved.enabled };
    enabled.library = true; // Library can never be turned off

    const theme: Theme = saved.theme === "light" ? "light" : "dark";

    return {
      order,
      enabled,
      // Older versions had a separate "performance mode"; carry it over if it was on
      reduceMotion:
        typeof saved.reduceMotion === "boolean" ? saved.reduceMotion : !!saved.performanceMode,
      theme,
      librarySteam: saved.librarySteam !== false,
      libraryEpic: saved.libraryEpic !== false,
      storeEpic: saved.storeEpic !== false,
      statusBar: saved.statusBar !== false,
      timeZone: validZone(saved.timeZone) ? saved.timeZone : "",
      accent: ACCENTS.some((a) => a.id === saved.accent) ? saved.accent : "mono",
      sidebarWidth: clampSidebar(Number(saved.sidebarWidth) || SIDEBAR_MIN),
      liveStats: !!saved.liveStats,
      closeToTray: !!saved.closeToTray,
      storeRegion: typeof saved.storeRegion === "string" && /^([A-Z]{2})?$/.test(saved.storeRegion) ? saved.storeRegion : "",
      storeExclude: Array.isArray(saved.storeExclude) ? saved.storeExclude.filter((n: number) => n >= 1 && n <= 5) : [3, 4],
      storePlatform: (["any", "windows", "mac", "linux", "deck"] as const).includes(saved.storePlatform) ? saved.storePlatform : "any",
    };
  } catch {
    return base;
  }
}

export const settings: Settings = $state(load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(settings)));
  } catch {
    /* ignore: settings just won't persist */
  }
}

export function toggleTab(id: TabId) {
  if (id === "library") return;
  settings.enabled[id] = !settings.enabled[id];
  save();
}

export function moveTab(id: TabId, direction: -1 | 1) {
  const i = settings.order.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= settings.order.length) return;
  [settings.order[i], settings.order[j]] = [settings.order[j], settings.order[i]];
  save();
}

/**
 * New order for the tabs shown in the sidebar (after a drag).
 * Hidden tabs keep their place in the full order; only the visible ones are rearranged.
 */
export function reorderVisible(newVisible: TabId[]) {
  const slots: number[] = [];
  settings.order.forEach((id, i) => {
    if (newVisible.includes(id)) slots.push(i);
  });
  if (slots.length !== newVisible.length) return; // something changed meanwhile; ignore
  const next = [...settings.order];
  slots.forEach((slot, k) => (next[slot] = newVisible[k]));
  settings.order = next;
  save();
}

export function setReduceMotion(on: boolean) {
  settings.reduceMotion = on;
  save();
}

export function setSidebarWidth(w: number) {
  settings.sidebarWidth = clampSidebar(w);
  save();
}

export function setTheme(theme: Theme) {
  settings.theme = theme;
  save();
}
export function setAccent(accent: Accent) {
  settings.accent = accent;
  save();
}
export function setLibrarySource(source: "steam" | "epic", on: boolean) {
  if (source === "steam") settings.librarySteam = on;
  else settings.libraryEpic = on;
  save();
}
/** Is this a time zone Windows / the browser knows? */
function validZone(z: unknown): z is string {
  if (typeof z !== "string" || !z) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: z });
    return true;
  } catch {
    return false;
  }
}
export function setStatusBar(on: boolean) {
  settings.statusBar = on;
  save();
}
export function setTimeZone(zone: string) {
  settings.timeZone = validZone(zone) ? zone : "";
  save();
}
export function setStoreEpic(on: boolean) {
  settings.storeEpic = on;
  save();
}
export function setLiveStats(on: boolean) {
  settings.liveStats = on;
  save();
}

export function setCloseToTray(on: boolean) {
  settings.closeToTray = on;
  save();
}

export function setStoreRegion(cc: string) {
  settings.storeRegion = cc;
  save();
}

export function toggleStoreExclude(id: number) {
  settings.storeExclude = settings.storeExclude.includes(id)
    ? settings.storeExclude.filter((x) => x !== id)
    : [...settings.storeExclude, id];
  save();
}

export function setStorePlatform(p: StorePlatform) {
  settings.storePlatform = p;
  save();
}
