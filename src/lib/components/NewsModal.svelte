<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { fetchNews, type NewsItem, type NewsBlock } from "$lib/gameInfo";

  // Popup with a full news post / patch note, over a dimmed, slightly blurred page
  // (no blur when reduce motion is on). Used by the game page and the library news panel.
  // Open it with: modal.show(item) or modal.show(item, { appid, subtitle }) when the full text
  // still has to be loaded (it then comes from the per-game news cache).
  type Shown = { id: string; title: string; date: number; url: string; blocks?: NewsBlock[] };

  let dialog: HTMLDialogElement | undefined = $state();
  let open = $state<Shown | null>(null);
  let subtitle = $state("");
  let loading = $state(false);
  let failed = $state(false);

  export function show(item: Shown, opts: { appid?: number; subtitle?: string } = {}) {
    open = item;
    subtitle = opts.subtitle ?? "";
    failed = false;
    dialog?.showModal();
    if (!item.blocks && opts.appid) {
      loading = true;
      const want = item.id;
      fetchNews(opts.appid)
        .then((list: NewsItem[]) => {
          if (open?.id !== want) return;
          const full = list.find((n) => n.id === want);
          if (full) open = { ...open, blocks: full.blocks };
          else failed = true;
        })
        .catch(() => open?.id === want && (failed = true))
        .finally(() => (loading = false));
    }
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

<dialog bind:this={dialog} onclick={onDialogClick} onclose={() => (open = null)} aria-label={open?.title ?? "News"}>
  {#if open}
    <div class="sheet">
      <header>
        <div>
          <span class="date">{subtitle ? subtitle + " · " : ""}{fmtDate(open.date)}</span>
          <h2>{open.title}</h2>
        </div>
        <button class="x" onclick={close} aria-label="Close">✕</button>
      </header>

      <div class="content">
        {#if open.blocks}
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
        {:else if loading}
          <p class="dim">Loading...</p>
        {:else if failed}
          <p class="dim">Couldn't load this post. Try "Open on Steam" below.</p>
        {/if}
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
  .dim { color: var(--text-dim); }
  .date { font-size: var(--fs-sm); color: var(--text-dim); }
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
