<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { fetchNews, type NewsItem } from "$lib/gameInfo";

  // "Latest updates" row for a game page: scrollable cards; clicking one opens a popup
  // over a dimmed, slightly blurred page (no blur when reduce motion is on).
  let { appid, fallbackImage = "" }: { appid: number; fallbackImage?: string } = $props();

  let items = $state<NewsItem[]>([]);
  let status = $state<"loading" | "ready" | "error">("loading");
  let open = $state<NewsItem | null>(null);
  let row: HTMLDivElement | undefined = $state();
  let dialog: HTMLDialogElement | undefined = $state();

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
    open = item;
    dialog?.showModal();
  }

  function close() {
    dialog?.close();
  }

  // Clicking the dimmed area outside the popup closes it
  function onDialogClick(e: MouseEvent) {
    if (e.target === dialog) close();
  }

  function fmtDate(ms: number) {
    return ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  }

  function external(url: string) {
    openUrl(url).catch(() => {});
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

<!-- Popup with the full update -->
<dialog bind:this={dialog} onclick={onDialogClick} onclose={() => (open = null)} aria-label={open?.title ?? "Update"}>
  {#if open}
    <div class="sheet">
      <header>
        <div>
          <span class="date">{fmtDate(open.date)}</span>
          <h2>{open.title}</h2>
        </div>
        <button class="x" onclick={close} aria-label="Close">✕</button>
      </header>

      <div class="content">
        {#each open.blocks as b, i (i)}
          {#if b.t === "h"}
            <h3>{b.text}</h3>
          {:else if b.t === "p"}
            <p>{b.text}</p>
          {:else if b.t === "li"}
            <p class="li">{b.text}</p>
          {:else if b.t === "img"}
            <img src={b.src} alt="" loading="lazy" decoding="async" />
          {:else if b.t === "yt"}
            <button class="yt" onclick={() => external(`https://www.youtube.com/watch?v=${b.id}`)} aria-label="Play video on YouTube">
              <img src={`https://i.ytimg.com/vi/${b.id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
              <span class="play">▶</span>
            </button>
          {:else if b.t === "hr"}
            <hr />
          {/if}
        {/each}
      </div>

      {#if open.url}
        <footer>
          <button class="ghost" onclick={() => external(open!.url)}>Open on Steam ↗</button>
        </footer>
      {/if}
    </div>
  {/if}
</dialog>

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

  /* ---------- Popup ---------- */
  dialog {
    width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 64px);
    padding: 0; border: 1px solid var(--border); border-radius: 14px;
    background: var(--surface); color: var(--text); overflow: hidden;
  }
  dialog[open] { display: flex; animation: pop 0.16s ease-out; }
  dialog::backdrop { background: var(--scrim); backdrop-filter: blur(4px); }
  :global(:root[data-motion="reduced"]) dialog::backdrop { backdrop-filter: none; }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }

  .sheet { display: flex; flex-direction: column; min-height: 0; width: 100%; }
  header {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    padding: 18px 20px 14px; border-bottom: 1px solid var(--border);
  }
  header h2 { margin: 4px 0 0; font-size: 1.25rem; line-height: 1.3; }
  .x {
    flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }

  .content { overflow-y: auto; padding: 16px 20px 20px; line-height: 1.55; }
  .content h3 { margin: 18px 0 6px; font-size: 1rem; }
  .content p { margin: 0 0 10px; }
  .content .li { position: relative; padding-left: 18px; margin-bottom: 6px; }
  .content .li::before { content: "•"; position: absolute; left: 4px; color: var(--accent); }
  .content img { display: block; max-width: 100%; border-radius: var(--radius-sm); margin: 6px 0 14px; }
  .content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .yt {
    position: relative; display: block; width: 100%; padding: 0; margin: 6px 0 14px;
    border: none; background: none; border-radius: var(--radius-sm); overflow: hidden;
  }
  .yt img { margin: 0; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .play {
    position: absolute; inset: 0; margin: auto; width: 64px; height: 44px; border-radius: 12px;
    display: grid; place-items: center; background: var(--scrim); color: #fff; font-size: 1.2rem;
  }

  footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
  .ghost {
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 7px 14px; color: var(--text-dim); font-size: var(--fs-md);
  }
  .ghost:hover { color: var(--text); border-color: var(--text-dim); }
</style>
