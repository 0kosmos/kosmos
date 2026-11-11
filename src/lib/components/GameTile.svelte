<script lang="ts">
  import type { Game } from "$lib/library.svelte";

  let { game }: { game: Game } = $props();

  const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

  // Images to try, in order. If one fails to load we move to the next.
  // When all fail, we show the colored letter tile.
  const sources = $derived([
    { url: `${CDN}/${game.appid}/library_600x900.jpg`, wide: false }, // tall cover art
    { url: `${CDN}/${game.appid}/header.jpg`, wide: true },           // wide store header
    { url: `${CDN}/${game.appid}/capsule_616x353.jpg`, wide: true },  // wide capsule
  ]);

  let attempt = $state(0);
  const current = $derived(sources[attempt]);
  const hue = $derived((game.appid * 47) % 360);
</script>

<a class="tile" href={"/game?id=" + game.appid}>
  <div class="cover" style="--hue: {hue}">
    {#if current}
      <img
        src={current.url}
        class:wide={current.wide}
        alt=""
        loading="lazy"
        decoding="async"
        onerror={() => attempt++}
      />
    {:else}
      <span>{game.name.charAt(0)}</span>
    {/if}
  </div>
  <h3 title={game.name}>{game.name}</h3>
  <p>{game.hours > 0 ? `${game.hours} h played` : "Never played"}</p>
</a>

<style>
  .tile {
    display: block;
    width: 160px;
    height: 290px;
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
    transform: translateY(-2px);
  }
  .cover {
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  .cover span {
    font-size: 2.6rem;
    font-weight: 700;
    color: #fff; /* sits on the generated colored tile, same in both themes */
    opacity: 0.85;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* Wide images: show the whole image centered on the colored tile instead of cropping it */
  img.wide {
    height: auto;
    object-fit: contain;
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
