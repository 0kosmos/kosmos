<script lang="ts">
  import { onMount } from "svelte";
  import GameTile from "$lib/components/GameTile.svelte";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { account } from "$lib/account.svelte";
  import { library, loadLibrary } from "$lib/library.svelte";
  import { view, saveView, clearFilters } from "$lib/libraryView.svelte";
  import FilterPanel from "$lib/components/FilterPanel.svelte";
  import LibraryNews from "$lib/components/LibraryNews.svelte";

  // News row: your 10 most recently played games (never the whole library)
  const newsIds = $derived(
    [...library.games]
      .sort((a, b) => b.lastPlayed - a.lastPlayed || b.hours - a.hours)
      .slice(0, 10)
      .map((g) => g.appid)
  );
  import { gameTags, loadTags } from "$lib/gameTags.svelte";
  import { installed } from "$lib/installed.svelte";

  // ---------- Filter panel ----------
  // Wide enough: panel beside the games. Narrow (3 games wouldn't fit next to it):
  // the panel opens on top of the games instead, and starts closed.
  let contentW = $state(0);
  const narrow = $derived(contentW > 0 && contentW < 740); // 740 = panel 200 + gap 14 + 3 games 508 + scrollbar
  let narrowOpen = $state(false);
  const filtersVisible = $derived(narrow ? narrowOpen : view.showFilters);
  const activeFilters = $derived(view.status.length + view.tags.length);

  function toggleFilters() {
    if (narrow) narrowOpen = !narrowOpen;
    else {
      view.showFilters = !view.showFilters;
      saveView();
    }
  }

  const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
  import { signOut } from "$lib/auth.svelte";
  import SignInCard from "$lib/components/SignInCard.svelte";
  import { refreshInstalled } from "$lib/installed.svelte";
  import { playing } from "$lib/playing.svelte";

  // Which games are installed (for the Play / Install buttons on the tiles).
  // Read once when the library opens, when you come back to the window, and when a
  // game starts or stops. One quick read for the whole library, no polling.
  $effect(() => {
    playing.appid;
    refreshInstalled();
  });
  $effect(() => {
    const onFocus = () => refreshInstalled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  const games = $derived.by(() => {
    const q = view.query.trim().toLowerCase();
    let list = library.games.filter((g) => g.name.toLowerCase().includes(q));

    // Ticked filters: a game must match all of them
    const now = Date.now();
    for (const s of view.status) {
      if (s === "installed") list = list.filter((g) => installed.states.has(g.appid));
      if (s === "notInstalled") list = list.filter((g) => !installed.states.has(g.appid));
      if (s === "played") list = list.filter((g) => g.hours > 0);
      if (s === "neverPlayed") list = list.filter((g) => g.hours === 0);
      if (s === "recent") list = list.filter((g) => g.lastPlayed > now - TWO_WEEKS);
    }
    for (const t of view.tags) {
      list = list.filter((g) => (gameTags.tags[g.appid] ?? []).includes(t));
    }

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

  onMount(async () => {
    // Only refresh from Steam if our copy is older than 5 minutes
    const fresh = library.status === "ready" && Date.now() - library.updatedAt < 5 * 60 * 1000;
    if (!fresh) await loadLibrary();
    // Steam tags for the filter panel: only games we don't have yet (or older than 7 days),
    // 50 per request. Runs once here, nothing that re-runs by itself.
    if (library.games.length) loadTags(library.games.map((g) => g.appid));
  });
</script>

<div class="page">
  {#if !account.steamid}
    <SignInCard />
  {:else}
    <!-- Title, search and controls on one row (like the Store) -->
    <div class="bar">
      <h1>Library <span class="count">{games.length} games</span></h1>
      <input type="search" placeholder="Search games..." bind:value={view.query} />

      <select bind:value={view.sort} onchange={saveView} aria-label="Sort by">
        <option value="name">Name (A–Z)</option>
        <option value="name-desc">Name (Z–A)</option>
        <option value="hours">Most played</option>
        <option value="hours-asc">Least played</option>
        <option value="recent">Recently played</option>
      </select>

      <button class="ghost filters-btn" class:on={filtersVisible} onclick={toggleFilters} aria-pressed={filtersVisible}>
        Filters{activeFilters ? ` (${activeFilters})` : ""}
      </button>

      <button class="ghost signout" onclick={signOut}>Sign out</button>
    </div>

    {#if library.games.length && library.status !== "private"}
      <!-- Latest news of your 10 most recently played games (hidden in short windows) -->
      <LibraryNews appids={newsIds} />
    {/if}

    {#if library.status === "loading"}
      <p class="dim">Loading your games...</p>
    {:else if library.status === "private"}
      <div class="card">
        <h2>You're signed in, but your game list is private</h2>
        <p class="dim">
          Steam only shares your games with apps like Kosmos when "Game details" is public. In
          Steam, open your profile → Edit Profile → Privacy Settings, set Game details to Public,
          then press Try again. It can take a few minutes for Steam to update.
        </p>
        <div class="row">
          <button class="primary" onclick={loadLibrary}>Try again</button>
          <button class="ghost" onclick={signOut}>Sign out</button>
        </div>
      </div>
    {:else if library.status === "error"}
      <div class="card">
        <h2>Couldn't load your games</h2>
        <p class="dim">Check your internet connection and try again.</p>
        <button class="primary" onclick={loadLibrary}>Try again</button>
      </div>
    {:else}
      <!-- Filters on the left + games. In narrow windows the filters open on top of the games. -->
      <div class="content" class:with-filters={filtersVisible && !narrow} bind:clientWidth={contentW}>
        {#if filtersVisible}
          <div class="filters" class:overlay={narrow}>
            <FilterPanel onclose={narrow ? toggleFilters : undefined} />
          </div>
        {/if}
        <div class="grid-wrap">
          {#if games.length === 0}
            <p class="dim">
              No games match {activeFilters ? "these filters" : "your search"}.
              {#if activeFilters}<button class="link" onclick={clearFilters}>Clear filters</button>{/if}
            </p>
          {:else}
            <VirtualGrid items={games} itemWidth={160} itemHeight={318} key={(g) => g.appid}>
              {#snippet children(game)}
                <GameTile {game} />
              {/snippet}
            </VirtualGrid>
          {/if}
        </div>
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
  h1 { margin: 0 6px 0 0; font-size: 1.6rem; font-weight: 700; display: flex; align-items: baseline; white-space: nowrap; }
  h2 { margin: 0 0 8px; font-size: 1.15rem; }
  .count { font-size: var(--fs-md); font-weight: 400; color: var(--text-dim); margin-left: 10px; }
  .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  input[type="search"] { flex: 1; max-width: 320px; min-width: 160px; }
  .dim { color: var(--text-dim); }
  /* ---------- Filters + games ---------- */
  .content {
    position: relative; flex: 1; min-height: 0; display: grid; gap: 14px;
    grid-template-columns: minmax(0, 1fr);
  }
  .content.with-filters { grid-template-columns: 200px minmax(0, 1fr); }
  .grid-wrap { min-height: 0; min-width: 0; }
  .filters { min-height: 0; }
  /* Narrow window: the panel floats over the games */
  .filters.overlay {
    position: absolute; z-index: 10; top: 0; left: 0; bottom: 0; width: 240px;
    box-shadow: 8px 0 24px var(--scrim); border-radius: var(--radius);
  }
  .filters-btn.on { color: var(--text); border-color: var(--accent); }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .link:hover { text-decoration: underline; }
  .card {
    max-width: 520px;
    padding: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .card p { margin: 0 0 16px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
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
  button.signout { margin-left: auto; }
  button.ghost {
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