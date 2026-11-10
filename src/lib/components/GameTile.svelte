<script lang="ts">
  import type { Game } from "$lib/fakeGames";

  let { game }: { game: Game } = $props();

  const hue = $derived((game.appid * 47) % 360);
</script>

<article class="tile">
  <div class="cover" style="--hue: {hue}">
    <span>{game.name.charAt(0)}</span>
    {#if game.installed}<em>Installed</em>{/if}
  </div>
  <h3>{game.name}</h3>
  <p>{game.hours} h played</p>
</article>

<style>
  .tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
  }
  .cover {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  .cover span {
    font-size: 2.6rem;
    font-weight: 700;
    opacity: 0.85;
  }
  em {
    position: absolute;
    top: 6px;
    left: 6px;
    font-style: normal;
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
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