import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

// Your Epic Games library, read from the Epic Games Launcher's own files on this PC by the
// Rust side (src-tauri/src/epic.rs): the games you own and which ones are installed.
// The launcher updates those files whenever it runs, so no Epic login is needed.
// Read when the Library opens and when you come back to the window; it's a quick read of a
// few local files, nothing runs in the background.

export interface EpicGame {
  appName: string; // Epic's ID for the game
  name: string;
  namespace: string;
  itemId: string;
  installed: boolean;
  installDir: string;
  sizeBytes: number;
  cover: string; // tall cover picture on Epic's image server (may be empty)
}

export const epic = $state({ games: [] as EpicGame[] });

let lastRead = 0;

export async function loadEpic() {
  if (Date.now() - lastRead < 10_000) return; // just read it
  lastRead = Date.now();
  try {
    epic.games = await invoke<EpicGame[]>("epic_library");
  } catch {
    /* not running inside Tauri: no Epic games */
  }
}

const link = (g: EpicGame, action: "launch" | "install") =>
  `com.epicgames.launcher://apps/${encodeURIComponent(`${g.namespace}:${g.itemId}:${g.appName}`)}?action=${action}&silent=true`;

/** Ask the Epic launcher to start the game (it opens the launcher if it isn't running) */
export const playEpic = (g: EpicGame) => openUrl(link(g, "launch"));

/** Ask the Epic launcher to install the game (it shows its own install window) */
export const installEpic = (g: EpicGame) => openUrl(link(g, "install"));

/** Cover at tile size: Epic's image server shrinks it for us (about 40 KB instead of 800 KB) */
export const smallCover = (url: string) => (url ? url + "?h=480&quality=medium&resize=1&w=360" : "");
