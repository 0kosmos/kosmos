<script lang="ts">
  import {
    settings,
    toggleTab,
    moveTab,
    setReduceMotion,
    setTheme,
  } from "$lib/settings.svelte";
  import { TABS } from "$lib/tabs";

  const rows = $derived(settings.order.map((id) => TABS.find((t) => t.id === id)!));
</script>

<h1>Settings</h1>

<!-- ---------- Appearance ---------- -->
<section>
  <h2>Appearance</h2>
  <div class="group">
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

    <div class="row">
      <div>
        <strong>Reduce motion</strong>
        <p class="dim">Turns off animations and effects. Recommended for older PCs.</p>
      </div>
      <button
        class="switch"
        role="switch"
        aria-checked={settings.reduceMotion}
        aria-label="Reduce motion"
        onclick={() => setReduceMotion(!settings.reduceMotion)}
      >
        <span class="knob"></span>
      </button>
    </div>
  </div>
</section>

<!-- ---------- Sidebar tabs ---------- -->
<section>
  <h2>Sidebar</h2>
  <p class="dim intro">Turn tabs on or off and change their order. Library is always on.</p>
  <div class="group">
    {#each rows as tab, i (tab.id)}
      <div class="row tab">
        <span class:off={!settings.enabled[tab.id]}>{tab.label}</span>

        <div class="controls">
          <button class="arrow" onclick={() => moveTab(tab.id, -1)} disabled={i === 0} aria-label={"Move " + tab.label + " up"}>↑</button>
          <button class="arrow" onclick={() => moveTab(tab.id, 1)} disabled={i === rows.length - 1} aria-label={"Move " + tab.label + " down"}>↓</button>
          <button
            class="switch"
            role="switch"
            aria-checked={settings.enabled[tab.id]}
            aria-label={"Show " + tab.label}
            disabled={tab.id === "library"}
            onclick={() => toggleTab(tab.id)}
          >
            <span class="knob"></span>
          </button>
        </div>
      </div>
    {/each}
  </div>
</section>

<!-- ---------- Window behavior ---------- -->
<section>
  <h2>Window behavior</h2>
  <div class="group">
    <div class="row">
      <div>
        <strong>When I close the window</strong>
        <p class="dim">Choosing between closing the app and minimizing to the system tray comes in a later update.</p>
      </div>
      <span class="badge">Close app</span>
    </div>
  </div>
</section>

<style>
  h1 { margin: 0 0 24px; font-size: 1.6rem; font-weight: 700; }
  h2 {
    margin: 0 0 10px; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  section { max-width: 600px; margin-bottom: 28px; }
  .dim { color: var(--text-dim); margin: 2px 0 0; font-size: var(--fs-sm); }
  .intro { margin: -4px 0 10px; }
  strong { font-weight: 600; font-size: var(--fs-md); }

  /* One card per section, rows separated by thin lines */
  .group {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 16px;
    transition: background 0.15s;
  }
  .row + .row { border-top: 1px solid var(--border); }
  .row:hover { background: var(--hover); }
  .row.tab { padding: 8px 10px 8px 16px; font-size: var(--fs-md); }

  .off { color: var(--text-dim); text-decoration: line-through; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .arrow {
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: var(--surface-2); border: 1px solid var(--border);
    transition: border-color 0.15s;
  }
  .arrow:hover:not(:disabled) { border-color: var(--text-dim); }
  button:disabled { opacity: 0.35; cursor: default; }

  .switch {
    flex-shrink: 0; margin-left: 6px;
    width: 40px; height: 22px; border-radius: 11px; padding: 2px;
    background: var(--border); border: none;
    transition: background 0.15s;
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .knob {
    display: block; width: 18px; height: 18px; border-radius: 50%;
    background: var(--knob); transition: transform 0.15s;
  }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); }

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

  .badge {
    flex-shrink: 0; padding: 4px 10px; border-radius: var(--radius-sm);
    background: var(--surface-2); border: 1px solid var(--border);
    color: var(--text-dim); font-size: var(--fs-sm);
  }
</style>
