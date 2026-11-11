import { invoke } from "@tauri-apps/api/core";

// Live CPU / GPU / RAM of the running game, shown in the sidebar's "Currently playing" card.
// Checked every 2 s, but ONLY while: the option is on, a game is running, and the Kosmos
// window is visible (minimized or hidden = paused). The Rust side does the reading.
export type GameStats = {
  found: boolean;
  cpu: number | null;
  ramMb: number;
  gpu: number | null;
  vramMb: number | null;
};

export const gameStats = $state<{ appid: number; s: GameStats | null }>({ appid: 0, s: null });

let timer: ReturnType<typeof setInterval> | undefined;
let current = 0;

async function check() {
  if (!current || document.visibilityState !== "visible") return;
  const id = current;
  try {
    const s = await invoke<GameStats>("game_stats", { appid: id });
    if (id === current) gameStats.s = s;
  } catch {
    /* not running inside Tauri */
  }
}

/** Start (appid > 0) or stop (appid = 0) watching a game. */
export function watchGameStats(appid: number) {
  if (appid === current) return;
  clearInterval(timer);
  timer = undefined;
  current = appid;
  gameStats.appid = appid;
  gameStats.s = null;
  if (!appid) {
    invoke("stop_game_stats").catch(() => {}); // frees Windows' counters
    document.removeEventListener("visibilitychange", check);
    return;
  }
  check();
  timer = setInterval(check, 2000);
  // Coming back to the window: update right away instead of waiting
  document.addEventListener("visibilitychange", check);
}
