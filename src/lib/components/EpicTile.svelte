<!-- A game from your Epic Games library. Same size and look as the Steam tiles.
     The Epic launcher does the actual work when you press Play or Install.
     Clicking the cover or name looks the game up on the Epic Games Store. -->
<script lang="ts">
  import { type EpicGame, type EpicResult, playEpic, installEpic, openEpicLibrary, searchEpicStore, smallCover } from "$lib/epic.svelte";

  import FavoriteStar from "./FavoriteStar.svelte";
  import { epicKey } from "$lib/favorites.svelte";

  let { game }: { game: EpicGame } = $props();

  // Cover: the shrunk picture first, the full one if that fails, then the game's name
  const sources = $derived(game.cover ? [smallCover(game.cover), game.cover] : []);
  let attempt = $state(0);
  const current = $derived(sources[attempt]);

  // A color for the name tile, always the same for a game
  const hue = $derived([...game.appName].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
  const size = $derived(
    game.sizeBytes >= 1e9 ? (game.sizeBytes / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(game.sizeBytes / 1e6)) + " MB"
  );

  // A short message on the tile: Epic is starting up, or the request couldn't be sent
  let note = $state<"" | "starting" | "failed">("");
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function show(n: "starting" | "failed", ms: number) {
    note = n;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ""), ms);
  }
  function run(p: Promise<EpicResult>) {
    p.then((r) => r === "starting" && show("starting", 20000)).catch(() => show("failed", 4000));
  }

  function quickAction() {
    if (game.installed) run(playEpic(game));
    else if (game.installing) run(openEpicLibrary()); // see it in Epic's own downloads
    else run(installEpic(game));
  }
  const label = $derived(game.installed ? "▶ Play" : game.installing ? "Installing..." : "⬇ Install");
</script>

<div class="tile">
  <FavoriteStar gameKey={epicKey(game.appName)} name={game.name} />
  <button class="open" onclick={() => run(searchEpicStore(game.name))} title="Find it on the Epic Games Store">
    <div class="cover" style="--hue: {hue}">
      {#if current}
        <img src={current} alt="" loading="lazy" decoding="async" onerror={() => attempt++} />
      {:else}
        <span class="name">{game.name}</span>
      {/if}
      <span class="badge">Epic</span>
    </div>
    <h3 title={game.name}>{game.name}</h3>
    <p class:err={note === "failed"}>
      {#if note === "failed"}
        Couldn't open Epic Games
      {:else if note === "starting"}
        Starting Epic Games...
      {:else}
        {game.installed ? "Installed" + (game.sizeBytes ? " · " + size : "") : game.installing ? "Installing in Epic" : "Not installed"}
      {/if}
    </p>
  </button>

  <button
    class="quick"
    class:install={!game.installed && !game.installing}
    class:pending={game.installing}
    onclick={quickAction}
    title={game.installing ? "Open your Epic library" : undefined}
    aria-label={label + ": " + game.name}
  >
    {label}
  </button>
</div>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 160px;
    height: 318px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .tile:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateY(var(--lift)); /* 0 when reduce motion is on */
  }
  .open {
    display: block; width: 100%; padding: 0; text-align: left;
    background: none; border: none; color: inherit; font: inherit;
  }
  .cover {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .name {
    padding: 12px;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.25;
    text-align: center;
    color: #fff; /* sits on the generated colored cover, same in both themes */
  }
  /* Which launcher the game is from */
  .badge {
    position: absolute; top: 6px; left: 6px;
    padding: 1px 7px; border-radius: 999px;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em;
    background: var(--scrim); color: #fff; /* on top of the cover, same in both themes */
  }
  h3 {
    margin: 8px 2px 2px;
    font-size: var(--fs-md);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p { margin: 0 2px 2px; font-size: var(--fs-sm); color: var(--text-dim); }
  p.err { color: var(--bad); }
  .quick {
    margin-top: auto;
    height: 28px;
    width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    font-weight: 700;
    background: var(--accent);
    color: var(--on-accent);
    border: 1px solid var(--accent);
    transition: filter 0.15s;
  }
  .quick:hover { filter: brightness(1.1); }
  .quick.install { background: var(--surface-2); color: var(--text); border-color: var(--border); }
  .quick.install:hover { filter: none; border-color: var(--text-dim); }
  .quick.pending {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--text); border-color: transparent; font-weight: 600;
  }
  .quick.pending:hover { filter: none; border-color: var(--accent); }
</style>
