<script lang="ts">
  import type { StoreGame } from "$lib/store";
  import { library } from "$lib/library.svelte";

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

<a class="card" href={"/game?id=" + game.appid}>
  <div class="img">
    <img src={game.image} alt="" loading="lazy" decoding="async" />
    {#if owned}<span class="owned">In library</span>{/if}
  </div>
  <div class="body">
    <span class="name" title={game.name}>{game.name}</span>
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
    {#if game.discount && daysLeft > 0 && daysLeft <= 14}
      <span class="ends">Sale ends in {daysLeft} {daysLeft === 1 ? "day" : "days"}</span>
    {/if}
  </div>
</a>

<style>
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
</style>
