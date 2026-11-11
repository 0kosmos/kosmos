import { invoke } from "@tauri-apps/api/core";

// "My PC" panel data. Read from Windows once, then saved, so the panel shows instantly.
// Refreshed quietly the first time the panel is opened in each app run (in case you upgraded).
export type PcInfo = {
  cpu: string;
  cpuThreads: number;
  gpus: { name: string; vramGb: number }[];
  ramGb: number;
  os: string;
};

const KEY = "kosmos-pc-info-v1";
const OPEN_KEY = "kosmos-pc-panel-open";

function loadSaved(): PcInfo | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export const pc = $state({
  info: loadSaved(),
  open: (() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  })(),
});

let refreshed = false;

export async function loadPcInfo() {
  if (refreshed) return;
  refreshed = true;
  try {
    const info = await invoke<PcInfo>("pc_info");
    pc.info = info;
    localStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    /* not running inside Tauri: keep what we have */
  }
}

export function togglePcPanel() {
  pc.open = !pc.open;
  try {
    localStorage.setItem(OPEN_KEY, pc.open ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (pc.open) loadPcInfo();
}
