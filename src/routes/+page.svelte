<script lang="ts">
  import { onMount } from "svelte";
  import GameTile from "$lib/components/GameTile.svelte";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { account, setSteamId } from "$lib/account.svelte";
  import { library, loadLibrary, disconnect } from "$lib/library.svelte";
  import { view, saveView } from "$lib/libraryView.svelte";

  let input = $state("");
  let inputError = $state("");

  const games = $derived.by(() => {
    const q = view.query.trim().toLowerCase();
    let list = library.games.filter((g) => g.name.toLowerCase().includes(q));

    if (view.filter === "played") list = list.filter((g) => g.hours > 0);
    if (view.filter === "unplayed") list = list.filter((g) => g.hours === 0);

    // For "least played", games you never played go to the end
    const key = (h: number) => (h === 0 ? Number.MAX_SAFE_INTEGER : h);

    switch (view.sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "hours":
        list.sort((a, b) => b.hours - a.hours);
        break;
      case "hours-asc":
        list.sort((a, b) => key(a.hours) - key(b.hours));
        break;
      case "recent":
        list.sort((a, b) => b.lastPlayed - a.lastPlayed);
        break;
    }
    return list;
  });

  // Remember sort and filter for next time the app opens
  $effect(() => saveView(view.sort, view.filter));

  onMount(() => {
    // Only refresh from Steam if our copy is older than 5 minutes
    const fresh = library.status === "ready" && Date.now() - library.updatedAt < 5 * 60 * 1000;
    if (!fresh) loadLibrary();
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
      <input type="search" placeholder="Search games..." bind:value={view.query} />

      <select bind:value={view.sort} aria-label="Sort by">
        <option value="name">Name (A–Z)</option>
        <option value="name-desc">Name (Z–A)</option>
        <option value="hours">Most played</option>
        <option value="hours-asc">Least played</option>
        <option value="recent">Recently played</option>
      </select>

      <select bind:value={view.filter} aria-label="Show">
        <option value="all">All games</option>
        <option value="played">Played</option>
        <option value="unplayed">Never played</option>
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
  h1 { margin: 0 0 18px; font-size: 1.6rem; font-weight: 700; display: flex; align-items: baseline; }
  h2 { margin: 0 0 8px; font-size: 1.15rem; }
  .count { font-size: var(--fs-md); font-weight: 400; color: var(--text-dim); margin-left: 10px; }
  .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
  input[type="search"] { flex: 1; max-width: 320px; min-width: 160px; }
  .dim { color: var(--text-dim); }
  .err { color: var(--bad); margin: 8px 0 0; }
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
    color: var(--on-accent);
    border: none;
    border-radius: var(--radius);
    padding: 8px 16px;
    font-weight: 600;
    transition: filter 0.15s;
  }
  button.primary:hover { filter: brightness(1.1); }
  button.ghost {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    font-size: var(--fs-md);
    color: var(--text-dim);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  button.ghost:hover { background: var(--hover); color: var(--text); border-color: var(--text-dim); }
</style>