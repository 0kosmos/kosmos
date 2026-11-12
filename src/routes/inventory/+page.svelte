<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import SignInCard from "$lib/components/SignInCard.svelte";
  import { account } from "$lib/account.svelte";
  import {
    fetchInvGames, fetchInvItems, fetchPrices, knownPrice, formatTotal,
    type InvGame, type InvItem, type Price,
  } from "$lib/inventory";

  // Your Steam inventory: pick a game, see your items and their Community Market price, and
  // the total value. Prices are loaded 10 at a time (Steam allows only a few per minute) and
  // remembered for 6 hours, so the total fills in over a short while the first time.

  type Status = "loading" | "ready" | "private" | "busy" | "error";

  let games = $state<InvGame[]>([]);
  let gamesStatus = $state<Status>("loading");
  let pick = $state(""); // "appid/context"

  let items = $state<InvItem[]>([]);
  let itemsStatus = $state<Status>("loading");
  let prices = $state<Record<string, Price>>({});
  let pricing = $state(false); // still loading prices
  let search = $state("");
  let sort = $state<"price" | "name" | "amount">("price");

  // ---------- Games you have items in ----------
  async function loadGames(fresh = false) {
    if (!account.steamid) return;
    gamesStatus = "loading";
    try {
      const r = await fetchInvGames(account.steamid, fresh);
      if (r.busy) gamesStatus = "busy";
      else if (r.private) gamesStatus = "private";
      else {
        games = r.games;
        gamesStatus = "ready";
        // Start with the game with the most items (or keep the one you picked)
        if (!games.some((g) => g.contexts.some((c) => `${g.appid}/${c.id}` === pick))) {
          const g = games[0];
          pick = g ? `${g.appid}/${g.contexts[0].id}` : "";
        }
      }
    } catch {
      gamesStatus = "error";
    }
  }
  $effect(() => {
    account.steamid; // again after signing in
    untrack(() => loadGames());
  });

  // Every game + item type you can pick (Steam's own items have a few kinds, e.g. cards)
  const options = $derived(
    games.flatMap((g) =>
      g.contexts.map((c) => ({
        value: `${g.appid}/${c.id}`,
        label: g.contexts.length > 1 ? `${g.name} · ${c.name} (${c.count})` : `${g.name} (${c.count})`,
      }))
    )
  );
  const appid = $derived(Number(pick.split("/")[0]) || 0);

  // ---------- Items of the picked game ----------
  async function loadItems(fresh = false) {
    const [a, ctx] = pick.split("/");
    if (!account.steamid || !a) return;
    itemsStatus = "loading";
    try {
      const r = await fetchInvItems(account.steamid, Number(a), ctx, fresh);
      if (r.busy) itemsStatus = "busy";
      else if (r.private) itemsStatus = "private";
      else {
        items = r.items;
        itemsStatus = "ready";
      }
    } catch {
      itemsStatus = "error";
    }
  }
  $effect(() => {
    pick; // only re-runs when you pick another game
    untrack(() => loadItems());
  });

  // ---------- Prices: 10 at a time, while this page is open ----------
  $effect(() => {
    const list = itemsStatus === "ready" ? items : [];
    const app = appid;
    let stopped = false;
    untrack(() => {
      // What we already know
      const start: Record<string, Price> = {};
      for (const it of list) {
        const p = it.marketable ? knownPrice(app, it.hash) : null;
        if (p) start[it.hash] = p;
      }
      prices = start;
    });
    const todo = [...new Set(list.filter((it) => it.marketable && it.hash && !knownPrice(app, it.hash)).map((it) => it.hash))];
    if (!todo.length) {
      pricing = false;
      return;
    }
    pricing = true;
    (async () => {
      let waits = 0;
      while (todo.length && !stopped) {
        const batch = todo.slice(0, 10);
        try {
          const r = await fetchPrices(app, batch);
          if (stopped) return;
          prices = { ...prices, ...r.prices };
          todo.splice(0, Object.keys(r.prices).length || batch.length);
          if (r.busy) {
            if (++waits > 3) break; // Steam keeps saying "slow down": stop for now
            await new Promise((ok) => setTimeout(ok, 30_000));
          } else await new Promise((ok) => setTimeout(ok, 1500));
        } catch {
          break;
        }
      }
      if (!stopped) pricing = false;
    })();
    return () => {
      stopped = true;
    };
  });

  // ---------- Shown items and the total ----------
  const shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const list = q ? items.filter((it) => it.name.toLowerCase().includes(q) || it.type.toLowerCase().includes(q)) : [...items];
    const value = (it: InvItem) => (prices[it.hash]?.value ?? -1) * it.amount;
    if (sort === "price") list.sort((a, b) => value(b) - value(a));
    else if (sort === "amount") list.sort((a, b) => b.amount - a.amount);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  });
  const totalCount = $derived(items.reduce((n, it) => n + it.amount, 0));
  const total = $derived.by(() => {
    let sum = 0;
    let priced = 0;
    let marketable = 0;
    let example = "";
    for (const it of items) {
      if (!it.marketable) continue;
      marketable++;
      const p = prices[it.hash];
      if (p?.value != null) {
        sum += p.value * it.amount;
        priced++;
        example ||= p.lowest || p.median;
      }
    }
    return { sum, priced, marketable, text: example ? formatTotal(sum, example) : "" };
  });

  const steamLink = (url: string) => openUrl(url).catch(() => {});
  const listing = (it: InvItem) =>
    steamLink(`steam://openurl/https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(it.hash)}`);
  const privacy = () => steamLink(`steam://openurl/https://steamcommunity.com/profiles/${account.steamid}/edit/settings`);
