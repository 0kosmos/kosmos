const KEY = "kosmos-account-v1";

function load(): { steamid: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { steamid: String(JSON.parse(raw).steamid ?? "") };
  } catch {
    /* ignore */
  }
  return { steamid: "" };
}

export const account = $state(load());

export function setSteamId(id: string) {
  account.steamid = id.trim();
  try {
    if (account.steamid) {
      localStorage.setItem(KEY, JSON.stringify({ steamid: account.steamid }));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}