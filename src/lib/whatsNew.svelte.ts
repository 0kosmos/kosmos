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
  // Every version you missed (e.g. 0.2.0 -> 0.4.0 shows the notes of 0.3.0 and 0.4.0 together)
  const missed = CHANGELOG.filter((r) => newer(r.version, seen ?? "0.0.0") && !newer(r.version, version));
  if (!missed.length) return;
  whatsNew.release = {
    version,
    new: missed.flatMap((r) => r.new),
    improved: missed.flatMap((r) => r.improved),
    fixed: missed.flatMap((r) => r.fixed),
  };
  whatsNew.open = true;
}

/** Is version a newer than version b? ("0.10.0" is newer than "0.9.0") */
function newer(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
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
