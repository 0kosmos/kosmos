import { isFirstStart, saveSettings } from "./settings.svelte";

// The welcome setup (src/lib/components/Welcome.svelte): shown once, the very first time
// Kosmos starts on a PC (no saved settings yet). Settings → General can show it again.

const DONE_KEY = "kosmos-welcome-done";

function seenBefore(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // can't remember it either way: don't keep showing it
  }
}

export const welcome = $state({ open: isFirstStart && !seenBefore() });

export function openWelcome() {
  welcome.open = true;
}

/** "Start using Kosmos" or ✕: keep what's chosen, never show it by itself again */
export function closeWelcome() {
  welcome.open = false;
  saveSettings(); // so this PC now counts as set up, even if nothing was changed
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}
