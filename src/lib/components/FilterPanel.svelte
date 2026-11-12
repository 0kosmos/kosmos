<script lang="ts">
  import { library } from "$lib/library.svelte";
  import { gameTags } from "$lib/gameTags.svelte";
  import { view, toggleStatus, toggleTag, clearFilters, type StatusKey } from "$lib/libraryView.svelte";
  import { installed } from "$lib/installed.svelte";
  import { epic } from "$lib/epic.svelte";
  import { settings, setLibrarySource } from "$lib/settings.svelte";
  import { isFavorite, steamKey, epicKey } from "$lib/favorites.svelte";

  // Checkbox filters on the left of the Library (like Steam store filters).
  // A game must match everything that's ticked.
  let { onclose }: { onclose?: () => void } = $props();

  const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
  const STATUS: { key: StatusKey; label: string }[] = [
    { key: "favorites", label: "★ Favorites" },
    { key: "installed", label: "Installed locally" },
    { key: "notInstalled", label: "Not installed" },
    { key: "played", label: "Played" },
    { key: "neverPlayed", label: "Never played" },
    { key: "recent", label: "Recently played" }, // last 2 weeks
  ];

  const statusCount = $derived.by(() => {
    const now = Date.now();
    const c: Record<StatusKey, number> = { favorites: 0, installed: 0, notInstalled: 0, played: 0, neverPlayed: 0, recent: 0 };
    if (settings.librarySteam) {
      for (const g of library.games) {
        if (isFavorite(steamKey(g.appid))) c.favorites++;
        if (installed.states.has(g.appid)) c.installed++;
        else c.notInstalled++;
        if (g.hours > 0) c.played++;
        else c.neverPlayed++;
        if (g.lastPlayed > now - TWO_WEEKS) c.recent++;
      }
    }
    if (settings.libraryEpic) {
      for (const g of epic.games) {
        if (isFavorite(epicKey(g.appName))) c.favorites++;
        if (g.installed) c.installed++;
        else c.notInstalled++;
      }
    }
    return c;
  });

  // Every tag at least 2 of your games share, biggest first (ticked ones always shown)
  const tagList = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const g of library.games) {
      for (const t of gameTags.tags[g.appid] ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([t, n]) => n >= 2 || view.tags.includes(t))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });

  let tagQuery = $state("");
  let showAll = $state(false);
  const LIMIT = 12;

  const shownTags = $derived.by(() => {
    const q = tagQuery.trim().toLowerCase();
    if (q) return tagList.filter(([t]) => t.toLowerCase().includes(q));
    if (showAll) return tagList;
    // Top tags, plus any ticked tag that isn't in the top
    const top = tagList.slice(0, LIMIT);
    const extra = tagList.slice(LIMIT).filter(([t]) => view.tags.includes(t));
    return [...top, ...extra];
  });

  const active = $derived(view.status.length + view.tags.length);
</script>

<aside class="panel" aria-label="Filters">
  <div class="head">
    <h2>Filters</h2>
    {#if active}
      <button class="link" onclick={clearFilters}>Clear ({active})</button>
    {/if}
    {#if onclose}
      <button class="x" onclick={onclose} aria-label="Close filters">✕</button>
    {/if}
  </div>

  <div class="scroll">
    <!-- Which launchers' games to show (same switches as in Settings → Library) -->
    <h3>Launchers</h3>
    <label class="check">
      <input type="checkbox" checked={settings.librarySteam} onchange={() => setLibrarySource("steam", !settings.librarySteam)} />
      <span class="name">Steam</span>
      <span class="n">{library.games.length}</span>
    </label>
    <label class="check">
      <input type="checkbox" checked={settings.libraryEpic} onchange={() => setLibrarySource("epic", !settings.libraryEpic)} />
      <span class="name">Epic Games</span>
      <span class="n">{epic.games.length}</span>
    </label>

    <h3>Status</h3>
    {#each STATUS as s}
      <label class="check">
        <input type="checkbox" checked={view.status.includes(s.key)} onchange={() => toggleStatus(s.key)} />
        <span class="name">{s.label}</span>
        <span class="n">{statusCount[s.key]}</span>
      </label>
    {/each}

    <h3>Tags</h3>
    {#if tagList.length > 6}
      <input class="search" type="search" placeholder="Find a tag..." bind:value={tagQuery} />
    {/if}
    {#if gameTags.loading && !tagList.length}
      <p class="dim">Loading Steam tags...</p>
    {:else if gameTags.failed && !tagList.length}
      <p class="dim">Couldn't load tags. They'll load next time you open the Library.</p>
    {/if}
    {#each shownTags as [tag, n] (tag)}
      <label class="check">
        <input type="checkbox" checked={view.tags.includes(tag)} onchange={() => toggleTag(tag)} />
        <span class="name">{tag}</span>
        <span class="n">{n}</span>
      </label>
    {/each}
    {#if !tagQuery && tagList.length > LIMIT}
      <button class="link more" onclick={() => (showAll = !showAll)}>
        {showAll ? "Show fewer" : `Show all ${tagList.length} tags`}
      </button>
    {/if}
  </div>
</aside>

<style>
  .panel {
    display: flex; flex-direction: column; min-height: 0; height: 100%;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
  h2 {
    margin: 0; flex: 1; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  h3 { margin: 14px 0 6px; font-size: var(--fs-sm); font-weight: 600; color: var(--text); }
  h3:first-child { margin-top: 0; }
  .scroll { overflow-y: auto; padding: 0 14px 14px; min-height: 0; }

  .check {
    display: flex; align-items: center; gap: 9px; padding: 5px 6px; margin: 0 -6px;
    border-radius: var(--radius-sm); cursor: pointer; font-size: var(--fs-md);
    transition: background 0.15s;
  }
  .check:hover { background: var(--hover); }
  .check input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; flex-shrink: 0; cursor: pointer; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-size: var(--fs-sm); color: var(--text-dim); font-variant-numeric: tabular-nums; }

  .search { width: 100%; margin-bottom: 6px; padding: 6px 10px; font-size: var(--fs-sm); }
  .dim { color: var(--text-dim); font-size: var(--fs-sm); margin: 4px 0; }
  .link {
    background: none; border: none; padding: 2px 0; color: var(--accent);
    font-size: var(--fs-sm); cursor: pointer;
  }
  .link:hover { text-decoration: underline; }
  .more { margin-top: 6px; }
  .x {
    width: 26px; height: 26px; border-radius: var(--radius-sm); flex-shrink: 0;
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
</style>
