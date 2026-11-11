import { invoke } from "@tauri-apps/api/core";

// How many Steam games need an update or have a download going, for the small dot on
// "Downloads" in the sidebar. Read from Steam's install files (a quick read of small local
// files) when Kosmos starts and when you come back to the window, at most once a minute.
// The Downloads page also updates it whenever it reads the same files. No timer runs.

export const downloadsBadge = $state({ steam: 0 });

let last = 0;

export async function refreshDownloadsBadge() {
  if (Date.now() - last < 60_000) return;
  last = Date.now();
  try {
    const list = await invoke<{ status: string }[]>("steam_installs");
    setSteamPending(list.filter((g) => g.status !== "installed").length);
  } catch {
    /* not running inside Tauri, or no Steam */
  }
}

/** Called by the Downloads page with what it just read */
export function setSteamPending(n: number) {
  downloadsBadge.steam = n;
}
