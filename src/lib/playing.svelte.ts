import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// The game Steam is currently running (appid 0 = none).
// The Rust side tells us when it changes; we never check on a timer.
export const playing = $state({ appid: 0, name: "" });

type RunningApp = { appid: number; name: string };

let started = false;

/** Call once when the app starts. */
export async function watchPlaying() {
  if (started) return;
  started = true;
  try {
    await listen<RunningApp>("running-app", (e) => {
      playing.appid = e.payload.appid;
      playing.name = e.payload.name;
    });
    const now = await invoke<RunningApp>("running_app");
    playing.appid = now.appid;
    playing.name = now.name;
  } catch {
    /* not running inside Tauri */
  }
}
