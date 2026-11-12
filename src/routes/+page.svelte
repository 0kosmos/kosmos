<script lang="ts">
  import { onMount } from "svelte";
  import GameTile from "$lib/components/GameTile.svelte";
  import EpicTile from "$lib/components/EpicTile.svelte";
  import { epic, loadEpic, type EpicGame } from "$lib/epic.svelte";
  import { settings } from "$lib/settings.svelte";
  import type { Game } from "$lib/library.svelte";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { account } from "$lib/account.svelte";
  import { library, loadLibrary } from "$lib/library.svelte";
  import { view, saveView, clearFilters } from "$lib/libraryView.svelte";
  import FilterPanel from "$lib/components/FilterPanel.svelte";
  import CustomTile from "$lib/components/CustomTile.svelte";
  import CustomGameDialog from "$lib/components/CustomGameDialog.svelte";
  import { custom, type CustomGame } from "$lib/customGames.svelte";
  import { hidden, isHiddenGame } from "$lib/hidden.svelte";
  import { open as openFile } from "@tauri-apps/plugin-dialog";

  // ---------- Your own games: "+ Add game", then a window to name it and pick a picture ----------
  let dialog = $state<{ path?: string; game?: CustomGame } | null>(null);
  async function addOwnGame() {
    const file = await openFile({
      multiple: false,
      directory: false,
      title: "Add a game or app",
      filters: [{ name: "Games and apps", extensions: ["exe", "lnk", "url"] }],
    }).catch(() => null);
    if (typeof file === "string") dialog = { path: file };
  }
  const editOwnGame = (g: CustomGame) => (dialog = { game: g });
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
  import { onInstallsChanged } from "$lib/installEvents";
  import { isFavorite } from "$lib/favorites.svelte";
  import { playing } from "$lib/playing.svelte";

  // Which games are installed (for the Play / Install buttons on the tiles).
  // Read once when the library opens, when you come back to the window, and when a
  // game starts or stops. One quick read for the whole library, no polling.
  $effect(() => {
    playing.appid;
    refreshInstalled();
  });
  // Epic games: read when the Library opens (if they're shown) and when you come back to the window
  $effect(() => {
    if (settings.libraryEpic) loadEpic();
  });
  $effect(() => {
    const onFocus = () => {
      refreshInstalled();
      if (settings.libraryEpic) loadEpic();
    };
    window.addEventListener("focus", onFocus);
    // Steam / Epic changed their install files (download started or finished): update the buttons
    const stop = onInstallsChanged(refreshInstalled, () => loadEpic(true));
    return () => {
      window.removeEventListener("focus", onFocus);
      stop();
    };
  });

  // One list for every launcher. Epic doesn't share playtime or tags, so Epic games are left
  // out of the playtime and tag filters.
  type Item =
    | { kind: "steam"; key: string; name: string; hours: number; lastPlayed: number; steam: Game }
    | { kind: "epic"; key: string; name: string; hours: number; lastPlayed: number; epic: EpicGame }
    | { kind: "custom"; key: string; name: string; hours: number; lastPlayed: number; custom: CustomGame };
  const allItems = $derived<Item[]>([
    ...(settings.librarySteam
      ? library.games.map((g) => ({ kind: "steam" as const, key: "s" + g.appid, name: g.name, hours: g.hours, lastPlayed: g.lastPlayed, steam: g }))
      : []),
    ...(settings.libraryEpic
      ? epic.games.map((g) => ({ kind: "epic" as const, key: "e" + g.appName, name: g.name, hours: 0, lastPlayed: 0, epic: g }))
      : []),
    ...(settings.libraryCustom
      ? custom.games.map((g) => ({ kind: "custom" as const, key: "c" + g.id, name: g.name, hours: 0, lastPlayed: 0, custom: g }))
      : []),
  ]);
  // Is it installed? Your own games always are (they're files on this PC)
  const isInstalled = (it: Item) =>
    it.kind === "steam" ? installed.states.has(it.steam.appid) : it.kind === "epic" ? it.epic.installed : true;
  const isSteam = (it: Item): it is Extract<Item, { kind: "steam" }> => it.kind === "steam";

  const games = $derived.by(() => {
    const q = view.query.trim().toLowerCase();
    let list = allItems.filter((g) => g.name.toLowerCase().includes(q));
    // Hidden games only show while "Show hidden games" is ticked in the filters
    if (!hidden.showInLibrary) list = list.filter((g) => !isHiddenGame(g.key));

    // Ticked filters: a game must match all of them
    const now = Date.now();
    for (const s of view.status) {
      if (s === "favorites") list = list.filter((g) => isFavorite(g.key));
      if (s === "installed") list = list.filter((g) => isInstalled(g));
      if (s === "notInstalled") list = list.filter((g) => !isInstalled(g));
      if (s === "played") list = list.filter((g) => isSteam(g) && g.hours > 0);
      if (s === "neverPlayed") list = list.filter((g) => isSteam(g) && g.hours === 0);
      if (s === "recent") list = list.filter((g) => isSteam(g) && g.lastPlayed > now - TWO_WEEKS);
    }
    for (const t of view.tags) {
      list = list.filter((g) => isSteam(g) && (gameTags.tags[g.steam.appid] ?? []).includes(t));
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

      <!-- Square "+" button: add a game or app from this PC -->
      <button class="ghost add-btn" onclick={addOwnGame} title="Add an app or game to your library" aria-label="Add an app or game to your library">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14 M5 12h14" />
        </svg>
      </button>

      <button class="ghost filters-btn" class:on={filtersVisible} onclick={toggleFilters} aria-pressed={filtersVisible}>
        Filters{activeFilters ? ` (${activeFilters})` : ""}
      </button>

      {#if account.steamid}
        <button class="ghost signout" onclick={signOut}>Sign out</button>
      {/if}
    </div>

    {#if !account.steamid && settings.librarySteam}
      <!-- Not signed in to Steam: your Epic games still show below -->
      <SignInCard compact title="Sign in with Steam to see your Steam games here" />
    {/if}

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
          {#if allItems.length === 0}
            <p class="dim">No games to show yet.</p>
          {:else if games.length === 0}
            <p class="dim">
              No games match {activeFilters ? "these filters" : "your search"}.
              {#if activeFilters}<button class="link" onclick={clearFilters}>Clear filters</button>{/if}
            </p>
          {:else}
            <VirtualGrid items={games} itemWidth={160} itemHeight={318} key={(g) => g.key}>
              {#snippet children(item)}
                <!-- Hidden games are faded (only shown with "Show hidden games") -->
                <div class:faded={isHiddenGame(item.key)}>
                  {#if item.kind === "steam"}
                    <GameTile game={item.steam} />
                  {:else if item.kind === "epic"}
                    <EpicTile game={item.epic} />
                  {:else}
                    <CustomTile game={item.custom} onedit={editOwnGame} />
                  {/if}
                </div>
              {/snippet}
            </VirtualGrid>
          {/if}
        </div>
      </div>
    {/if}
</div>

{#if dialog}
  <CustomGameDialog path={dialog.path} game={dialog.game ?? null} onclose={() => (dialog = null)} />
{/if}

<style>
  .faded { opacity: 0.45; transition: opacity 0.15s; }
  /* Square "+" button (more specific than button.ghost, so its padding doesn't push the + aside) */
  button.ghost.add-btn {
    width: 38px; height: 38px; padding: 0; flex-shrink: 0;
    display: grid; place-items: center;
  }
  button.ghost.add-btn svg { display: block; }
  .faded:hover { opacity: 1; }
  .page {
    height: calc(100vh - 56px - var(--statusbar-h, 0px));
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