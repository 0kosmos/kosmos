import { invoke, convertFileSrc } from "@tauri-apps/api/core";

// Your own games and apps in the Library (anything that isn't from Steam or Epic): a program,
// a shortcut or a web shortcut you picked. Saved on this PC. Cover pictures you pick are
// copied into Kosmos's own folder by the Rust side (src-tauri/src/custom.rs).

export interface CustomGame {
  id: string;
  name: string;
  path: string; // the program or shortcut
  cover: string; // copied picture on this PC ("" = none: the tile shows the name)
  fileBytes: number;
  folderBytes: number; // the folder it's in (usually the game's real size), 0 if unknown
  added: number; // ms
}

export interface FileInfo {
  exists: boolean;
  name: string;
  fileBytes: number;
  folderBytes: number;
}

const KEY = "kosmos-custom-games";

function load(): CustomGame[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((g) => g && typeof g.id === "string" && typeof g.path === "string") : [];
  } catch {
    return [];
  }
}

export const custom = $state({ games: load() });

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom.games));
  } catch {
    /* ignore */
  }
}

export const newId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const fileInfo = (path: string) => invoke<FileInfo>("custom_file_info", { path });

/** Copy a picture into Kosmos's folder; returns where the copy is */
export const saveCover = (source: string, id: string) => invoke<string>("custom_cover_save", { source, id });

/** Delete pictures of a game except the one in use (after saving or cancelling) */
export const cleanCovers = (id: string, keep: string) => invoke("custom_cover_delete", { id, keep }).catch(() => {});

export function addGame(g: CustomGame) {
  custom.games = [...custom.games, g];
  save();
}

export function updateGame(id: string, changes: Partial<CustomGame>) {
  custom.games = custom.games.map((g) => (g.id === id ? { ...g, ...changes } : g));
  save();
}

export function removeGame(id: string) {
  custom.games = custom.games.filter((g) => g.id !== id);
  save();
  invoke("custom_cover_delete", { id, keep: null }).catch(() => {});
}

export const launchGame = (g: CustomGame) => invoke("custom_launch", { path: g.path });

/** A picture file on this PC as something the page can show */
export const coverUrl = (path: string) => (path ? convertFileSrc(path) : "");

export function fmtBytes(b: number) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return Math.round(b / 1e6) + " MB";
  return b ? Math.max(1, Math.round(b / 1e3)) + " KB" : "0 KB";
}
