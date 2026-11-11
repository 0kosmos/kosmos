import { invoke } from "@tauri-apps/api/core";

// Which games Steam has installed (from Steam's registry entries, read in one go).
// known = false until the first read worked; tiles then just show "Play".
export const installed = $state({ ids: new Set<number>(), known: false });

let busy = false;

export async function refreshInstalled() {
  if (busy) return;
  busy = true;
  try {
    const ids = await invoke<number[]>("installed_apps");
    installed.ids = new Set(ids); // replace the whole set so the tiles update
    installed.known = true;
  } catch {
    /* not running inside Tauri, or no Steam: leave as unknown */
  } finally {
    busy = false;
  }
}
