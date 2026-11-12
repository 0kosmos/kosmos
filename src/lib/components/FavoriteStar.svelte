<!-- The star in the top-right corner of a Library tile.
     Not a favorite: a faint star that only shows while you hover the tile.
     Favorite: a gold star that always shows. -->
<script lang="ts">
  import { isFavorite, toggleFavorite } from "$lib/favorites.svelte";

  let { gameKey, name }: { gameKey: string; name: string } = $props();
  const on = $derived(isFavorite(gameKey));
</script>

<button
  class="star"
  class:on
  onclick={() => toggleFavorite(gameKey)}
  aria-pressed={on}
  aria-label={(on ? "Remove from favorites: " : "Add to favorites: ") + name}
  title={on ? "Remove from favorites" : "Add to favorites"}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
    />
  </svg>
</button>

<style>
  .star {
    position: absolute; top: 14px; right: 14px; z-index: 1;
    width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--scrim);
    color: #fff; /* sits on the cover picture, same in both themes */
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, transform 0.15s;
  }
  /* Shown while you hover the tile (or reach the star with the keyboard) */
  :global(.tile:hover) .star, .star:focus-visible { opacity: 0.85; }
  .star:hover { opacity: 1; transform: scale(1.08); }
  /* A favorite: gold, always visible */
  .star.on { opacity: 1; color: var(--fav); }
</style>
