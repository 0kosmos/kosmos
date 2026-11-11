<script lang="ts">
  import { untrack } from "svelte";
  import { cachedCover, findCover } from "$lib/covers";

  // Small wide game image (for lists). Tries Steam's small banner, then the wide header,
  // then the real image address our Worker knows (newer games), then a plain placeholder.
  let { appid, name = "" }: { appid: number; name?: string } = $props();

  const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";
  let found = $state<string | null>(untrack(() => cachedCover(appid) ?? null));
  const sources = $derived(
    found ? [found] : [`${CDN}/${appid}/capsule_184x69.jpg`, `${CDN}/${appid}/header.jpg`]
  );
  let attempt = $state(0);
  const current = $derived(sources[attempt]);

  let asked = false;
  $effect(() => {
    if (current || found || asked) return;
    if (cachedCover(appid) === null) return; // we already know there's no image
    asked = true;
    findCover(appid).then((url) => {
      if (url) {
        found = url;
        attempt = 0;
      }
    });
  });
</script>

<div class="capsule">
  {#if current}
    <img src={current} alt="" loading="lazy" decoding="async" onerror={() => attempt++} />
  {:else}
    <span>{name.charAt(0)}</span>
  {/if}
</div>

<style>
  .capsule {
    width: 92px; height: 35px; flex-shrink: 0; overflow: hidden;
    border-radius: 4px; background: var(--surface-2);
    display: grid; place-items: center;
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  span { font-weight: 700; color: var(--text-dim); }
</style>
