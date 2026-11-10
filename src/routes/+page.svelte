<script lang="ts">
  import GameTile from "$lib/components/GameTile.svelte";
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

<h1>Library</h1>

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
  <div class="grid">
    {#each games as game (game.appid)}
      <GameTile {game} />
    {/each}
  </div>
{/if}

<style>
  h1 { margin: 0 0 16px; font-size: 1.6rem; }
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 14px;
  }
</style>