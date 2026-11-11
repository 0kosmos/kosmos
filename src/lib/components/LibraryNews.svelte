<script lang="ts">
  import { untrack } from "svelte";
  import { library } from "$lib/library.svelte";
  import { fetchFeed, type FeedItem } from "$lib/gameInfo";
  import NewsModal from "./NewsModal.svelte";

  // "News and updates" row in the Library: latest posts of your 10 most recently played games,
  // in one small request (cached 30 min). Clicking a card opens the full post in a popup.
  let { appids }: { appids: number[] } = $props();

  const KEY = "kosmos-library-news-collapsed";
  let collapsed = $state(
    (() => {
      try {
        return localStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    })()
  );
  function toggle() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  let items = $state<FeedItem[]>([]);
  let status = $state<"loading" | "ready" | "error">("loading");
  let modal: NewsModal | undefined = $state();
  let row: HTMLDivElement | undefined = $state();

  // Load when the list of games changes. This depends ONLY on `key` (a plain string);
  // everything it writes (items, status) is never read here, so it can't loop.
  const key = $derived(appids.join(","));
  $effect(() => {
    const ids = key;
    if (!ids) return;
    let cancelled = false;
    untrack(() => {
      fetchFeed(ids.split(",").map(Number))
        .then((list) => {
          if (cancelled) return;
          items = list;
          status = "ready";
        })
        .catch(() => {
          if (!cancelled) status = "error";
        });
    });
    return () => {
      cancelled = true;
    };
  });

  const nameOf = (id: number) => library.games.find((g) => g.appid === id)?.name ?? "";
  const thumb = (it: FeedItem) => it.image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.appid}/header.jpg`;

  function fmtDate(ms: number) {
    if (!ms) return "";
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function scroll(dir: -1 | 1) {
    if (!row) return;
    const reduced = document.documentElement.dataset.motion === "reduced";
    row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }
</script>

<section class="news">
  <button class="head" onclick={toggle} aria-expanded={!collapsed}>
    <span>News and updates</span>
    <span class="chev" class:open={!collapsed} aria-hidden="true">›</span>
  </button>

  {#if !collapsed}
    {#if status === "loading"}
      <p class="dim">Loading news...</p>
    {:else if status === "error"}
      <p class="dim">Couldn't load news right now.</p>
    {:else if items.length === 0}
      <p class="dim">No recent news for your recently played games.</p>
    {:else}
      <div class="carousel">
        <button class="nav left" onclick={() => scroll(-1)} aria-label="Scroll news left">‹</button>
        <div class="row" bind:this={row}>
          {#each items as it (it.appid + ":" + it.id)}
            <button class="card" onclick={() => modal?.show(it, { appid: it.appid, subtitle: nameOf(it.appid) })}>
              <div class="thumb"><img src={thumb(it)} alt="" loading="lazy" decoding="async" /></div>
              <div class="text">
                <span class="meta">{nameOf(it.appid)} · {fmtDate(it.date)}</span>
                <span class="title">{it.title}</span>
              </div>
            </button>
          {/each}
        </div>
        <button class="nav right" onclick={() => scroll(1)} aria-label="Scroll news right">›</button>
      </div>
    {/if}
  {/if}
</section>

<NewsModal bind:this={modal} />

<style>
  .news { margin-bottom: 14px; }
  .head {
    display: inline-flex; align-items: center; gap: 6px; padding: 0; margin-bottom: 8px;
    background: none; border: none; color: var(--text-dim);
    font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .head:hover { color: var(--text); }
  .chev { transition: transform 0.15s; display: inline-block; }
  .chev.open { transform: rotate(90deg); }
  .dim { color: var(--text-dim); font-size: var(--fs-sm); margin: 0 0 6px; }

  .carousel { position: relative; }
  .row { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 0 8px; }
  /* Same look as the Store's "Best deals" cards: image on top, text below */
  .card {
    flex: 0 0 260px; scroll-snap-align: start; display: flex; flex-direction: column;
    padding: 0; overflow: hidden; text-align: left; color: inherit;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .card:hover { border-color: var(--accent); background: var(--surface-2); transform: translateY(var(--lift)); }
  /* Fixed 16:9 box: tall images can't stretch the card */
  .thumb {
    position: relative; width: 100%; aspect-ratio: 16 / 9; flex-shrink: 0;
    overflow: hidden; background: var(--surface-2);
  }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .text { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 9px 11px 11px; }
  .meta { font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title {
    font-size: var(--fs-md); font-weight: 600; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .nav {
    position: absolute; top: 60px; z-index: 1;
    width: 30px; height: 30px; border-radius: 50%;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    font-size: 1.1rem; line-height: 1; display: grid; place-items: center;
    opacity: 0; transition: opacity 0.15s;
  }
  .carousel:hover .nav, .nav:focus-visible { opacity: 1; }
  .nav.left { left: -10px; }
  .nav.right { right: -10px; }

  /* Short window: hide the row so a full row of games (with Play buttons) still fits */
  @media (max-height: 830px) {
    .news { display: none; }
  }
</style>
