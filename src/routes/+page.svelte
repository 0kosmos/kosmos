<script lang="ts">
  import { onMount } from "svelte";
  import GameTile from "$lib/components/GameTile.svelte";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { account, setSteamId } from "$lib/account.svelte";
  import { library, loadLibrary, disconnect } from "$lib/library.svelte";

  let query = $state("");
  let sort = $state("name");
  let input = $state("");
  let inputError = $state("");

  const games = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = library.games.filter((g) => g.name.toLowerCase().includes(q));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "hours") list.sort((a, b) => b.hours - a.hours);
    if (sort === "recent") list.sort((a, b) => b.lastPlayed - a.lastPlayed);
    return list;
  });

  onMount(() => {
    loadLibrary();
  });

  function connect() {
    if (!/^7656\d{13}$/.test(input.trim())) {
      inputError = "That doesn't look right. It should be 17 digits starting with 7656.";
      return;
    }
    inputError = "";
    setSteamId(input);
    loadLibrary();
  }
</script>

<div class="page">
  {#if !account.steamid}
    <div class="card">
      <h1>Connect your Steam account</h1>
      <p class="dim">
        Temporary step: paste your SteamID64. "Sign in through Steam" comes soon.
      </p>
      <div class="row">
        <input type="text" placeholder="7656119..." bind:value={input} onkeydown={(e) => e.key === "Enter" && connect()} />
        <button class="primary" onclick={connect}>Connect</button>
      </div>
      {#if inputError}<p class="err">{inputError}</p>{/if}
    </div>
  {:else}
    <h1>Library <span class="count">{games.length} games</span></h1>

    <div class="bar">
      <input type="search" placeholder="Search games..." bind:value={query} />
      <select bind:value={sort} aria-label="Sort by">
        <option value="name">Name</option>
        <option value="hours">Most played</option>
        <option value="recent">Recently played</option>
      </select>
      <button class="ghost" onclick={disconnect}>Disconnect</button>
    </div>

    {#if library.status === "loading"}
      <p class="dim">Loading your games...</p>
    {:else if library.status === "private"}
      <div class="card">
        <h2>Your game list is private</h2>
        <p class="dim">
          Steam only shares your games if "Game details" is public. In Steam, open your profile →
          Edit Profile → Privacy Settings, set Game details to Public, then come back here.
        </p>
        <button class="primary" onclick={loadLibrary}>Try again</button>
      </div>
    {:else if library.status === "error"}
      <div class="card">
        <h2>Couldn't load your games</h2>
        <p class="dim">Check your internet connection and try again.</p>
        <button class="primary" onclick={loadLibrary}>Try again</button>
      </div>
    {:else if games.length === 0}
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
  {/if}
</div>

<style>
  .page {
    height: calc(100vh - 56px);
    display: flex;
    flex-direction: column;
  }
  h1 { margin: 0 0 16px; font-size: 1.6rem; }
  h2 { margin: 0 0 8px; font-size: 1.2rem; }
  .count { font-size: 0.9rem; font-weight: 400; color: var(--text-dim); margin-left: 8px; }
  .bar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
  input, select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    padding: 8px 12px;
    font: inherit;
  }
  input[type="search"] { flex: 1; max-width: 320px; }
  .dim { color: var(--text-dim); }
  .err { color: #ff8a8a; margin: 8px 0 0; }
  .grid-wrap { flex: 1; min-height: 0; }
  .card {
    max-width: 520px;
    padding: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .card p { margin: 0 0 16px; }
  .row { display: flex; gap: 10px; }
  .row input { flex: 1; }
  button.primary {
    background: var(--accent);
    color: #0e0f13;
    border: none;
    border-radius: var(--radius);
    padding: 8px 16px;
    font-weight: 600;
  }
  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    color: var(--text-dim);
  }
</style>