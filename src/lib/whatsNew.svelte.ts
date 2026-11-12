import { getVersion } from "@tauri-apps/api/app";
import { isFirstStart } from "./settings.svelte";
import { CHANGELOG, type Release } from "./changelog";

// The "What's new" pop-up: shown once after Kosmos updates to a version that has notes in
// changelog.ts. Never on a brand-new install (the welcome setup shows then). Settings → General
// can show it again.

const SEEN_KEY = "kosmos-last-version";

export const whatsNew = $state({ open: false, release: null as Release | null });

/** Call once at startup */
export async function checkWhatsNew() {
  let version = "";
  try {
    version = await getVersion();
  } catch {
    return; // not running inside Tauri
  }
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    return;
  }
  // First start on this PC, or already seen this version: nothing to show
  if (isFirstStart || seen === version) return;
  const release = CHANGELOG.find((r) => r.version === version);
  if (release) {
    whatsNew.release = release;
    whatsNew.open = true;
  }
}

/** Settings → "What's new": the notes of this version (or the newest notes there are) */
export async function showWhatsNew() {
  let version = "";
  try {
    version = await getVersion();
  } catch {
    /* use the newest notes */
  }
  whatsNew.release = CHANGELOG.find((r) => r.version === version) ?? CHANGELOG[0] ?? null;
  whatsNew.open = !!whatsNew.release;
}

export function closeWhatsNew() {
  whatsNew.open = false;
}
