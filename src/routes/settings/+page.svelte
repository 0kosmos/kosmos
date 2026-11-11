<script lang="ts">
  import { settings, toggleTab, moveTab, setPerformanceMode, setTheme } from "$lib/settings.svelte";
  import { TABS } from "$lib/tabs";

  const rows = $derived(settings.order.map((id) => TABS.find((t) => t.id === id)!));
</script>

<h1>Settings</h1>

<section>
  <h2>Appearance</h2>
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
</section>

<section>
  <h2>Tabs</h2>
  <p class="dim">Turn tabs on or off and change their order. Library is always on.</p>

  <ul>
    {#each rows as tab, i (tab.id)}
      <li>
        <span class:off={!settings.enabled[tab.id]}>{tab.label}</span>

        <div class="controls">
          <button onclick={() => moveTab(tab.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
          <button onclick={() => moveTab(tab.id, 1)} disabled={i === rows.length - 1} aria-label="Move down">↓</button>

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
      </li>
    {/each}
  </ul>
</section>

<section>
  <h2>Performance</h2>
  <div class="row">
    <div>
      <strong>Performance mode</strong>
      <p class="dim">Turns off animations and effects. Recommended for older PCs.</p>
    </div>
    <button
      class="switch"
      role="switch"
      aria-checked={settings.performanceMode}
      aria-label="Performance mode"
      onclick={() => setPerformanceMode(!settings.performanceMode)}
    >
      <span class="knob"></span>
    </button>
  </div>
</section>

<style>
  h1 { margin: 0 0 24px; font-size: 1.6rem; font-weight: 700; }
  h2 {
    margin: 0 0 10px; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  section { max-width: 600px; margin-bottom: 32px; }
  .dim { color: var(--text-dim); margin: 0 0 12px; font-size: var(--fs-sm); }
  .row .dim { margin: 2px 0 0; }
  strong { font-weight: 600; font-size: var(--fs-md); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li, .row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 16px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color 0.15s;
  }
  li:hover, .row:hover { border-color: color-mix(in srgb, var(--text-dim) 40%, var(--border)); }
  li { padding: 8px 10px 8px 16px; font-size: var(--fs-md); }
  .off { color: var(--text-dim); text-decoration: line-through; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .controls button:not(.switch) {
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: var(--surface-2); border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s;
  }
  .controls button:not(.switch):hover:not(:disabled) { border-color: var(--text-dim); }
  .switch { flex-shrink: 0; margin-left: 6px; }
  button:disabled { opacity: 0.35; cursor: default; }

  .switch {
    width: 40px; height: 22px; border-radius: 11px; padding: 2px;
    background: var(--border); border: none; position: relative;
    transition: background 0.15s;
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .knob {
    display: block; width: 18px; height: 18px; border-radius: 50%;
    background: var(--knob); transition: transform 0.15s;
  }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); }

  .segmented {
    display: flex; gap: 2px; padding: 2px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .segmented button {
    padding: 5px 14px; border: none; border-radius: 4px; font-size: var(--fs-md);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .segmented button:hover { color: var(--text); }
  .segmented button[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }
</style>