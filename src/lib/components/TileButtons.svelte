<!-- Small round buttons in the top-right corner of a Library tile:
     ★ favorite, the eye to hide / unhide the game, and ✎ edit (only for games you added).
     They show while you hover the tile; a favorite's gold star always shows. -->
<script lang="ts">
  import { isFavorite, toggleFavorite } from "$lib/favorites.svelte";
  import { isHiddenGame, toggleHiddenGame } from "$lib/hidden.svelte";

  let { gameKey, name, onedit }: { gameKey: string; name: string; onedit?: () => void } = $props();
  const fav = $derived(isFavorite(gameKey));
  const hiddenNow = $derived(isHiddenGame(gameKey));

  const EYE_OFF =
    "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5 M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3";
  const EYE = "M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
  const PEN = "M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4";
</script>

<div class="buttons">
  <button
    class="b star"
    class:on={fav}
    onclick={() => toggleFavorite(gameKey)}
    aria-pressed={fav}
    aria-label={(fav ? "Remove from favorites: " : "Add to favorites: ") + name}
    title={fav ? "Remove from favorites" : "Add to favorites"}
  >
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </svg>
  </button>
  <button
    class="b"
    class:on={hiddenNow}
    onclick={() => toggleHiddenGame(gameKey)}
    aria-label={(hiddenNow ? "Unhide: " : "Hide: ") + name}
    title={hiddenNow ? "Unhide this game" : "Hide this game (find it again with \"Show hidden games\" in the filters)"}
  >
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={hiddenNow ? EYE : EYE_OFF} />
    </svg>
  </button>
  {#if onedit}
    <button class="b" onclick={onedit} aria-label={"Edit: " + name} title="Change name or picture, or remove">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d={PEN} />
      </svg>
    </button>
  {/if}
</div>

<style>
  .buttons {
    position: absolute; top: 14px; right: 14px; z-index: 1;
    display: flex; flex-direction: column; gap: 6px;
  }
  .b {
    width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--scrim);
    color: #fff; /* sits on the cover picture, same in both themes */
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, transform 0.15s;
  }
  /* Shown while you hover the tile (or reach them with the keyboard) */
  :global(.tile:hover) .b, .b:focus-visible { opacity: 0.85; }
  .b:hover { opacity: 1; transform: scale(1.08); }
  /* A favorite: gold star, always visible */
  .star.on { opacity: 1; color: var(--fav); }
</style>
