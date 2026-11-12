<!-- A game or app you added yourself. Same size and look as the Steam tiles. -->
<script lang="ts">
  import { type CustomGame, launchGame, coverUrl, fmtBytes } from "$lib/customGames.svelte";
  import TileButtons from "./TileButtons.svelte";

  let { game, onedit }: { game: CustomGame; onedit: (g: CustomGame) => void } = $props();

  let imgFailed = $state(false);
  const src = $derived(imgFailed ? "" : coverUrl(game.cover));
  const hue = $derived([...game.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11));
  const size = $derived(game.folderBytes || game.fileBytes);

  // If it can't start (moved or deleted), say so on the tile for a few seconds
  let error = $state("");
  function play() {
    launchGame(game).catch((e) => {
      error = String(e);
      setTimeout(() => (error = ""), 5000);
    });
  }
</script>

<div class="tile">
  <TileButtons gameKey={"c" + game.id} name={game.name} onedit={() => onedit(game)} />
  <button class="open" onclick={() => onedit(game)} title="Change name or picture">
    <div class="cover" style="--hue: {hue}">
      {#if src && game.coverIsIcon}
        <!-- The app's own icon: centered, not stretched -->
        <img class="icon" {src} alt="" loading="lazy" decoding="async" onerror={() => (imgFailed = true)} />
      {:else if src}
        <img {src} alt="" loading="lazy" decoding="async" onerror={() => (imgFailed = true)} />
      {:else}
        <span class="name">{game.name}</span>
      {/if}
      <span class="badge">My game</span>
    </div>
    <h3 title={game.name}>{game.name}</h3>
    <p class:err={!!error} title={error || game.path}>{error || (size ? fmtBytes(size) : "Added by you")}</p>
  </button>
  <button class="quick" onclick={play} aria-label={"Play " + game.name}>▶ Play</button>
</div>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 160px;
    height: 318px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .tile:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateY(var(--lift)); /* 0 when reduce motion is on */
  }
  .open {
    display: block; width: 100%; padding: 0; text-align: left;
    background: none; border: none; color: inherit; font: inherit;
  }
  .cover {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, hsl(var(--hue) 55% 38%), hsl(calc(var(--hue) + 40) 50% 18%));
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  img.icon {
    width: 96px; height: 96px; object-fit: contain;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35)); /* lifts it off the colored background */
  }
  .name {
    padding: 12px; font-size: 1.05rem; font-weight: 700; line-height: 1.25; text-align: center;
    color: #fff; /* sits on the generated colored cover, same in both themes */
    overflow-wrap: anywhere;
  }
  .badge {
    position: absolute; top: 6px; left: 6px;
    padding: 1px 7px; border-radius: 999px;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em;
    background: var(--scrim); color: #fff; /* on top of the cover, same in both themes */
  }
  h3 {
    margin: 8px 2px 2px; font-size: var(--fs-md); font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  p { margin: 0 2px 2px; font-size: var(--fs-sm); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  p.err { color: var(--bad); }
  .quick {
    margin-top: auto; height: 28px; width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--radius-sm); font-size: var(--fs-sm); font-weight: 700;
    background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent);
    transition: filter 0.15s;
  }
  .quick:hover { filter: brightness(1.1); }
</style>
