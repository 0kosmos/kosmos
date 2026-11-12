<!-- Pop-up list of a wishlist (Store games or Market items): picture, name, the price when you
     added it, open it, or remove it. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  export type WishRow = {
    key: string;
    image: string;
    name: string;
    color?: string; // name color (Market items' rarity)
    sub: string;
    price: string;
    tall?: boolean; // square-ish item pictures instead of wide game pictures
  };

  let {
    title,
    rows,
    empty,
    onopen,
    onremove,
    onclose,
    footer,
  }: {
    title: string;
    rows: WishRow[];
    empty: string;
    onopen: (key: string) => void;
    onremove: (key: string) => void;
    onclose: () => void;
    footer?: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="box" role="dialog" aria-modal="true" aria-label={title}>
    <div class="top">
      <h2>{title} <span class="count">{rows.length}</span></h2>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </div>

    {#if rows.length === 0}
      <p class="dim">{empty}</p>
    {:else}
      <div class="list">
        {#each rows as r (r.key)}
          <div class="row">
            <button class="open" onclick={() => onopen(r.key)} title="Open">
              <span class="pic" class:tall={r.tall}>{#if r.image}<img src={r.image} alt="" loading="lazy" />{/if}</span>
              <span class="text">
                <span class="name" style:color={r.color ? "#" + r.color : null}>{r.name}</span>
                <span class="sub">{r.sub}</span>
              </span>
              <span class="price">{r.price}</span>
            </button>
            <button class="remove" onclick={() => onremove(r.key)} aria-label={"Remove " + r.name} title="Remove from wishlist">✕</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if footer}<div class="footer">{@render footer()}</div>{/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
    background: var(--scrim);
  }
  .box {
    width: min(560px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column;
    padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 16px 48px var(--scrim);
  }
  .top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  h2 { flex: 1; margin: 0; font-size: 1.2rem; font-weight: 700; }
  .count { font-size: var(--fs-md); font-weight: 400; color: var(--text-dim); margin-left: 6px; }
  .x {
    width: 30px; height: 30px; border-radius: var(--radius-sm); flex-shrink: 0;
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .dim { color: var(--text-dim); margin: 6px 0 12px; }
  .list { overflow-y: auto; min-height: 0; margin: 0 -6px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 0 6px; }
  .row + .row { border-top: 1px solid var(--border); }
  .open {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px 4px; text-align: left;
    background: none; border: none; color: inherit; font: inherit; border-radius: var(--radius-sm);
  }
  .open:hover { background: var(--hover); }
  .pic {
    flex-shrink: 0; width: 96px; height: 45px; border-radius: 4px; overflow: hidden; background: var(--surface-2);
    display: grid; place-items: center;
  }
  .pic.tall { width: 56px; height: 45px; }
  .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pic.tall img { object-fit: contain; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: var(--fs-sm); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .price { flex-shrink: 0; font-weight: 700; font-size: var(--fs-sm); }
  .remove {
    flex-shrink: 0; width: 28px; height: 28px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid transparent; color: var(--text-dim);
  }
  .remove:hover { color: var(--bad); border-color: var(--border); }
  .footer { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: var(--fs-sm); }
</style>