</script>

<div class="page">
  <div class="head">
    <h1>Inventory</h1>
    {#if gamesStatus === "ready" && options.length}
      <select bind:value={pick} aria-label="Game">
        {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
      <input class="search" type="search" placeholder="Search items..." bind:value={search} />
      <select bind:value={sort} aria-label="Sort">
        <option value="price">Most valuable</option>
        <option value="name">Name</option>
        <option value="amount">Amount</option>
      </select>
    {/if}
    {#if account.steamid}
      <button class="ghost" onclick={() => { loadGames(true); loadItems(true); }} title="Ask Steam again">↻ Refresh</button>
    {/if}
  </div>

  {#if !account.steamid}
    <SignInCard title="Sign in to see your inventory" />
  {:else if gamesStatus === "loading"}
    <p class="dim">Loading your inventory...</p>
  {:else if gamesStatus === "private"}
    <div class="card">
      <h2>Your inventory is private</h2>
      <p class="dim">
        Steam only shows your items to apps like Kosmos when your inventory is public. In your
        Steam privacy settings, set <b>Inventory</b> to <b>Public</b>, then come back and press
        Check again. It can take a minute for Steam to update.
      </p>
      <div class="row">
        <button class="primary" onclick={privacy}>Open privacy settings ↗</button>
        <button class="ghost" onclick={() => loadGames(true)}>Check again</button>
      </div>
    </div>
  {:else if gamesStatus === "busy" || itemsStatus === "busy"}
    <div class="card">
      <h2>Steam is busy</h2>
      <p class="dim">Steam only answers a few inventory questions per minute. Wait a moment and try again.</p>
      <button class="primary" onclick={() => (gamesStatus === "busy" ? loadGames(true) : loadItems(true))}>Try again</button>
    </div>
  {:else if gamesStatus === "error"}
    <div class="card">
      <h2>Couldn't load your inventory</h2>
      <p class="dim">Check your internet connection and try again.</p>
      <button class="primary" onclick={() => loadGames(true)}>Try again</button>
    </div>
  {:else if !options.length}
    <div class="card">
      <h2>Your inventory is empty</h2>
      <p class="dim">Skins, cases, trading cards and other items you get in games show up here.</p>
      <button class="primary" onclick={() => goto("/market")}>Browse the Market</button>
    </div>
  {:else}
    <!-- Value of this game's items -->
    <div class="summary">
      <span><b>{totalCount}</b> {totalCount === 1 ? "item" : "items"}</span>
      {#if total.text}
        <span class="sep">·</span>
        <span title="The lowest price each item sells for on the Steam Community Market, times how many you have">
          Worth about <b>{total.text}</b>
        </span>
      {/if}
      {#if pricing}
        <span class="sep">·</span>
        <span class="dim">Loading prices {total.priced}/{total.marketable}...</span>
      {:else if total.marketable && total.priced < total.marketable}
        <span class="sep">·</span>
        <span class="dim">{total.marketable - total.priced} without a price yet</span>
      {/if}
    </div>

    {#if itemsStatus === "loading"}
      <p class="dim">Loading items...</p>
    {:else if itemsStatus === "private"}
      <p class="dim">This part of your inventory is private.</p>
    {:else if itemsStatus === "error"}
      <p class="dim">Couldn't load these items. <button class="link" onclick={() => loadItems(true)}>Try again</button></p>
    {:else}
      <div class="grid-wrap">
        <VirtualGrid items={shown} itemWidth={160} itemHeight={222} gap={12} key={(it) => it.id}>
          {#snippet children(it)}
            <button
              class="item"
              onclick={() => it.marketable && listing(it)}
              disabled={!it.marketable}
              title={it.marketable ? "Open on the Steam Community Market" : "This item can't be sold on the Market"}
            >
              <div class="pic">
                {#if it.icon}<img src={it.icon} alt="" loading="lazy" decoding="async" />{/if}
                {#if it.amount > 1}<span class="amount">×{it.amount}</span>{/if}
              </div>
              <span class="name" style:color={it.color ? "#" + it.color : null} title={it.name}>{it.name}</span>
              <span class="type" title={it.type}>{it.type}</span>
              <span class="price">
                {#if !it.marketable}
                  <span class="dim">Not on the Market</span>
                {:else if prices[it.hash]?.lowest || prices[it.hash]?.median}
                  {prices[it.hash].lowest || prices[it.hash].median}
                {:else if pricing}
                  <span class="dim">…</span>
                {:else}
                  <span class="dim">No price</span>
                {/if}
              </span>
            </button>
          {/snippet}
        </VirtualGrid>
      </div>

      {#if totalCount < 10}
        <!-- Only a few items: point to the Market -->
        <div class="more">
          <span>Looking for more items?</span>
          <button class="ghost" onclick={() => goto("/market")}>Browse the Market</button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .page { height: calc(100vh - 56px - var(--statusbar-h, 0px)); display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  h1 { margin: 0 6px 0 0; font-size: 1.6rem; font-weight: 700; }
  h2 { margin: 0 0 8px; font-size: 1.15rem; }
  select { max-width: 300px; }
  .search { flex: 1; max-width: 280px; min-width: 150px; }
  .dim { color: var(--text-dim); }
  .card {
    max-width: 560px; padding: 22px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .card p { margin: 0 0 16px; line-height: 1.5; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .primary, .ghost { padding: 8px 14px; border-radius: var(--radius); font-size: var(--fs-md); }
  .primary { background: var(--accent); color: var(--on-accent); border: none; font-weight: 600; }
  .primary:hover { filter: brightness(1.1); }
  .ghost { background: transparent; border: 1px solid var(--border); color: var(--text-dim); }
  .ghost:hover { color: var(--text); border-color: var(--text-dim); }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }

  .summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; font-size: var(--fs-md); }
  .summary b { font-weight: 700; }
  .sep { color: var(--text-dim); }
  .grid-wrap { flex: 1; min-height: 0; }

  .item {
    width: 160px; height: 222px; padding: 8px; text-align: left;
    display: flex; flex-direction: column; gap: 3px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: inherit; font: inherit; transition: border-color 0.15s, transform 0.15s;
  }
  .item:hover:not(:disabled) { border-color: var(--accent); transform: translateY(var(--lift)); }
  .item:disabled { cursor: default; }
  .pic {
    position: relative; height: 116px; margin-bottom: 4px; border-radius: var(--radius-sm);
    display: grid; place-items: center; background: var(--surface-2); overflow: hidden;
  }
  .pic img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .amount {
    position: absolute; right: 6px; bottom: 6px; padding: 1px 7px; border-radius: 999px;
    font-size: 0.72rem; font-weight: 700; background: var(--scrim); color: #fff; /* on the picture */
  }
  .name { font-weight: 600; font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .type { font-size: 0.74rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .price { margin-top: auto; font-weight: 700; font-size: var(--fs-sm); }
  .price .dim { font-weight: 400; }
  .more {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    margin-top: 12px; padding: 10px 14px; font-size: var(--fs-md);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
</style>
