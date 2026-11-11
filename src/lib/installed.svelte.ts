import { invoke } from "@tauri-apps/api/core";

// Install state of every game Steam knows about on this PC, from Steam's install files
// (plus its live "updating" flag). Games not in the map are not installed.
//   "ready"          installed, can play
//   "installing"     first install downloading right now
//   "updating"       update downloading right now
//   "install-paused" install started but not running (paused / not in queue)
//   "update-paused"  update started but not running
export type InstallState = "ready" | "installing" | "updating" | "install-paused" | "update-paused";

export const installed = $state({ states: new Map<number, InstallState>(), known: false });

let busy = false;
let timer: ReturnType<typeof setInterval> | undefined;

export async function refreshInstalled() {
  if (busy) return;
  busy = true;
  try {
    const list = await invoke<{ appid: number; state: InstallState }[]>("install_states");
    installed.states = new Map(list.map((x) => [x.appid, x.state])); // replace, so tiles update
    installed.known = true;
  } catch {
    /* not running inside Tauri, or no Steam: leave as unknown */
  } finally {
    busy = false;
  }

  // While something is downloading, re-check every 3 s (only while the window is visible),
  // so buttons switch to "Play" when it finishes. Stops by itself when nothing downloads.
  const downloading = [...installed.states.values()].some((s) => s === "installing" || s === "updating");
  if (downloading && !timer) {
    timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshInstalled();
    }, 3000);
  } else if (!downloading && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

/** Button label/action info for a game. */
export function stateOf(appid: number): InstallState | "not-installed" | "unknown" {
  if (!installed.known) return "unknown";
  return installed.states.get(appid) ?? "not-installed";
}
