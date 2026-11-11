<script lang="ts">
  import { settings, toggleTab, moveTab, setPerformanceMode } from "$lib/settings.svelte";
  import { TABS } from "$lib/tabs";

  const rows = $derived(settings.order.map((id) => TABS.find((t) => t.id === id)!));
</script>

<h1>Settings</h1>

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
  h1 { margin: 0 0 24px; font-size: 1.6rem; }
  h2 { margin: 0 0 4px; font-size: 1.05rem; }
  section { max-width: 560px; margin-bottom: 32px; }
  .dim { color: var(--text-dim); margin: 0 0 12px; font-size: 0.9rem; }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li, .row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
  }
  .off { color: var(--text-dim); text-decoration: line-through; }
  .controls { display: flex; align-items: center; gap: 8px; }
  .controls button:not(.switch) {
    width: 30px; height: 30px; border-radius: 8px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  button:disabled { opacity: 0.35; cursor: default; }

  .switch {
    width: 40px; height: 22px; border-radius: 11px; padding: 2px;
    background: var(--border); border: none; position: relative;
    transition: background 0.15s;
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .knob {
    display: block; width: 18px; height: 18px; border-radius: 50%;
    background: #fff; transition: transform 0.15s;
  }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); }
</style>