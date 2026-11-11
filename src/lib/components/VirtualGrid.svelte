<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  let {
    items,
    itemWidth,
    itemHeight,
    gap = 14,
    key,
    children,
  }: {
    items: T[];
    itemWidth: number;
    itemHeight: number;
    gap?: number;
    key: (item: T) => string | number;
    children: Snippet<[T]>;
  } = $props();

  let width = $state(0);
  let height = $state(0);
  let scrollTop = $state(0);

  const cols = $derived(Math.max(1, Math.floor((width + gap) / (itemWidth + gap))));
  const rowH = $derived(itemHeight + gap);
  const totalRows = $derived(Math.ceil(items.length / cols));
  const firstRow = $derived(Math.max(0, Math.floor(scrollTop / rowH) - 1));
  const lastRow = $derived(Math.min(totalRows, Math.ceil((scrollTop + height) / rowH) + 1));
  const visible = $derived(items.slice(firstRow * cols, lastRow * cols));
</script>

<div
  class="scroller"
  bind:clientWidth={width}
  bind:clientHeight={height}
  onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
>
  <div class="spacer" style="height: {totalRows * rowH}px">
    <div
      class="window"
      style="transform: translateY({firstRow * rowH}px);
             grid-template-columns: repeat({cols}, {itemWidth}px);
             grid-auto-rows: {itemHeight}px;
             gap: {gap}px;"
    >
      {#each visible as item (key(item))}
        {@render children(item)}
      {/each}
    </div>
  </div>
</div>

<style>
  .scroller {
    height: 100%;
    overflow-y: auto;
    /* A little room at the top so tiles lifting on hover aren't cut off */
    padding-top: 6px;
  }
  .spacer {
    position: relative;
  }
  .window {
    display: grid;
  }
</style>