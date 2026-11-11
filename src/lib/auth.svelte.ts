import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { API_BASE } from "./config";
import { setSteamId } from "./account.svelte";
import { loadLibrary, disconnect } from "./library.svelte";

// Steam sign-in, app side.
// 1. We make a random one-time code, save it, and open the Worker's login page in the browser.
// 2. After Steam login, the Worker verifies it with Steam and opens kosmos://auth?steamid=...&state=<code>.
// 3. We only accept that link if the code matches ours and is less than 10 minutes old,
//    so a website or another program can't sign the app in to someone else's account.

const PENDING_KEY = "kosmos-signin-pending";
const MAX_AGE = 10 * 60 * 1000;

export const auth = $state({ waiting: false, error: "" });

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startSignIn() {
  const state = newCode();
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ state, at: Date.now() }));
  } catch {
    /* ignore */
  }
  auth.error = "";
  auth.waiting = true;
  try {
    await openUrl(`${API_BASE}/auth/login?state=${state}`);
  } catch {
    auth.waiting = false;
    auth.error = "Couldn't open your browser. Please try again.";
  }
}

export function cancelSignIn() {
  auth.waiting = false;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function signOut() {
  cancelSignIn();
  disconnect(); // forgets the SteamID and the saved game list
}

function handleLink(link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return;
  }
  if (url.protocol !== "kosmos:" || url.hostname !== "auth") return;

  const steamid = url.searchParams.get("steamid") ?? "";
  const state = url.searchParams.get("state") ?? "";

  let pending: { state?: string; at?: number } = {};
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
  } catch {
    /* ignore */
  }

  const valid =
    /^\d{17}$/.test(steamid) &&
    !!pending.state &&
    state === pending.state &&
    Date.now() - (pending.at ?? 0) < MAX_AGE;

  cancelSignIn(); // a code can only be used once
  if (!valid) {
    auth.error = "That sign-in link wasn't started from this app or has expired. Please sign in again.";
    return;
  }

  setSteamId(steamid);
  loadLibrary();
}

/** Call once when the app starts. */
export async function listenForSignIn() {
  try {
    // The app may have been started by the link itself
    const startUrls = await getCurrent();
    startUrls?.forEach(handleLink);
    await onOpenUrl((urls) => urls.forEach(handleLink));
  } catch {
    /* not running inside Tauri (e.g. plain browser preview) */
  }
}
