<script lang="ts">
  import { untrack } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    MARKET_GAMES, fetchFacets, searchMarket, fetchMarketItem, marketListingUrl,
    type MarketItem, type Facet, type MarketQuery,
  } from "$lib/market";
  import { facetApplies, tagApplies, pruneFilters } from "$lib/marketRules";

  // ---------- Filters (remembered) ----------
  const SAVE_KEY = "kosmos-market-filters-v2";
  type Saved = { appid: number; sort: string; filters: string[]; min: string; max: string };

  function load(): Saved {
    const base: Saved = { appid: 0, sort: "popular", filters: [], min: "", max: "" }; // 0 = All games
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
    } catch {
      return base;
    }
  }
  const f = $state(load());
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(f));
    } catch {
      /* ignore */
    }
  }

  let search = $state("");

  // Sort choices -> Steam's sort column + direction
  const SORTS: Record<string, [MarketQuery["sort"], MarketQuery["dir"], string]> = {
    popular: ["popular", "desc", "Most popular"],
    "price-asc": ["price", "asc", "Price: low to high"],
    "price-desc": ["price", "desc", "Price: high to low"],
    quantity: ["quantity", "desc", "Most listings"],
    name: ["name", "asc", "Name"],
  };

  const toCents = (s: string) => {
    const n = parseFloat(String(s).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  const query = $derived<MarketQuery>({
    appid: f.appid,
    query: search.trim(),
    sort: (SORTS[f.sort] ?? SORTS.popular)[0],
    dir: (SORTS[f.sort] ?? SORTS.popular)[1],
    filters: f.filters,
    min: toCents(f.min),
    max: toCents(f.max),
  });
  // A plain string, so the search below only re-runs when something really changed
  const queryKey = $derived(JSON.stringify(query));

  function chooseGame(appid: number) {
    if (f.appid === appid) return;
    f.appid = appid;
    f.filters = []; // categories belong to one game
    save();
  }

  function toggleTag(facet: string, tag: string) {
    const v = facet + ":" + tag;
    const next = f.filters.includes(v) ? f.filters.filter((x) => x !== v) : [...f.filters, v];
    // Drop ticks that no longer fit (e.g. "AWP" after switching the type to "Rifle")
    f.filters = pruneFilters(f.appid, next);
    save();
  }

  function clearFilters() {
    f.filters = [];
    f.min = "";
    f.max = "";
    save();
  }
  const activeFilters = $derived(f.filters.length + (f.min ? 1 : 0) + (f.max ? 1 : 0));

  // ---------- The selected game's categories ----------
  let facets = $state<Facet[]>([]);
  let facetsLoading = $state(false);
  let openFacets = $state<Record<string, boolean>>({});
  let facetQuery = $state<Record<string, string>>({});
  let showAllTags = $state<Record<string, boolean>>({});

  $effect(() => {
    const appid = f.appid; // only depends on the game
    facets = [];
    if (!appid) return;
    facetsLoading = true;
    let cancelled = false;
    fetchFacets(appid)
      .then((list) => {
        if (cancelled) return;
        facets = list;
        // First two groups (and any with ticked boxes) start open
        untrack(() => {
          const open: Record<string, boolean> = {};
          list.forEach((fc, i) => (open[fc.key] = i < 2 || f.filters.some((x) => x.startsWith(fc.key + ":"))));
          openFacets = open;
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && (facetsLoading = false));
    return () => {
      cancelled = true;
    };
  });

  // Only the options that fit the other ticks (e.g. only rifles when "Rifle" is ticked)
  function fittingTags(fc: Facet) {
    return fc.tags.filter((t) => tagApplies(f.appid, fc.key, t.id, f.filters));
  }

  function shownTags(fc: Facet) {
    const tags = fittingTags(fc);
    const q = (facetQuery[fc.key] ?? "").trim().toLowerCase();
    if (q) return tags.filter((t) => t.label.toLowerCase().includes(q));
    if (showAllTags[fc.key]) return tags;
    const top = tags.slice(0, 10);
    const ticked = tags.slice(10).filter((t) => f.filters.includes(fc.key + ":" + t.id));
    return [...top, ...ticked];
  }

  // Only the categories that fit the current ticks (e.g. no "Exterior" for stickers)
  const visibleFacets = $derived(facets.filter((fc) => facetApplies(f.appid, fc.key, f.filters)));

  // ---------- Results ----------
  let items = $state<MarketItem[]>([]);
  let total = $state(0);
  let next = $state(-1);
  let status = $state<"loading" | "ready" | "error" | "busy">("loading");
  let loadingMore = $state(false);

  let retry = $state(0); // "Try again" adds 1, which runs the search again

  // Depends only on queryKey (and Try again); writes results it never reads (so it can't loop)
  $effect(() => {
    const key = queryKey;
    retry;
    status = "loading";
    let cancelled = false;
    const timer = setTimeout(() => {
      const q = JSON.parse(key) as MarketQuery;
      searchMarket(q)
        .then((r) => {
          if (cancelled) return;
          if (r.busy && !r.items.length) {
            status = "busy";
            return;
          }
          items = r.items;
          total = r.total;
          next = r.next;
          status = "ready";
        })
        .catch(() => !cancelled && (status = "error"));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  async function loadMore() {
    if (next < 0 || loadingMore) return;
    loadingMore = true;
    const key = queryKey;
    try {
      const r = await searchMarket(JSON.parse(key), next);
      if (key !== queryKey) return;
      const seen = new Set(items.map((i) => i.hash + i.appid));
      items = [...items, ...r.items.filter((i) => !seen.has(i.hash + i.appid))];
      next = r.next;
    } catch {
      /* keep the button */
    } finally {
      loadingMore = false;
    }
  }

  // ---------- Item popup ----------
  let dialog: HTMLDialogElement | undefined = $state();
  let open = $state<MarketItem | null>(null);
  let detail = $state<{ lowest: string; median: string; volume: string } | null>(null);
  let detailStatus = $state<"loading" | "ready" | "error">("loading");

  function showItem(it: MarketItem) {
    open = it;
    detail = null;
    detailStatus = "loading";
    dialog?.showModal();
    fetchMarketItem(it.appid, it.hash)
      .then((d) => {
        if (open?.hash !== it.hash) return;
        detail = d;
        detailStatus = "ready";
      })
      .catch(() => open?.hash === it.hash && (detailStatus = "error"));
  }

  function buy() {
    if (open) openUrl(marketListingUrl(open.appid, open.hash)).catch(() => {});
  }

  // ---------- Layout ----------
  let contentW = $state(0);
  const narrow = $derived(contentW > 0 && contentW < 700);
  let narrowOpen = $state(false);
  const filtersVisible = $derived(!narrow || narrowOpen);
  const gameName = $derived(MARKET_GAMES.find((g) => g.appid === f.appid)?.name ?? "");
</script>

<div class="page">
  <!-- Title, search, sort (like the Store and Library) -->
  <div class="head">
    <h1>Market</h1>
    <input class="search" type="search" placeholder="Search the market..." bind:value={search} />
    <select bind:value={f.sort} onchange={save} aria-label="Sort">
      {#each Object.entries(SORTS) as [value, [, , label]]}<option {value}>{label}</option>{/each}
    </select>
    {#if narrow}
      <button class="ghost" class:on={narrowOpen} onclick={() => (narrowOpen = !narrowOpen)}>
        Filters{activeFilters ? ` (${activeFilters})` : ""}
      </button>
    {/if}
  </div>

  <div class="content" class:with-filters={!narrow} bind:clientWidth={contentW}>
    {#if filtersVisible}
      <aside class="filters" class:overlay={narrow} aria-label="Market filters">
        <div class="fhead">
          <h3>Filters</h3>
          {#if activeFilters}<button class="link" onclick={clearFilters}>Clear ({activeFilters})</button>{/if}
          {#if narrow}<button class="x" onclick={() => (narrowOpen = false)} aria-label="Close filters">✕</button>{/if}
        </div>

        <h4>Game</h4>
        {#each MARKET_GAMES as g (g.appid)}
          <label class="check">
            <input type="radio" name="market-game" checked={f.appid === g.appid} onchange={() => chooseGame(g.appid)} />
            <span class="name">{g.name}</span>
          </label>
        {/each}

        <h4>Price</h4>
        <div class="price-range">
          <input type="text" inputmode="decimal" placeholder="Min" bind:value={f.min} onchange={save} aria-label="Minimum price" />
          <span>–</span>
          <input type="text" inputmode="decimal" placeholder="Max" bind:value={f.max} onchange={save} aria-label="Maximum price" />
        </div>

        {#if facetsLoading}
          <p class="dim">Loading categories...</p>
        {/if}
        {#each visibleFacets as fc (fc.key)}
          <div class="facet">
            <button class="facet-head" onclick={() => (openFacets = { ...openFacets, [fc.key]: !openFacets[fc.key] })} aria-expanded={!!openFacets[fc.key]}>
              <span>{fc.label}</span>
              {#if f.filters.some((x) => x.startsWith(fc.key + ":"))}
                <span class="count-badge">{f.filters.filter((x) => x.startsWith(fc.key + ":")).length}</span>
              {/if}
              <span class="chev" class:open={openFacets[fc.key]} aria-hidden="true">›</span>
            </button>
            {#if openFacets[fc.key]}
              {#if fittingTags(fc).length > 15}
                <input
                  class="tag-search"
                  type="search"
                  placeholder={"Find " + fc.label.toLowerCase() + "..."}
                  value={facetQuery[fc.key] ?? ""}
                  oninput={(e) => (facetQuery = { ...facetQuery, [fc.key]: e.currentTarget.value })}
                />
              {/if}
              {#each shownTags(fc) as t (t.id)}
                <label class="check">
                  <input type="checkbox" checked={f.filters.includes(fc.key + ":" + t.id)} onchange={() => toggleTag(fc.key, t.id)} />
                  <span class="name">{t.label}</span>
                  {#if t.count}<span class="n">{t.count.toLocaleString()}</span>{/if}
                </label>
              {/each}
              {#if !(facetQuery[fc.key] ?? "") && fittingTags(fc).length > 10}
                <button class="link more-tags" onclick={() => (showAllTags = { ...showAllTags, [fc.key]: !showAllTags[fc.key] })}>
                  {showAllTags[fc.key] ? "Show fewer" : `Show all ${fittingTags(fc).length}`}
                </button>
              {/if}
            {/if}
          </div>
        {/each}
      </aside>
    {/if}

    <div class="results">
      {#if status === "ready"}
        <p class="summary">
          {total.toLocaleString()} {total === 1 ? "item" : "items"}{gameName && f.appid ? ` in ${gameName}` : ""}
          <span class="dim"> · prices are approximate, the item details show Steam's exact price</span>
        </p>
      {/if}

      {#if status === "loading" && !items.length}
        <p class="dim">Loading the market...</p>
      {:else if status === "busy"}
        <p class="dim">
          The Steam Market is busy right now (Steam limits how often it can be asked). Try again in a minute.
          <button class="link" onclick={() => retry++}>Try again</button>
        </p>
      {:else if status === "error"}
        <p class="dim">Couldn't load the market right now. <button class="link" onclick={() => retry++}>Try again</button></p>
      {:else if items.length === 0}
        <p class="dim">No items match. {#if activeFilters}<button class="link" onclick={clearFilters}>Clear filters</button>{/if}</p>
      {:else}
        <div class="grid" class:faded={status === "loading"}>
          {#each items as it (it.appid + it.hash)}
            <button class="item" onclick={() => showItem(it)}>
              <div class="img">
                {#if it.icon}<img src={it.icon} alt="" loading="lazy" decoding="async" />{/if}
              </div>
              <span class="iname" style:color={it.color ? "#" + it.color : null} title={it.name}>{it.name}</span>
              <span class="itype">{it.type || it.game}</span>
              <span class="irow">
                <span class="price">{it.priceText || "—"}</span>
                <span class="listings">{it.listings.toLocaleString()} listed</span>
              </span>
            </button>
          {/each}
        </div>
        {#if next >= 0}
          <button class="more" onclick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more"}</button>
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Item details: Steam's exact prices + buy on Steam -->
<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog?.close()} onclose={() => (open = null)} aria-label={open?.name ?? "Item"}>
  {#if open}
    <div class="sheet">
      <button class="x close" onclick={() => dialog?.close()} aria-label="Close">✕</button>
      <div class="big-img">{#if open.icon}<img src={open.icon.replace("/256fx256f", "/360fx360f")} alt="" />{/if}</div>
      <h2 style:color={open.color ? "#" + open.color : null}>{open.name}</h2>
      <p class="dim">{open.type}{open.game ? " · " + open.game : ""}</p>

      <div class="stats">
        {#if detailStatus === "loading"}
          <p class="dim">Getting Steam's prices...</p>
        {:else if detailStatus === "error" || !detail}
          <p class="dim">Couldn't get the exact price right now. List price: {open.priceText}</p>
        {:else}
          <div><span class="dim">Lowest price</span><strong>{detail.lowest || open.priceText || "—"}</strong></div>
          <div><span class="dim">Median sale</span><strong>{detail.median || "—"}</strong></div>
          <div><span class="dim">Sold in 24 h</span><strong>{detail.volume || "0"}</strong></div>
        {/if}
        <div><span class="dim">Listed</span><strong>{open.listings.toLocaleString()}</strong></div>
      </div>

      <button class="buy" onclick={buy}>Buy on Steam Market</button>
      <p class="dim small">Opens this item in the Steam client, where you can buy it with your Steam Wallet.</p>
    </div>
  {/if}
</dialog>

<style>
  .page { max-width: 1500px; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .head h1 { margin: 0 6px 0 0; font-size: 1.6rem; font-weight: 700; }
  .search { flex: 1; max-width: 320px; min-width: 160px; }
  .dim { color: var(--text-dim); margin: 0; }
  .small { font-size: var(--fs-sm); }

  .content { position: relative; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
  .content.with-filters { grid-template-columns: 210px minmax(0, 1fr); align-items: start; }
  .results { min-width: 0; }
  .summary { margin: 0 0 10px; font-size: var(--fs-sm); }

  /* ---------- Filters ---------- */
  .filters {
    position: sticky; top: 0; max-height: calc(100vh - 80px - var(--statusbar-h, 0px)); overflow-y: auto;
    padding: 12px 14px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .filters.overlay { position: absolute; z-index: 10; top: 0; left: 0; width: 250px; max-height: 70vh; box-shadow: 8px 8px 24px var(--scrim); }
  .fhead { display: flex; align-items: center; gap: 8px; }
  h3 { margin: 0; flex: 1; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  h4 { margin: 14px 0 6px; font-size: var(--fs-sm); font-weight: 600; }
  .check {
    display: flex; align-items: center; gap: 9px; padding: 4px 6px; margin: 0 -6px;
    border-radius: var(--radius-sm); cursor: pointer; font-size: var(--fs-md);
  }
  .check:hover { background: var(--hover); }
  .check input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; flex-shrink: 0; cursor: pointer; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-size: 0.75rem; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .price-range { display: flex; align-items: center; gap: 6px; }
  .price-range input { width: 100%; min-width: 0; padding: 6px 8px; font-size: var(--fs-sm); }
  .facet { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px; }
  .facet-head {
    width: 100%; display: flex; align-items: center; gap: 6px; padding: 4px 0;
    background: none; border: none; color: var(--text); font-size: var(--fs-sm); font-weight: 600; text-align: left;
  }
  .facet-head span:first-child { flex: 1; }
  .count-badge { font-size: 0.7rem; padding: 0 6px; border-radius: 999px; background: var(--accent); color: var(--on-accent); }
  .chev { transition: transform 0.15s; color: var(--text-dim); }
  .chev.open { transform: rotate(90deg); }
  .tag-search { width: 100%; margin: 4px 0 6px; padding: 5px 8px; font-size: var(--fs-sm); }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: var(--fs-sm); }
  .link:hover { text-decoration: underline; }
  .more-tags { margin-top: 4px; }
  .x { width: 26px; height: 26px; border-radius: var(--radius-sm); background: transparent; border: 1px solid var(--border); color: var(--text-dim); }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .ghost { background: transparent; border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 12px; color: var(--text-dim); font-size: var(--fs-md); }
  .ghost.on { color: var(--text); border-color: var(--accent); }

  /* ---------- Items ---------- */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; padding-top: 2px; }
  .grid.faded { opacity: 0.55; transition: opacity 0.15s; }
  .item {
    display: flex; flex-direction: column; gap: 3px; padding: 10px; text-align: left; color: inherit;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .item:hover { border-color: var(--accent); background: var(--surface-2); transform: translateY(var(--lift)); }
  .img {
    aspect-ratio: 4 / 3; margin-bottom: 6px; border-radius: var(--radius-sm); overflow: hidden;
    display: grid; place-items: center;
    background: radial-gradient(circle at 50% 50%, var(--surface-2), var(--bg));
  }
  /* The picture fills the box with even padding, so it sits exactly in the middle */
  .img { position: relative; }
  .img img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; padding: 8%; box-sizing: border-box; object-fit: contain; object-position: center; }
  .iname { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .itype { font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .irow { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-top: 4px; }
  .price { font-weight: 700; }
  .listings { font-size: 0.72rem; color: var(--text-dim); }
  .more {
    margin-top: 16px; width: 100%; padding: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text-dim); transition: color 0.15s, border-color 0.15s;
  }
  .more:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }

  /* ---------- Item popup ---------- */
  dialog {
    width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 64px); padding: 0;
    border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text);
  }
  dialog[open] { animation: pop 0.16s ease-out; }
  dialog::backdrop { background: var(--scrim); backdrop-filter: blur(4px); }
  :global(:root[data-motion="reduced"]) dialog::backdrop { backdrop-filter: none; }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }
  .sheet { position: relative; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
  /* Always drawn above the picture box */
  .close { position: absolute; top: 12px; right: 12px; z-index: 2; background: var(--surface); }
  .close:hover { background: var(--surface-2); }
  .big-img {
    height: 220px; display: grid; place-items: center; border-radius: var(--radius);
    background: radial-gradient(circle at 50% 50%, var(--surface-2), var(--bg));
  }
  .big-img { position: relative; }
  .big-img img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; padding: 6%; box-sizing: border-box; object-fit: contain; object-position: center; }
  .sheet h2 { margin: 6px 0 0; font-size: 1.15rem; line-height: 1.3; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: var(--surface-2); border-radius: var(--radius-sm); }
  .stats .dim { font-size: 0.75rem; }
  .stats p { grid-column: 1 / -1; }
  .buy {
    height: 42px; border-radius: var(--radius); border: 1px solid var(--accent);
    background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 1rem;
  }
  .buy:hover { filter: brightness(1.1); }
</style>
