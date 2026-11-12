<script lang="ts">
  import StoreCard from "$lib/components/StoreCard.svelte";
  import EpicFreeCard from "$lib/components/EpicFreeCard.svelte";
  import {
    fetchDeals, searchStore, browseStore, fetchEpicFree, STORE_TAGS,
    type StoreGame, type BrowseQuery, type Hidden, type EpicFreeGame,
  } from "$lib/store";
  import { settings, setStoreEpic } from "$lib/settings.svelte";
  import { loadEpic } from "$lib/epic.svelte";

  // ---------- Epic Games: free games (only loaded while Epic is turned on) ----------
  let epicFree = $state<EpicFreeGame[]>([]);
  let epicStatus = $state<"loading" | "ready" | "error">("loading");
  let epicAsked = false;
  $effect(() => {
    if (!settings.storeEpic || epicAsked) return;
    epicAsked = true;
    loadEpic(); // your Epic library, for the "In library" label
    fetchEpicFree()
      .then((list) => {
        epicFree = list;
        epicStatus = "ready";
      })
      .catch(() => (epicStatus = "error"));
  });

  // ---------- Filters (remembered) ----------
  const SAVE_KEY = "kosmos-store-filters-v1";
  // Price meter steps (in your currency); the last step = any price
  const PRICE_STEPS = [0, 5, 10, 15, 20, 30, 40, 60, null] as const;

  type Filters = { sort: BrowseQuery["sort"]; tags: number[]; discounted: boolean; free: boolean; priceStep: number; minReview: number };

  function loadFilters(): Filters {
    const base: Filters = { sort: "top", tags: [], discounted: false, free: false, priceStep: PRICE_STEPS.length - 1, minReview: 0 };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
    } catch {
      return base;
    }
  }
  const f = $state(loadFilters());
  function saveFilters() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(f));
    } catch {
      /* ignore */
    }
  }

  const maxPrice = $derived(PRICE_STEPS[f.priceStep] == null ? null : PRICE_STEPS[f.priceStep]! * 100);
  const activeFilters = $derived(
    f.tags.length + (f.discounted ? 1 : 0) + (f.free ? 1 : 0) + (maxPrice != null ? 1 : 0) + (f.minReview ? 1 : 0)
  );

  function toggleTag(id: number) {
    if (f.tags.includes(id)) f.tags = f.tags.filter((t) => t !== id);
    else if (f.tags.length < 5) f.tags = [...f.tags, id]; // Steam allows up to 5 at once
    saveFilters();
  }
  function clearFilters() {
    f.tags = [];
    f.discounted = false;
    f.free = false;
    f.priceStep = PRICE_STEPS.length - 1;
    f.minReview = 0;
    saveFilters();
  }

  // ---------- Best deals ----------
  const DEALS_KEY = "kosmos-store-deals-collapsed";
  let dealsCollapsed = $state(
    (() => {
      try {
        return localStorage.getItem(DEALS_KEY) === "1";
      } catch {
        return false;
      }
    })()
  );
  function toggleDeals() {
    dealsCollapsed = !dealsCollapsed;
    try {
      localStorage.setItem(DEALS_KEY, dealsCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  let deals = $state<StoreGame[]>([]);
  let dealsStatus = $state<"loading" | "ready" | "error">("loading");
  // Loaded once when the Store opens
  let dealsAsked = false;
  $effect(() => {
    if (dealsAsked) return;
    dealsAsked = true;
    fetchDeals()
      .then((d) => {
        deals = d;
        dealsStatus = "ready";
      })
      .catch(() => (dealsStatus = "error"));
  });

  // Currency symbol for the price meter, taken from a real price (e.g. "4,99€" -> "€")
  const currency = $derived(
    (deals.find((d) => d.priceText && !d.free)?.priceText ?? "").replace(/[\d.,\s]/g, "") || ""
  );
  const priceLabel = $derived(
    PRICE_STEPS[f.priceStep] == null ? "Any price" : PRICE_STEPS[f.priceStep] === 0 ? "Free" : `Up to ${PRICE_STEPS[f.priceStep]} ${currency}`.trim()
  );

  // ---------- Browse (re-runs only when a filter changes, with a short pause) ----------
  let results = $state<StoreGame[]>([]);
  let next = $state(-1);
  let browseStatus = $state<"loading" | "ready" | "error">("loading");
  let loadingMore = $state(false);

  const query = $derived<BrowseQuery>({
    sort: f.sort,
    tags: f.tags,
    discounted: f.discounted,
    free: f.free || f.priceStep === 0,
    maxPrice: f.priceStep === 0 ? null : maxPrice,
    minReview: f.minReview,
  });

  $effect(() => {
    const q = query; // the only thing this depends on
    browseStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(() => {
      browseStore(q)
        .then((r) => {
          if (cancelled) return;
          results = r.items;
          next = r.next;
          browseStatus = "ready";
        })
        .catch(() => !cancelled && (browseStatus = "error"));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  async function loadMore() {
    if (next < 0 || loadingMore) return;
    loadingMore = true;
    const q = query;
    try {
      const r = await browseStore(q, next, 40); // 40 more each time
      if (q !== query) return; // filters changed meanwhile
      const seen = new Set(results.map((g) => g.appid));
      results = [...results, ...r.items.filter((g) => !seen.has(g.appid))];
      next = r.next;
    } catch {
      /* keep the button to try again */
    } finally {
      loadingMore = false;
    }
  }

  // ---------- Search (same search as the Steam website: 50 results, then 40 per "Load more") ----------
  let search = $state("");
  let found = $state<StoreGame[]>([]);
  let searchTotal = $state(0);
  let searchNext = $state(-1);
  let hidden = $state<Hidden>({});
  let searchStatus = $state<"idle" | "loading" | "ready" | "error">("idle");
  let loadingMoreSearch = $state(false);
  // "Show anyway": ignore your mature-content settings for this one search (settings unchanged)
  let showMatureFor = $state("");

  const term = $derived(search.trim());
  const showMature = $derived(showMatureFor !== "" && showMatureFor === term);

  // Depends only on the search text and "show anyway"; writes results it never reads
  $effect(() => {
    const t = term;
    const mature = showMature;
    if (t.length < 2) {
      searchStatus = "idle";
      return;
    }
    searchStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(() => {
      searchStore(t, 0, 50, mature)
        .then((r) => {
          if (cancelled) return;
          found = r.items;
          searchTotal = r.total;
          searchNext = r.next;
          hidden = r.hidden ?? {};
          searchStatus = "ready";
        })
        .catch(() => !cancelled && (searchStatus = "error"));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  async function loadMoreSearch() {
    if (searchNext < 0 || loadingMoreSearch) return;
    loadingMoreSearch = true;
    const t = term;
    try {
      const r = await searchStore(t, searchNext, 40, showMature);
      if (t !== term) return; // search changed meanwhile
      const seen = new Set(found.map((g) => g.appid));
      found = [...found, ...r.items.filter((g) => !seen.has(g.appid))];
      searchNext = r.next;
      for (const [k, v] of Object.entries(r.hidden ?? {})) {
        hidden = { ...hidden, [k]: ((hidden as Record<string, number>)[k] ?? 0) + (v ?? 0) };
      }
    } catch {
      /* keep the button to try again */
    } finally {
      loadingMoreSearch = false;
    }
  }

  // Reminder: what your settings hid from these results, and why
  const HIDDEN_NAMES: Record<string, string> = {
    "1": "Some Nudity or Sexual Content",
    "4": "Frequent Nudity or Sexual Content",
    "3": "Adult Only Sexual Content",
    "2": "Frequent Violence or Gore",
    "5": "General Mature Content",
    platform: "doesn't run on your chosen platform",
  };
  const hiddenReasons = $derived(
    Object.entries(hidden)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([k, n]) => ({ key: k, label: HIDDEN_NAMES[k] ?? k, n: n as number }))
  );
  const hiddenCount = $derived(hiddenReasons.reduce((s, r) => s + r.n, 0));
  const hiddenMature = $derived(hiddenReasons.some((r) => r.key !== "platform"));

  // Open Settings on its "Store" category
  function openStoreSettings() {
    try {
      localStorage.setItem("kosmos-settings-category", "store");
    } catch {
      /* ignore */
    }
  }

  // ---------- Layout: filters beside the results, or on top of them in narrow windows ----------
  let contentW = $state(0);
  const narrow = $derived(contentW > 0 && contentW < 760);
  let narrowOpen = $state(false);
  const filtersVisible = $derived(!narrow || narrowOpen);

  let dealsRow: HTMLDivElement | undefined = $state();
  function scrollDeals(dir: -1 | 1) {
    if (!dealsRow) return;
    const reduced = document.documentElement.dataset.motion === "reduced";
    dealsRow.scrollBy({ left: dir * dealsRow.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }
</script>

<div class="page">
  <div class="head">
    <h1>Store</h1>
    <input class="search" type="search" placeholder="Search Steam..." bind:value={search} />
    {#if searchStatus === "idle"}
      <!-- Sort (and Filters in narrow windows) next to the search, like in the Library -->
      <select bind:value={f.sort} onchange={saveFilters} aria-label="Sort">
        <option value="top">Top sellers</option>
        <option value="rating">Best rated</option>
        <option value="name">Name</option>
      </select>
      {#if narrow}
        <button class="ghost" class:on={narrowOpen} onclick={() => (narrowOpen = !narrowOpen)}>
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      {/if}
    {/if}
    <!-- Show Epic's free games (same switch as Settings → Store) -->
    <label class="source">
      <input type="checkbox" checked={settings.storeEpic} onchange={() => setStoreEpic(!settings.storeEpic)} />
      Epic Games
    </label>
  </div>

  {#if searchStatus !== "idle"}
    <!-- ---------- Search results ---------- -->
    <section>
      <h2 class="results-title">
        Results for "{term}"
        {#if searchStatus === "ready"}<span class="sub">{searchTotal.toLocaleString()} on Steam</span>{/if}
      </h2>

      {#if searchStatus === "ready" && showMature}
        <div class="notice">
          <span>Showing everything for this search, including content you normally hide. Your settings haven't changed.</span>
          <button class="ghost small" onclick={() => (showMatureFor = "")}>Hide it again</button>
        </div>
      {:else if searchStatus === "ready" && hiddenCount > 0}
        <!-- Reminder: some results were hidden by your Store settings -->
        <div class="notice">
          <span>
            <strong>{hiddenCount} {hiddenCount === 1 ? "result is" : "results are"} hidden</strong> by your Store settings:
            {hiddenReasons.map((r) => `${r.label} (${r.n})`).join(", ")}.
          </span>
          <span class="notice-actions">
            {#if hiddenMature}
              <button class="ghost small" onclick={() => (showMatureFor = term)}>Show them for this search</button>
            {/if}
            <a class="ghost small" href="/settings" onclick={openStoreSettings}>Change settings</a>
          </span>
        </div>
      {/if}

      {#if searchStatus === "loading"}
        <p class="dim">Searching...</p>
      {:else if searchStatus === "error"}
        <p class="dim">Couldn't search right now.</p>
      {:else if found.length === 0}
        <p class="dim">{hiddenCount ? "All matching games on this page are hidden by your settings." : "No games found."}</p>
      {:else}
        <div class="grid">
          {#each found as g (g.appid)}<StoreCard game={g} />{/each}
        </div>
      {/if}
      {#if searchStatus === "ready" && searchNext >= 0}
        <button class="more" onclick={loadMoreSearch} disabled={loadingMoreSearch}>
          {loadingMoreSearch ? "Loading..." : "Load more"}
        </button>
      {/if}
    </section>
  {:else}
    {#if settings.storeEpic}
      <!-- ---------- Epic Games: free games ---------- -->
      <section class="deals-section">
        <h2 class="section-head plain">Free on Epic Games</h2>
        {#if epicStatus === "loading"}
          <p class="dim">Loading free games...</p>
        {:else if epicStatus === "error"}
          <p class="dim">Couldn't load Epic's free games right now.</p>
        {:else if epicFree.length === 0}
          <p class="dim">No free games on Epic right now.</p>
        {:else}
          <div class="deals">
            {#each epicFree as g (g.title + g.start)}<div class="deal"><EpicFreeCard game={g} /></div>{/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- ---------- Best deals ---------- -->
    <section class="deals-section">
      <!-- Click to show / hide (remembered), same as "News and updates" in the Library -->
      <button class="section-head" onclick={toggleDeals} aria-expanded={!dealsCollapsed}>
        <span>Best deals</span>
        <span class="chev" class:open={!dealsCollapsed} aria-hidden="true">›</span>
      </button>
      {#if dealsCollapsed}
        <!-- hidden -->
      {:else if dealsStatus === "loading"}
        <p class="dim">Loading deals...</p>
      {:else if dealsStatus === "error"}
        <p class="dim">Couldn't load deals right now.</p>
      {:else if deals.length === 0}
        <p class="dim">No big deals right now.</p>
      {:else}
        <div class="carousel">
          <button class="nav left" onclick={() => scrollDeals(-1)} aria-label="Scroll deals left">‹</button>
          <div class="deals" bind:this={dealsRow}>
            {#each deals as g (g.appid)}<div class="deal"><StoreCard game={g} /></div>{/each}
          </div>
          <button class="nav right" onclick={() => scrollDeals(1)} aria-label="Scroll deals right">›</button>
        </div>
      {/if}
    </section>

    <!-- ---------- Browse with filters ---------- -->
    <section class="browse">
      <div class="content" class:with-filters={!narrow} bind:clientWidth={contentW}>
        {#if filtersVisible}
          <aside class="filters" class:overlay={narrow} aria-label="Store filters">
            <div class="fhead">
              <h3>Filters</h3>
              {#if activeFilters}<button class="link" onclick={clearFilters}>Clear ({activeFilters})</button>{/if}
              {#if narrow}<button class="x" onclick={() => (narrowOpen = false)} aria-label="Close filters">✕</button>{/if}
            </div>

            <h4>Price</h4>
            <input
              class="meter"
              type="range"
              min="0"
              max={PRICE_STEPS.length - 1}
              step="1"
              bind:value={f.priceStep}
              onchange={saveFilters}
              aria-label="Maximum price"
            />
            <span class="meter-label">{priceLabel}</span>

            <label class="check"><input type="checkbox" bind:checked={f.discounted} onchange={saveFilters} /> Discounted only</label>
            <label class="check"><input type="checkbox" bind:checked={f.free} onchange={saveFilters} /> Free to play only</label>

            <h4>Reviews</h4>
            {#each [[0, "Any"], [70, "70% positive or more"], [80, "80% or more"], [90, "90% or more"]] as [v, l]}
              <label class="check">
                <input type="radio" name="minReview" value={v} checked={f.minReview === v} onchange={() => { f.minReview = v as number; saveFilters(); }} />
                {l}
              </label>
            {/each}

            <h4>Categories <span class="sub">{f.tags.length}/5</span></h4>
            {#each STORE_TAGS as t (t.id)}
              <label class="check" class:disabled={!f.tags.includes(t.id) && f.tags.length >= 5}>
                <input
                  type="checkbox"
                  checked={f.tags.includes(t.id)}
                  disabled={!f.tags.includes(t.id) && f.tags.length >= 5}
                  onchange={() => toggleTag(t.id)}
                />
                {t.name}
              </label>
            {/each}
          </aside>
        {/if}

        <div class="results">
          {#if browseStatus === "loading" && !results.length}
            <p class="dim">Loading games...</p>
          {:else if browseStatus === "error"}
            <p class="dim">Couldn't load games right now.</p>
          {:else if results.length === 0}
            <p class="dim">No games match these filters. <button class="link" onclick={clearFilters}>Clear filters</button></p>
          {:else}
            <div class="grid" class:faded={browseStatus === "loading"}>
              {#each results as g (g.appid)}<StoreCard game={g} />{/each}
            </div>
            {#if next >= 0}
              <button class="more" onclick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .page { max-width: 1400px; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .head h1 { margin-right: 6px; }
  h1 { margin: 0; font-size: 1.6rem; font-weight: 700; }
  .search { flex: 1; max-width: 320px; min-width: 160px; } /* same as the Library */
  h2 { margin: 0 0 12px; font-size: 1.1rem; font-weight: 600; }
  .sub { font-size: var(--fs-sm); font-weight: 400; color: var(--text-dim); margin-left: 6px; }
  section { margin-bottom: 28px; }
  /* Same header style and spacing as "News and updates" in the Library */
  .deals-section { margin-bottom: 14px; }
  .section-head {
    font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-dim);
  }
  .section-head {
    display: inline-flex; align-items: center; gap: 6px; padding: 0; margin-bottom: 8px;
    background: none; border: none;
  }
  .section-head:hover { color: var(--text); }
  .section-head.plain:hover { color: var(--text-dim); } /* a title, not a button */

  /* "Epic Games" checkbox at the top right */
  .source {
    display: inline-flex; align-items: center; gap: 8px; margin-left: auto;
    padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius);
    font-size: var(--fs-md); color: var(--text-dim); cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .source:hover { color: var(--text); border-color: var(--text-dim); }
  .source input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; cursor: pointer; }
  .chev { transition: transform 0.15s; display: inline-block; }
  .chev.open { transform: rotate(90deg); }
  .dim { color: var(--text-dim); margin: 0; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; padding-top: 4px; }
  .grid.faded { opacity: 0.55; transition: opacity 0.15s; }

  /* ---------- Deals row ---------- */
  .carousel { position: relative; }
  .deals { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 0 8px; }
  .deal { flex: 0 0 260px; scroll-snap-align: start; display: flex; }
  .deal > :global(*) { flex: 1; }
  .nav {
    position: absolute; top: 50px; z-index: 1; width: 32px; height: 32px; border-radius: 50%;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    font-size: 1.2rem; line-height: 1; display: grid; place-items: center;
    opacity: 0; transition: opacity 0.15s;
  }
  .carousel:hover .nav, .nav:focus-visible { opacity: 1; }
  .nav.left { left: -10px; }
  .nav.right { right: -10px; }

  /* ---------- Browse ---------- */
  .content { position: relative; display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
  .content.with-filters { grid-template-columns: 220px minmax(0, 1fr); align-items: start; }
  .results { min-width: 0; }

  .filters {
    position: sticky; top: 0; max-height: calc(100vh - 80px - var(--statusbar-h, 0px)); overflow-y: auto;
    padding: 12px 14px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .filters.overlay {
    position: absolute; z-index: 10; top: 0; left: 0; width: 250px; max-height: 70vh;
    box-shadow: 8px 8px 24px var(--scrim);
  }
  .fhead { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  h3 {
    margin: 0; flex: 1; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  h4 { margin: 14px 0 6px; font-size: var(--fs-sm); font-weight: 600; }
  .check {
    display: flex; align-items: center; gap: 9px; padding: 4px 6px; margin: 0 -6px;
    border-radius: var(--radius-sm); cursor: pointer; font-size: var(--fs-md);
  }
  .check:hover { background: var(--hover); }
  .check input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; cursor: pointer; }
  .check.disabled { opacity: 0.45; cursor: default; }
  .meter { width: 100%; accent-color: var(--accent); padding: 0; border: none; background: none; }
  .meter-label { display: block; font-size: var(--fs-sm); color: var(--text-dim); margin: 2px 0 8px; }

  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: var(--fs-sm); }
  .link:hover { text-decoration: underline; }
  .x {
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .ghost {
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 7px 12px; color: var(--text-dim); font-size: var(--fs-md);
  }
  .ghost.on { color: var(--text); border-color: var(--accent); }
  /* Reminder when your settings hid some results */
  .notice {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 10px 14px; margin-bottom: 14px; font-size: var(--fs-sm);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: var(--radius);
  }
  .notice strong { font-weight: 600; }
  .notice-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .ghost.small { padding: 5px 10px; font-size: var(--fs-sm); text-decoration: none; display: inline-flex; align-items: center; }
  .ghost.small:hover { color: var(--text); border-color: var(--text-dim); }
  .results-title { margin: 0 0 12px; font-size: 1.1rem; font-weight: 600; }
  .more {
    margin-top: 16px; width: 100%; padding: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text-dim); transition: color 0.15s, border-color 0.15s;
  }
  .more:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }
</style>
