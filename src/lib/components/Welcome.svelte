<!-- First start: a short setup in the middle of the window, to pick the main options.
     Every switch changes the real setting right away (so you see the theme change, for example).
     "Start using Kosmos" or ✕ closes it and keeps what's chosen; everything can be changed
     later in Settings, where "Show welcome setup again" opens it again. -->
<script lang="ts">
  import {
    settings, setTheme, setReduceMotion, setDiscordActivity, setStoreEpic, setLiveStats, setShowVideos,
  } from "$lib/settings.svelte";
  import { closeWelcome } from "$lib/welcome.svelte";
  import Logo from "./Logo.svelte";

  type Row = { label: string; text: string; on: () => boolean; set: (on: boolean) => void };
  const ROWS: Row[] = [
    {
      label: "Reduce motion",
      text: "Turns off animations and effects. Good for older or slower PCs.",
      on: () => settings.reduceMotion,
      set: setReduceMotion,
    },
    {
      label: "Show activity on Discord",
      text: "Discord shows that you're using Kosmos, like \"Browsing the library\".",
      on: () => settings.discordActivity,
      set: setDiscordActivity,
    },
    {
      label: "Epic Games free games in the Store",
      text: "This week's free games on the Epic Games Store, next to Steam's deals.",
      on: () => settings.storeEpicFree,
      set: setStoreEpic,
    },
    {
      label: "Trailers and videos",
      text: "Game trailers on game pages. They use more internet and memory.",
      on: () => settings.showVideos,
      set: setShowVideos,
    },
    {
      label: "Live game stats",
      text: "The running game's CPU, GPU and memory use in the sidebar.",
      on: () => settings.liveStats,
      set: setLiveStats,
    },
  ];

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeWelcome();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <button class="x" onclick={closeWelcome} aria-label="Close">✕</button>

    <div class="head">
      <Logo size={40} />
      <div>
        <h2 id="welcome-title">Welcome to Kosmos</h2>
        <p class="dim">Pick how you want it. You can change all of this later in Settings.</p>
      </div>
    </div>

    <div class="row">
      <div>
        <strong>Theme</strong>
        <p class="dim">Black is the default. White is easier to read in bright rooms.</p>
      </div>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        <button role="radio" aria-checked={settings.theme === "dark"} onclick={() => setTheme("dark")}>Black</button>
        <button role="radio" aria-checked={settings.theme === "light"} onclick={() => setTheme("light")}>White</button>
      </div>
    </div>

    {#each ROWS as r (r.label)}
      <div class="row">
        <div>
          <strong>{r.label}</strong>
          <p class="dim">{r.text}</p>
        </div>
        <button class="switch" role="switch" aria-checked={r.on()} aria-label={r.label} onclick={() => r.set(!r.on())}>
          <span class="knob"></span>
        </button>
      </div>
    {/each}

    <button class="primary" onclick={closeWelcome}>Start using Kosmos</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 50;
    display: grid; place-items: center; padding: 16px;
    background: var(--scrim);
  }
  .dialog {
    position: relative;
    width: min(560px, 100%); max-height: calc(100vh - 32px); overflow-y: auto;
    padding: 24px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 16px 48px var(--scrim);
  }
  .x {
    position: absolute; top: 12px; right: 12px;
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; padding-right: 30px; }
  h2 { margin: 0 0 2px; font-size: 1.3rem; font-weight: 700; }
  .dim { color: var(--text-dim); margin: 0; font-size: var(--fs-sm); }

  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 0; border-top: 1px solid var(--border);
  }
  .row strong { font-weight: 600; font-size: var(--fs-md); }

  /* Same switches and Black / White picker as in Settings */
  .switch {
    flex-shrink: 0;
    width: 40px; height: 22px; border-radius: 11px; padding: 2px;
    background: var(--border); border: none;
    transition: background 0.15s;
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .knob {
    display: block; width: 18px; height: 18px; border-radius: 50%;
    background: var(--knob); transition: transform 0.15s;
  }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); background: var(--on-accent); }
  .segmented {
    display: flex; gap: 2px; padding: 2px; flex-shrink: 0;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .segmented button {
    padding: 5px 14px; border: none; border-radius: 4px; font-size: var(--fs-md);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .segmented button:hover { color: var(--text); }
  .segmented button[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }

  .primary {
    width: 100%; margin-top: 12px; padding: 10px 16px;
    background: var(--accent); color: var(--on-accent);
    border: none; border-radius: var(--radius); font-weight: 600; font-size: var(--fs-md);
    transition: filter 0.15s;
  }
  .primary:hover { filter: brightness(1.1); }
</style>
