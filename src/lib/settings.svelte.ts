import { TABS, type TabId } from "./tabs";

export type Theme = "dark" | "light";

interface Settings {
  order: TabId[];
  enabled: Record<TabId, boolean>;
  reduceMotion: boolean;
  theme: Theme;
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
  return { order: [...ALL_IDS], enabled, reduceMotion: windowsReducesMotion(), theme: "dark", sidebarWidth: SIDEBAR_MIN };
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
      sidebarWidth: clampSidebar(Number(saved.sidebarWidth) || SIDEBAR_MIN),
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