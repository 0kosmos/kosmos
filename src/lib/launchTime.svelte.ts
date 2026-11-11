import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { playing } from "./playing.svelte";

// ---------- Launch time ----------
// "Launch time" = from pressing Play in Kosmos until the game's own window is in front.
// Before a game has been timed, we show a rough estimate. After real launches through
// Kosmos, we show the average of the last few real ones instead.

type Inputs = { installed: boolean; sizeBytes: number; drive: "nvme" | "ssd" | "hdd" | "unknown" };
type System = { cpuThreads: number; ramGb: number };

export type LaunchInfo =
  | { kind: "measured"; seconds: number; count: number }
  | { kind: "estimate"; low: number; high: number; details: string }
  | { kind: "unknown" };

// ---------- Real measurements (saved on disk, last 5 per game) ----------
const KEY = "kosmos-launch-times-v1";
let times: Record<string, number[]> = {};
try {
  times = JSON.parse(localStorage.getItem(KEY) || "{}");
} catch {
  /* ignore a broken file */
}

function saveTime(appid: number, seconds: number) {
  const list = [...(times[appid] ?? []), Math.round(seconds * 10) / 10].slice(-5);
  times[appid] = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(times));
  } catch {
    /* ignore */
  }
}

let listening = false;
/** Call once when the app starts: receives finished measurements from the Rust side. */
export async function listenForLaunchTimes() {
  if (listening) return;
  listening = true;
  try {
    await listen<{ appid: number; seconds: number }>("launch-measured", (e) => {
      saveTime(e.payload.appid, e.payload.seconds);
    });
  } catch {
    /* not running inside Tauri */
  }
}

/** Play through Steam, and time the launch (unless the game is already running). */
export async function playAndTime(appid: number) {
  const alreadyRunning = playing.appid === appid;
  await openUrl(`steam://run/${appid}`);
  if (!alreadyRunning) invoke("measure_launch", { appid }).catch(() => {});
}

// ---------- Estimate ----------
let system: System | null = null;
const inputsCache = new Map<number, Inputs>();

// Rough "effective" read speeds when a game starts (MB/s): lots of small files, not one big copy
const SPEED = { nvme: 1200, ssd: 400, hdd: 90, unknown: 250 };
const DRIVE_NAME = { nvme: "NVMe SSD", ssd: "SSD", hdd: "Hard drive (HDD)", unknown: "Unknown drive" };

function estimate(inp: Inputs, sys: System): LaunchInfo {
  const sizeGb = inp.sizeBytes / 1024 ** 3;
  // A game reads only part of itself at startup: guess ~5%, between 0.3 and 8 GB
  const readGb = Math.min(Math.max(sizeGb * 0.05, 0.3), 8);
  let secs = 4 /* Steam's checks + starting the program */ + (readGb * 1024) / SPEED[inp.drive];
  if (sys.cpuThreads && sys.cpuThreads <= 4) secs *= 1.35;
  else if (sys.cpuThreads && sys.cpuThreads <= 8) secs *= 1.12;
  if (sys.ramGb && sys.ramGb < 8) secs *= 1.35;
  else if (sys.ramGb && sys.ramGb < 16) secs *= 1.1;

  const parts = [DRIVE_NAME[inp.drive], `${Math.round(sizeGb)} GB game`];
  if (sys.cpuThreads) parts.push(`${sys.cpuThreads} CPU threads`);
  if (sys.ramGb) parts.push(`${sys.ramGb} GB RAM`);
  return {
    kind: "estimate",
    low: Math.max(2, Math.round(secs * 0.7)),
    high: Math.max(4, Math.round(secs * 1.5)),
    details: parts.join(" · "),
  };
}

/** What to show for a game. Reads disk info only the first time (then remembered). */
export async function launchInfo(appid: number): Promise<LaunchInfo> {
  const real = times[appid];
  if (real?.length) {
    const avg = real.reduce((a, b) => a + b, 0) / real.length;
    return { kind: "measured", seconds: Math.round(avg), count: real.length };
  }
  try {
    system ??= await invoke<System>("system_info");
    let inp = inputsCache.get(appid);
    if (!inp) {
      inp = await invoke<Inputs>("launch_inputs", { appid });
      inputsCache.set(appid, inp);
    }
    return inp.installed ? estimate(inp, system) : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

// ---------- One shared tooltip for all Play buttons ----------
export const launchTip = $state<{ appid: number; rect: DOMRect | null }>({ appid: 0, rect: null });
let tipTimer: ReturnType<typeof setTimeout> | undefined;

/** Use on a Play button: onpointerenter={(e) => showLaunchTip(appid, e.currentTarget)} */
export function showLaunchTip(appid: number, el: HTMLElement) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    launchTip.appid = appid;
    launchTip.rect = el.getBoundingClientRect();
  }, 350);
}

export function hideLaunchTip() {
  clearTimeout(tipTimer);
  launchTip.rect = null;
}
