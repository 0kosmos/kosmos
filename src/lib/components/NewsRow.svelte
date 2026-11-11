<script lang="ts">
  import { fetchNews, type NewsItem } from "$lib/gameInfo";
  import NewsModal from "./NewsModal.svelte";

  // "Latest updates" row for a game page: scrollable cards; clicking one opens the shared
  // news popup (NewsModal).
  let { appid, fallbackImage = "" }: { appid: number; fallbackImage?: string } = $props();

  let items = $state<NewsItem[]>([]);
  let status = $state<"loading" | "ready" | "error">("loading");
  let row: HTMLDivElement | undefined = $state();
  let modal: NewsModal | undefined = $state();

  $effect(() => {
    const id = appid;
    items = [];
    status = "loading";
    let cancelled = false;
    fetchNews(id)
      .then((list) => {
        if (cancelled) return;
        items = list;
        status = "ready";
      })
      .catch(() => {
        if (!cancelled) status = "error";
      });
    return () => {
      cancelled = true;
    };
  });

  function scrollRow(dir: -1 | 1) {
    if (!row) return;
    const reduced = document.documentElement.dataset.motion === "reduced";
    row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }

  function show(item: NewsItem) {
    modal?.show(item);
  }

  function fmtDate(ms: number) {
    return ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  }
</script>

{#if status === "loading"}
  <p class="dim">Loading updates...</p>
{:else if status === "error"}
  <p class="dim">Couldn't load updates right now.</p>
{:else if items.length === 0}
  <p class="dim">This game has no recent updates.</p>
{:else}
  <div class="carousel">
    <button class="nav left" onclick={() => scrollRow(-1)} aria-label="Scroll updates left">‹</button>
    <div class="row" bind:this={row}>
      {#each items as item (item.id)}
        <button class="card" onclick={() => show(item)}>
          <div class="thumb">
            {#if item.image || fallbackImage}
              <img src={item.image || fallbackImage} alt="" loading="lazy" decoding="async" />
            {/if}
          </div>
          <div class="body">
            <span class="date">{fmtDate(item.date)}</span>
            <span class="title">{item.title}</span>
            <span class="preview">{item.preview}</span>
          </div>
        </button>
      {/each}
    </div>
    <button class="nav right" onclick={() => scrollRow(1)} aria-label="Scroll updates right">›</button>
  </div>
{/if}

<NewsModal bind:this={modal} />

<style>
  .dim { color: var(--text-dim); margin: 0; }

  /* ---------- Row of update cards ---------- */
  .carousel { position: relative; }
  .row {
    display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
    padding-bottom: 8px; align-items: stretch;
  }
  .card {
    flex: 0 0 250px; scroll-snap-align: start; text-align: left; padding: 0;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; display: flex; flex-direction: column;
    transition: border-color 0.15s, transform 0.15s;
  }
  .card:hover { border-color: var(--accent); transform: translateY(var(--lift)); }
  /* The image box keeps its 16:9 shape no matter how tall the image is
     (some updates use very tall images, which used to stretch the whole row). */
  .thumb { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: var(--surface-2); flex-shrink: 0; }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
  .date { font-size: var(--fs-sm); color: var(--text-dim); }
  .title {
    font-weight: 600; font-size: var(--fs-md); line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .preview {
    font-size: var(--fs-sm); color: var(--text-dim); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .nav {
    position: absolute; top: 50px; z-index: 1; width: 32px; height: 32px; border-radius: 50%;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    font-size: 1.2rem; line-height: 1; display: grid; place-items: center;
    opacity: 0; transition: opacity 0.15s;
  }
  .carousel:hover .nav, .nav:focus-visible { opacity: 1; }
  .nav.left { left: -10px; }
  .nav.right { right: -10px; }

</style>
