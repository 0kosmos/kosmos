export type TabId =
  | "library"
  | "store"
  | "workshop"
  | "community"
  | "friends"
  | "profile";

export interface Tab {
  id: TabId;
  label: string;
  path: string;
  icon: string; // SVG path data
}

export const TABS: Tab[] = [
  { id: "library", label: "Library", path: "/", icon: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z" },
  { id: "store", label: "Store", path: "/store", icon: "M6 7h12l1 13H5L6 7z M9 7a3 3 0 0 1 6 0" },
  { id: "workshop", label: "Workshop", path: "/workshop", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M12 12l8-4.5 M12 12v9 M12 12L4 7.5" },
  { id: "community", label: "Community", path: "/community", icon: "M4 5h16v11H9l-5 4V5z" },
  { id: "friends", label: "Friends", path: "/friends", icon: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M17 11a2.5 2.5 0 1 0 0-5 M17 14c2.2 0 4 1.8 4 4" },
  { id: "profile", label: "Profile", path: "/profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" },
];

export const SETTINGS_TAB = {
  label: "Settings",
  path: "/settings",
  icon: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 5v4 M6 15v4",
};