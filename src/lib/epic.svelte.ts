import { invoke } from "@tauri-apps/api/core";

// Your Epic Games library, read from the Epic Games Launcher's own files on this PC by the
// Rust side (src-tauri/src/epic.rs): the games you own, which ones are installed, and installs
// that are still in progress. The launcher updates those files whenever it runs, so no Epic
// login is needed. Read when the Library or Downloads opens and when you come back to the
// window; it's a quick read of a few local files, nothing runs in the background.
// Opening things in the Epic launcher is also done by the Rust side (it checks every link).

export interface EpicGame {
  appName: string; // Epic's ID for the game
  name: string;
  namespace: string;
  itemId: string;
  installed: boolean;
  installing: boolean; // install started but not finished (downloading or paused in Epic)
  installDir: string;
  sizeBytes: number;
  cover: string; // tall cover picture on Epic's image server (may be empty)
  wide: string; // wide picture, for lists (may be empty)
}

export const epic = $state({ games: [] as EpicGame[] });

let lastRead = 0;

export async function loadEpic(force = false) {
  if (!force && Date.now() - lastRead < 10_000) return; // just read it
  lastRead = Date.now();
  try {
    epic.games = await invoke<EpicGame[]>("epic_library");
  } catch {
    /* not running inside Tauri: no Epic games */
  }
}

/** "sent", or "starting" when the Epic launcher wasn't running: Kosmos starts it and sends
 *  the request once it's ready (that can take a little while) */
export type EpicResult = "sent" | "starting";

const app = (g: EpicGame, action: "launch" | "install") =>
  invoke<EpicResult>("epic_app", { action, namespace: g.namespace, itemId: g.itemId, appName: g.appName });

/** Ask the Epic launcher to start the game (it opens the launcher if it isn't running) */
export const playEpic = (g: EpicGame) => app(g, "launch");

/** Ask the Epic launcher to install the game (it shows its own install window) */
export const installEpic = (g: EpicGame) => app(g, "install");

/** Your library in the Epic launcher (installs in progress, uninstalling...) */
export const openEpicLibrary = () => invoke<EpicResult>("epic_page", { page: "library" });

/** A game's page on the Epic Games Store website, by its page name */
export const openEpicStorePage = (slug: string) => invoke<EpicResult>("epic_page", { page: "store", slug });

/** The Epic Games Store website, searching for a game (for games without a known page name) */
export const searchEpicStore = (name: string) => invoke<EpicResult>("epic_page", { page: "search", slug: name });

/** Cover at tile size: Epic's image server shrinks it for us (about 40 KB instead of 800 KB) */
export const smallCover = (url: string, width = 360) =>
  url ? url + (width === 360 ? "?h=480&quality=medium&resize=1&w=360" : `?w=${width}&resize=1&quality=medium`) : "";
