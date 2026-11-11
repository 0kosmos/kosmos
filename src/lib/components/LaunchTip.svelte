<script lang="ts">
  import { launchTip, launchInfo, type LaunchInfo } from "$lib/launchTime.svelte";

  // Small tooltip above a Play button with the (estimated or measured) launch time.
  // One for the whole app; it's only drawn while you hover a Play button.
  let info = $state<LaunchInfo | null>(null);
  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ left: 0, top: 0 });

  $effect(() => {
    const id = launchTip.appid;
    if (!launchTip.rect || !id) return;
    info = null;
    let cancelled = false;
    launchInfo(id).then((r) => !cancelled && (info = r));
    return () => {
      cancelled = true;
    };
  });

  // Above the button, centered; below it if there's no room; never off-screen
  $effect(() => {
    const r = launchTip.rect;
    if (!r || !el) return;
    info; // re-measure when the text changes
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    pos = { left, top };
  });
</script>

{#if launchTip.rect}
  <div class="tip" role="tooltip" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px">
    {#if !info}
      <span class="dim">Checking launch time...</span>
    {:else if info.kind === "measured"}
      <strong>Launch time ~{info.seconds} s</strong>
      <span class="dim">Your average of {info.count} {info.count === 1 ? "launch" : "launches"} through Kosmos</span>
    {:else if info.kind === "estimate"}
      <strong>Launch time ~{info.low}–{info.high} s <span class="tag">Estimated</span></strong>
      <span class="dim">{info.details}</span>
      <span class="small">
        Until the game window appears. Can't account for shader compiling, launchers, anti-cheat or
        login queues. Gets replaced by your real time after you launch it from Kosmos.
      </span>
    {:else}
      <span class="dim">No launch time yet. Launch it once from Kosmos to measure it.</span>
    {/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed; z-index: 60; pointer-events: none;
    max-width: 280px; padding: 9px 12px;
    display: flex; flex-direction: column; gap: 3px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 8px 24px var(--scrim);
    font-size: var(--fs-sm); line-height: 1.4;
  }
  strong { font-size: var(--fs-md); }
  .dim { color: var(--text-dim); }
  .small { color: var(--text-dim); font-size: 0.75rem; margin-top: 3px; }
  .tag {
    margin-left: 4px; padding: 1px 6px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim);
    vertical-align: middle;
  }
</style>
