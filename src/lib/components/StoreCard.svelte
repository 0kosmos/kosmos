<script lang="ts">
  import type { StoreGame } from "$lib/store";
  import { library } from "$lib/library.svelte";
  import { isHiddenInStore, toggleHiddenInStore } from "$lib/hidden.svelte";

  // One game in the store: wide image, name, reviews, price (with discount).
  let { game }: { game: StoreGame } = $props();

  const owned = $derived(library.games.some((g) => g.appid === game.appid));
  const tone = $derived(
    game.reviewPct == null ? "" : game.reviewPct >= 70 ? "good" : game.reviewPct >= 40 ? "mixed" : "bad"
  );
  const daysLeft = $derived(
    game.discountEnds ? Math.ceil((game.discountEnds - Date.now()) / 86_400_000) : 0
  );
</script>

<!-- The eye button hides this game everywhere in the Store ("Show hidden games" brings it back) -->
<div class="wrap" class:faded={isHiddenInStore(game.appid)}>
<button
  class="hide"
  onclick={() => toggleHiddenInStore(game.appid)}
  aria-label={(isHiddenInStore(game.appid) ? "Unhide: " : "Hide: ") + game.name}
  title={isHiddenInStore(game.appid) ? "Unhide this game" : "Hide this game in the Store"}
>
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if isHiddenInStore(game.appid)}
      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    {:else}
      <path d="M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5 M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3" />
    {/if}
  </svg>
</button>
<a class="card" href={"/game?id=" + game.appid}>
  <div class="img">
    <img src={game.image} alt="" loading="lazy" decoding="async" />
    {#if owned}<span class="owned">In library</span>{/if}
  </div>
  <div class="body">
    <span class="name" title={game.name}>{game.name}</span>
    {#if game.comingSoon}
      <!-- Not out yet: when it comes out instead of reviews and price -->
      <div class="row">
        <span class="rev">Coming soon</span>
        <span class="release">{game.releaseText || "Coming soon"}</span>
      </div>
    {:else}
    <div class="row">
      {#if game.reviewPct != null}
        <span class="rev {tone}" title={game.reviewLabel}>{game.reviewPct}% · {game.reviewLabel}</span>
      {:else}
        <span class="rev"></span>
      {/if}
      <span class="price">
        {#if game.discount}
          <span class="pct">-{game.discount}%</span>
          <span class="old">{game.originalText}</span>
        {/if}
        <span class="now">{game.priceText || "—"}</span>
      </span>
    </div>
    {/if}
    {#if game.discount && daysLeft > 0 && daysLeft <= 14}
      <span class="ends">Sale ends in {daysLeft} {daysLeft === 1 ? "day" : "days"}</span>
    {/if}
  </div>
</a>
</div>

<style>
  .wrap { position: relative; display: flex; flex-direction: column; }
  .wrap > .card { flex: 1; }
  .wrap.faded { opacity: 0.45; }
  .wrap.faded:hover { opacity: 1; }
  .hide {
    position: absolute; top: 8px; right: 8px; z-index: 1;
    width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--scrim); color: #fff; /* on the picture, same in both themes */
    opacity: 0; transition: opacity 0.15s, transform 0.15s;
  }
  .wrap:hover .hide, .hide:focus-visible { opacity: 0.85; }
  .hide:hover { opacity: 1; transform: scale(1.08); }
  .card {
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: inherit; text-decoration: none;
    transition: border-color 0.15s, transform 0.15s, background 0.15s;
  }
  .card:hover { border-color: var(--accent); background: var(--surface-2); transform: translateY(var(--lift)); }
  .img { position: relative; aspect-ratio: 460 / 215; background: var(--surface-2); overflow: hidden; }
  .img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .owned {
    position: absolute; top: 6px; left: 6px; padding: 2px 8px; border-radius: 999px;
    font-size: 0.72rem; font-weight: 600; background: var(--scrim); color: #fff;
  }
  .body { padding: 9px 11px 11px; display: flex; flex-direction: column; gap: 6px; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rev { font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .rev.good { color: var(--good); }
  .rev.bad { color: var(--bad); }
  .price { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .pct {
    font-size: 0.75rem; font-weight: 700; padding: 1px 6px; border-radius: 4px;
    background: color-mix(in srgb, var(--good) 22%, transparent); color: var(--good);
  }
  .old { font-size: 0.72rem; color: var(--text-dim); text-decoration: line-through; }
  .now { font-weight: 700; font-size: var(--fs-md); }
  .ends { font-size: 0.72rem; color: var(--text-dim); }
  .release { font-weight: 700; font-size: var(--fs-sm); flex-shrink: 0; }
</style>
