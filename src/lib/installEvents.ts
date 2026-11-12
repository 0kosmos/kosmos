import { listen } from "@tauri-apps/api/event";

// The Rust side (src-tauri/src/watch.rs) tells us the moment Steam or Epic changes their
// install files: a download starts, pauses or finishes, or a game needs an update.
// Call this from an effect; it returns the function that stops listening.
export function onInstallsChanged(onSteam: () => void, onEpic: () => void): () => void {
  let stopped = false;
  const offs: (() => void)[] = [];
  const pairs: [string, () => void][] = [
    ["steam-installs-changed", onSteam],
    ["epic-installs-changed", onEpic],
  ];
  for (const [event, cb] of pairs) {
    listen(event, () => cb())
      .then((off) => (stopped ? off() : offs.push(off)))
      .catch(() => {}); // not running inside Tauri
  }
  return () => {
    stopped = true;
    offs.forEach((off) => off());
  };
}
