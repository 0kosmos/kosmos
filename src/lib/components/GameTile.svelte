<script lang="ts">
  import type { Game } from "$lib/library.svelte";

  let { game }: { game: Game } = $props();

  let failed = $state(false);
  const hue = $derived((game.appid * 47) % 360);
  const cover = $derived(
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
  );
</script>

<a class="tile" href={"/game?id=" + game.appid}>
  <div class="cover" style="--hue: {hue}">
    {#if failed}
      <span>{game.name.charAt(0)}</span>
    {:else}
      <img src={cover} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
    {/if}
  </div>
  <h3 title={game.name}>{game.name}</h3>
  <p>{game.hours} h played</p>
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
    transition: border-color 0.15s, background 0.15s;
  }
  .tile:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  .cover {
    aspect-ratio: 2 / 3;
    border-radius: 8px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  .cover span {
    font-size: 2.6rem;
    font-weight: 700;
    opacity: 0.85;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  h3 {
    margin: 8px 2px 2px;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p {
    margin: 0 2px 2px;
    font-size: 0.8rem;
    color: var(--text-dim);
  }
</style>