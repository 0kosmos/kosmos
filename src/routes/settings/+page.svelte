<script lang="ts">
  import GameTile from "$lib/components/GameTile.svelte";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { FAKE_GAMES } from "$lib/fakeGames";

  let query = $state("");
  let sort = $state("name");
  let onlyInstalled = $state(false);

  const games = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = FAKE_GAMES.filter(
      (g) => g.name.toLowerCase().includes(q) && (!onlyInstalled || g.installed)
    );
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "hours") list.sort((a, b) => b.hours - a.hours);
    if (sort === "recent") list.sort((a, b) => b.lastPlayed - a.lastPlayed);
    return list;
  });
</script>

<div class="page">
  <h1>Library <span class="count">{games.length} games</span></h1>

  <div class="bar">
    <input type="search" placeholder="Search games..." bind:value={query} />

    <select bind:value={sort} aria-label="Sort by">
      <option value="name">Name</option>
      <option value="hours">Most played</option>
      <option value="recent">Recently played</option>
    </select>

    <label class="check">
      <input type="checkbox" bind:checked={onlyInstalled} />
      Installed only
    </label>
  </div>

  {#if games.length === 0}
    <p class="dim">No games match your search.</p>
  {:else}
    <div class="grid-wrap">
      <VirtualGrid items={games} itemWidth={160} itemHeight={290} key={(g) => g.appid}>
        {#snippet children(game)}
          <GameTile {game} />
        {/snippet}
      </VirtualGrid>
    </div>
  {/if}
</div>

<style>
  .page {
    height: calc(100vh - 56px);
    display: flex;
    flex-direction: column;
  }
  h1 { margin: 0 0 16px; font-size: 1.6rem; }
  .count { font-size: 0.9rem; font-weight: 400; color: var(--text-dim); margin-left: 8px; }
  .bar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
  input[type="search"], select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    padding: 8px 12px;
    font: inherit;
  }
  input[type="search"] { flex: 1; max-width: 320px; }
  .check { display: flex; gap: 6px; align-items: center; color: var(--text-dim); font-size: 0.9rem; }
  .dim { color: var(--text-dim); }
  .grid-wrap { flex: 1; min-height: 0; }
</style>