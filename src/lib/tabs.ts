export type TabId =
  | "library"
  | "downloads"
  | "market"
  | "store"
  | "friends"
  | "groups";

export interface Tab {
  id: TabId;
  label: string;
  path: string;
  icon: string; // SVG path data
}

export const TABS: Tab[] = [
  { id: "library", label: "Library", path: "/", icon: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z" },
  { id: "downloads", label: "Downloads", path: "/downloads", icon: "M12 4v11 M7 10l5 5 5-5 M5 20h14" },
  { id: "market", label: "Market", path: "/market", icon: "M4 9l1.5-5h13L20 9 M4 9h16v11H4z M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0 M10 20v-5h4v5" },
  { id: "store", label: "Store", path: "/store", icon: "M6 7h12l1 13H5L6 7z M9 7a3 3 0 0 1 6 0" },
  { id: "friends", label: "Friends", path: "/friends", icon: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M17 11a2.5 2.5 0 1 0 0-5 M17 14c2.2 0 4 1.8 4 4" },
  { id: "groups", label: "Groups", path: "/groups", icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5 M12.5 15c1-.3 2.2-.5 3.5-.5 3.3 0 6 2.5 6 5.5" },
];

export const SETTINGS_TAB = {
  label: "Settings",
  path: "/settings",
  icon: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 5v4 M6 15v4",
};