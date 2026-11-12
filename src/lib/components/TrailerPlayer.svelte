<!-- Plays one Steam trailer. Steam sends trailers as a "stream" (HLS: many small pieces in
     several qualities), which the page engine can't play by itself, so the hls.js library does
     it. That library is only downloaded the first time someone opens a trailer, so it costs
     nothing while videos are turned off. The quality follows the player's size. -->
<script lang="ts">
  import { onMount } from "svelte";

  let { src, poster, autoplay = false }: { src: string; poster: string; autoplay?: boolean } = $props();

  let video: HTMLVideoElement;
  let failed = $state(false);

  onMount(() => {
    let destroy = () => {};
    let stopped = false;
    const start = () => {
      if (autoplay) video.play().catch(() => {}); // you clicked this trailer: start it
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // The page engine can play it directly
      video.src = src;
      start();
    } else {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (stopped) return;
          if (!Hls.isSupported()) {
            failed = true;
            return;
          }
          const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20 });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) failed = true;
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          start();
          destroy = () => hls.destroy();
        })
        .catch(() => (failed = true));
    }
    return () => {
      stopped = true;
      video.pause();
      destroy();
    };
  });
</script>

<div class="player">
  <!-- svelte-ignore a11y_media_has_caption (Steam trailers come without captions) -->
  <video bind:this={video} {poster} controls playsinline preload="none"></video>
  {#if failed}
    <p class="err">This trailer can't be played here.</p>
  {/if}
</div>

<style>
  .player { position: relative; }
  video {
    width: 100%; aspect-ratio: 16 / 9; display: block;
    border-radius: var(--radius); background: #000; /* black bars around a video, in both themes */
  }
  .err {
    position: absolute; left: 0; right: 0; bottom: 14px; margin: 0; text-align: center;
    font-size: var(--fs-sm); color: #fff; text-shadow: 0 1px 3px #000;
  }
</style>
