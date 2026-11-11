<!-- A free game on the Epic Games Store. Same look as the Steam store cards.
     Clicking opens the game's page in the Epic launcher, where you claim it. -->
<script lang="ts">
  import type { EpicFreeGame } from "$lib/store";
  import { epic, openEpicStorePage, searchEpicStore } from "$lib/epic.svelte";

  let { game }: { game: EpicFreeGame } = $props();

  // Already in your Epic library? (matched by name: the free list and your library use different IDs)
  const owned = $derived(epic.games.some((g) => g.name.toLowerCase() === game.title.toLowerCase()));

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const when = $derived(
    game.now ? (game.end ? "Free until " + day(game.end) : "Free now") : "Free from " + day(game.start)
  );
  const image = $derived(game.image ? game.image + "?w=520&resize=1&quality=medium" : "");

  // The game's page in the Epic launcher; if that can't be opened, Epic's website instead
  function open() {
    (game.slug ? openEpicStorePage(game.slug) : Promise.reject()).catch(() => searchEpicStore(game.title).catch(() => {}));
  }
</script>

<button class="card" onclick={open} title="Open on the Epic Games Store">
  <div class="img">
    {#if image}<img src={image} alt="" loading="lazy" decoding="async" />{/if}
    <span class="badge">{owned ? "In library" : "Epic"}</span>
  </div>
  <div class="body">
    <span class="name" title={game.title}>{game.title}</span>
    <div class="row">
      <span class="when" class:live={game.now}>{when}</span>
      <span class="price">
        {#if game.originalPrice}<span class="old">{game.originalPrice}</span>{/if}
        <span class="now">{game.now ? "Free" : "Soon"}</span>
      </span>
    </div>
  </div>
</button>

<style>
  .card {
    display: flex; flex-direction: column; overflow: hidden; width: 100%; padding: 0; text-align: left;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: inherit; font: inherit;
    transition: border-color 0.15s, transform 0.15s, background 0.15s;
  }
  .card:hover { border-color: var(--accent); background: var(--surface-2); transform: translateY(var(--lift)); }
  .img { position: relative; aspect-ratio: 460 / 215; background: var(--surface-2); overflow: hidden; }
  .img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .badge {
    position: absolute; top: 6px; left: 6px; padding: 2px 8px; border-radius: 999px;
    font-size: 0.72rem; font-weight: 600; background: var(--scrim); color: #fff; /* on the picture, same in both themes */
  }
  .body { padding: 9px 11px 11px; display: flex; flex-direction: column; gap: 6px; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .when { font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .when.live { color: var(--good); }
  .price { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .old { font-size: 0.72rem; color: var(--text-dim); text-decoration: line-through; }
  .now { font-weight: 700; font-size: var(--fs-md); }
</style>
