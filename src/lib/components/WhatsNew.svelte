<!-- "What's new in Kosmos x.y.z": shown once after an update (see whatsNew.svelte.ts). -->
<script lang="ts">
  import { whatsNew, closeWhatsNew } from "$lib/whatsNew.svelte";
  import Logo from "./Logo.svelte";

  const r = $derived(whatsNew.release);
  const SECTIONS = [
    { key: "new", title: "New" },
    { key: "improved", title: "Improved" },
    { key: "fixed", title: "Fixed" },
  ] as const;

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeWhatsNew();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if r}
  <div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && closeWhatsNew()}>
    <div class="box" role="dialog" aria-modal="true" aria-labelledby="wn-title">
      <button class="x" onclick={closeWhatsNew} aria-label="Close">✕</button>
      <div class="head">
        <Logo size={36} />
        <div>
          <h2 id="wn-title">What's new in Kosmos {r.version}</h2>
          <p class="dim">Thanks for using Kosmos! Here's what changed.</p>
        </div>
      </div>

      <div class="body">
        {#each SECTIONS as s (s.key)}
          {#if r[s.key].length}
            <h3 class={s.key}>{s.title}</h3>
            <ul>
              {#each r[s.key] as line}<li>{line}</li>{/each}
            </ul>
          {/if}
        {/each}
      </div>

      <button class="primary" onclick={closeWhatsNew}>OK</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px;
    background: var(--scrim);
  }
  .box {
    position: relative; width: min(600px, 100%); max-height: calc(100vh - 32px);
    display: flex; flex-direction: column; padding: 24px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 16px 48px var(--scrim);
  }
  .x {
    position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; padding-right: 30px; }
  h2 { margin: 0 0 2px; font-size: 1.3rem; font-weight: 700; }
  .dim { margin: 0; color: var(--text-dim); font-size: var(--fs-sm); }
  .body { overflow-y: auto; min-height: 0; }
  h3 {
    margin: 16px 0 6px; font-size: var(--fs-sm); font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  h3.new { color: var(--good); }
  h3.improved { color: var(--accent); }
  h3.fixed { color: var(--warn); }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 5px 0; line-height: 1.45; font-size: var(--fs-md); }
  .primary {
    margin-top: 18px; padding: 10px 16px; border: none; border-radius: var(--radius);
    background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: var(--fs-md);
  }
  .primary:hover { filter: brightness(1.1); }
</style>
