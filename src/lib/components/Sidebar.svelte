<script lang="ts">
  import { page } from "$app/state";
  import { settings } from "$lib/settings.svelte";
  import { TABS, SETTINGS_TAB, type Tab } from "$lib/tabs";
  import Icon from "./Icon.svelte";

  const visibleTabs = $derived(
    settings.order
      .map((id) => TABS.find((t) => t.id === id))
      .filter((t): t is Tab => !!t && settings.enabled[t.id])
  );
</script>

<aside class="sidebar">
  <div class="brand"><span class="dot"></span> Kosmos</div>

  <nav>
    {#each visibleTabs as tab (tab.id)}
      <a href={tab.path} class:active={page.url.pathname === tab.path}>
        <Icon d={tab.icon} />
        {tab.label}
      </a>
    {/each}
  </nav>

  <div class="bottom">
    <a href={SETTINGS_TAB.path} class:active={page.url.pathname === SETTINGS_TAB.path}>
      <Icon d={SETTINGS_TAB.icon} />
      {SETTINGS_TAB.label}
    </a>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px 12px 12px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    height: 100%;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 12px 18px;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.02em;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  a {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: var(--radius);
    color: var(--text-dim);
    text-decoration: none;
    font-size: var(--fs-md);
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
  }
  a:hover {
    background: var(--hover);
    color: var(--text);
  }
  a.active {
    background: var(--surface-2);
    color: var(--text);
  }
  /* Small accent bar on the left of the active tab */
  a.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .bottom {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
</style>