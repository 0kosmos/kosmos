import { invoke } from "@tauri-apps/api/core";

// What Discord shows under your name while Kosmos is open ("Rich Presence"), e.g.
//   Kosmos
//   Browsing the library
//   145 games
// The layout calls updateDiscord() whenever the page changes; the Rust side
// (src-tauri/src/discord.rs) passes it to the Discord app on this PC.

/** The game page tells us which game is open, so Discord can show its name */
export const presence = $state({ game: "" });

const PAGES: Record<string, string> = {
  "/": "Browsing the library",
  "/store": "Browsing the store",
  "/downloads": "Checking downloads",
  "/market": "Browsing the Community Market",
  "/friends": "Looking at friends",
  "/groups": "Browsing groups",
  "/settings": "Changing settings",
  "/game": "Looking at a game",
};

export function updateDiscord(on: boolean, path: string, gameCount: number) {
  const details = PAGES[path] ?? "Using Kosmos";
  let state = "";
  if (path === "/game" && presence.game) state = presence.game;
  else if (path === "/" && gameCount) state = `${gameCount} games`;
  invoke("discord_activity", { details, state, on }).catch(() => {});
}
