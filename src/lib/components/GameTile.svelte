<script lang="ts">
  import type { Game } from "$lib/library.svelte";
  import { untrack } from "svelte";
  import { cachedCover, findCover } from "$lib/covers";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { installed } from "$lib/installed.svelte";
  import { playing } from "$lib/playing.svelte";

  let { game }: { game: Game } = $props();

  // Quick Play / Install button under the tile (Steam does the actual work)
  const isInstalled = $derived(!installed.known || installed.ids.has(game.appid));
  const isRunning = $derived(playing.appid === game.appid);

  function quickAction() {
    const link = isInstalled ? `steam://run/${game.appid}` : `steam://install/${game.appid}`;
    openUrl(link).catch(() => {});
  }

  const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

  // A cover we looked up earlier through the Worker (saved for 7 days).
  // Read once: each tile always shows the same game (the grid is keyed by appid).
  let found = $state<string | null>(untrack(() => cachedCover(game.appid) ?? null));

  // Images to try, in order. If one fails to load we move to the next.
  // Wide images are zoomed to fill the tall tile (their left/right edges get cut off).
  const sources = $derived(
    found
      ? [found]
      : [
          `${CDN}/${game.appid}/library_600x900.jpg`, // tall cover art
          `${CDN}/${game.appid}/header.jpg`,          // wide store header
          `${CDN}/${game.appid}/capsule_616x353.jpg`, // wide capsule
        ]
  );

  let attempt = $state(0);
  const current = $derived(sources[attempt]);

  // All normal links failed: ask the Worker once for the game's real image address.
  // If it has none either, the tile shows the game's name.
  let asked = false;
  $effect(() => {
    if (current || found || asked) return;
    if (cachedCover(game.appid) === null) return; // we already know there's no image
    asked = true;
    findCover(game.appid).then((url) => {
      if (url) {
        found = url;
        attempt = 0;
      }
    });
  });
  const hue = $derived((game.appid * 47) % 360);
</script>

<div class="tile">
  <a class="open" href={"/game?id=" + game.appid}>
    <div class="cover" style="--hue: {hue}">
      {#if current}
        <img
          src={current}
          alt=""
          loading="lazy"
          decoding="async"
          onerror={() => attempt++}
        />
      {:else}
        <span>{game.name}</span>
      {/if}
    </div>
    <h3 title={game.name}>{game.name}</h3>
    <p>{game.hours > 0 ? `${game.hours} h played` : "Never played"}</p>
  </a>

  {#if isRunning}
    <div class="quick running"><span class="dot" aria-hidden="true"></span>Running</div>
  {:else}
    <button
      class="quick"
      class:install={!isInstalled}
      onclick={quickAction}
      aria-label={(isInstalled ? "Play " : "Install ") + game.name}
    >
      {isInstalled ? "▶ Play" : "⬇ Install"}
    </button>
  {/if}
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    width: 160px;
    height: 318px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .tile:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateY(var(--lift)); /* 0 when reduce motion is on */
  }
  .open { display: block; color: inherit; text-decoration: none; }

  /* Small Play / Install button at the bottom of the tile */
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
  button.quick:hover { filter: brightness(1.1); }
  .quick.install { background: var(--surface-2); color: var(--text); border-color: var(--border); }
  button.quick.install:hover { filter: none; border-color: var(--text-dim); }
  .quick.running {
    background: color-mix(in srgb, var(--good) 18%, transparent);
    border-color: transparent; color: var(--text);
  }
  .quick .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); }

  .cover {
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  /* Game name on the colored tile when there is no image at all */
  .cover span {
    padding: 12px;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.25;
    text-align: center;
    color: #fff; /* sits on the generated colored tile, same in both themes */
    opacity: 0.9;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  h3 {
    margin: 8px 2px 2px;
    font-size: var(--fs-md);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p {
    margin: 0 2px 2px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
</style>
