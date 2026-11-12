<!-- The wishlist heart.
     "overlay": a round button on a picture (shows while hovering the card; always when added).
     "button": a normal button with text, e.g. on a game page. -->
<script lang="ts">
  let {
    on,
    onclick,
    name = "",
    variant = "overlay",
  }: { on: boolean; onclick: () => void; name?: string; variant?: "overlay" | "button" } = $props();
</script>

<button
  class={variant}
  class:on
  {onclick}
  aria-pressed={on}
  aria-label={(on ? "Remove from wishlist: " : "Add to wishlist: ") + name}
  title={on ? "Remove from your wishlist" : "Add to your wishlist"}
>
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      d="M12 20s-7-4.4-9-9A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 5c-2 4.6-9 9-9 9z"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
    />
  </svg>
  {#if variant === "button"}{on ? "On your wishlist" : "Add to wishlist"}{/if}
</button>

<style>
  .overlay {
    width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--scrim);
    color: #fff; /* sits on the picture, same in both themes */
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, transform 0.15s;
  }
  /* Shown while you hover the card (the card's wrapper has the "wish-host" class) */
  :global(.wish-host:hover) .overlay, .overlay:focus-visible { opacity: 0.85; }
  .overlay:hover { opacity: 1; transform: scale(1.08); }
  .overlay.on { opacity: 1; color: var(--heart); }

  .button {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 14px; border-radius: var(--radius); font-size: var(--fs-md);
    background: transparent; border: 1px solid var(--border); color: var(--text);
    transition: border-color 0.15s, color 0.15s;
  }
  .button:hover { border-color: var(--text-dim); }
  .button.on { color: var(--heart); border-color: color-mix(in srgb, var(--heart) 45%, var(--border)); }
</style>
