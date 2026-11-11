<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { settings, toggleTab, reorderVisible } from "$lib/settings.svelte";
  import { TABS, SETTINGS_TAB, type Tab, type TabId } from "$lib/tabs";
  import Icon from "./Icon.svelte";
  import { flip } from "svelte/animate";

  const EYE_OFF =
    "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5 M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3";

  const visibleTabs = $derived(
    settings.order
      .map((id) => TABS.find((t) => t.id === id))
      .filter((t): t is Tab => !!t && settings.enabled[t.id])
  );
  const hiddenCount = $derived(TABS.filter((t) => !settings.enabled[t.id]).length);

  // ---------- Drag to reorder ----------
  // Uses mouse (pointer) events, because Tauri on Windows intercepts the browser's own drag-and-drop.
  // The tab you hold follows the mouse exactly; the others slide out of the way.
  // While dragging we only rearrange a temporary list; it's saved when you let go.
  let nav: HTMLElement | undefined = $state();
  let dragId = $state<TabId | null>(null);
  let dragOrder = $state<TabId[] | null>(null); // temporary order while dragging
  let dragOffset = $state(0); // how far the held tab is moved from its slot (px)
  let settling = $state<TabId | null>(null); // tab gliding into place after you let go
  let startY = 0;
  let grabY = 0; // where inside the tab you grabbed it
  let slots: number[] = []; // top position of each tab's place, measured when the drag starts
  let justDragged = false;

  const reduced = () => document.documentElement.dataset.motion === "reduced";

  const shownTabs = $derived(
    dragOrder ? dragOrder.map((id) => TABS.find((t) => t.id === id)!) : visibleTabs
  );

  function onPointerDown(e: PointerEvent, id: TabId) {
    if (e.button !== 0) return;
    dragId = id;
    dragOrder = null;
    dragOffset = 0;
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragId || !nav) return;
    if (!dragOrder) {
      if (Math.abs(e.clientY - startY) < 5) return; // small wiggle = still a click
      // Start dragging: remember where each tab's place is
      const items = [...nav.querySelectorAll<HTMLElement>("[data-tab]")];
      slots = items.map((el) => el.getBoundingClientRect().top);
      const index = visibleTabs.findIndex((t) => t.id === dragId);
      grabY = startY - slots[index];
      dragOrder = visibleTabs.map((t) => t.id);
    }

    // Where the held tab should be: under the mouse, at the same spot you grabbed it,
    // but never above the first place or below the last one.
    const top = Math.min(Math.max(e.clientY - grabY, slots[0]), slots[slots.length - 1]);

    // Its new place is whichever slot it is closest to (so tabs swap at the halfway point)
    let target = 0;
    for (let i = 1; i < slots.length; i++) {
      if (Math.abs(slots[i] - top) < Math.abs(slots[target] - top)) target = i;
    }
    const from = dragOrder.indexOf(dragId);
    if (target !== from) {
      const next = [...dragOrder];
      next.splice(from, 1);
      next.splice(target, 0, dragId);
      dragOrder = next;
    }
    dragOffset = top - slots[target];
  }

  function onPointerUp() {
    if (dragOrder && dragId) {
      reorderVisible(dragOrder);
      justDragged = true; // don't open the tab you just dropped
      // Let the held tab glide the last few pixels into its place
      settling = dragId;
      setTimeout(() => (settling = null), 200);
    }
    dragId = null;
    dragOrder = null;
    dragOffset = 0;
  }

  function onPointerCancel() {
    dragId = null;
    dragOrder = null;
    dragOffset = 0;
  }

  function onClick(e: MouseEvent) {
    if (justDragged) {
      e.preventDefault();
      justDragged = false;
    }
  }

  function hide(tab: Tab) {
    toggleTab(tab.id);
    if (page.url.pathname === tab.path) goto("/"); // you were on it: go back to Library
  }
</script>

<aside class="sidebar">
  <div class="brand"><span class="dot"></span> Kosmos</div>

  <nav bind:this={nav} class:dragging={!!dragOrder}>
    {#each shownTabs as tab (tab.id)}
      <div
        class="item"
        data-tab={tab.id}
        class:lifted={dragOrder && dragId === tab.id}
        class:settling={settling === tab.id}
        style:transform={dragOrder && dragId === tab.id ? `translateY(${dragOffset}px)` : null}
        animate:flip={{ duration: dragId === tab.id || reduced() ? 0 : 180 }}
      >
        <a
          href={tab.path}
          class:active={page.url.pathname === tab.path}
          draggable="false"
          title="Drag to reorder"
          onpointerdown={(e) => onPointerDown(e, tab.id)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerCancel}
          onclick={onClick}
        >
          <Icon d={tab.icon} />
          {tab.label}
        </a>
        {#if tab.id !== "library"}
          <button class="hide" onclick={() => hide(tab)} aria-label={"Hide " + tab.label} title="Hide this tab">
            <Icon d={EYE_OFF} size={15} />
          </button>
        {/if}
      </div>
    {/each}

    {#if hiddenCount}
      <a class="hidden-link" href={SETTINGS_TAB.path}>
        {hiddenCount} hidden {hiddenCount === 1 ? "tab" : "tabs"}
      </a>
    {/if}
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
  /* ---------- Drag and hide ---------- */
  nav { user-select: none; }
  nav.dragging, nav.dragging a { cursor: grabbing; }
  .item { position: relative; }
  .item.lifted { z-index: 2; }
  .item.lifted a {
    background: var(--surface-2);
    color: var(--text);
    box-shadow: 0 0 0 1px var(--accent), 0 6px 16px var(--scrim);
  }
  .item.settling { transition: transform 0.18s ease-out; }
  .hide {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    width: 26px; height: 26px; display: grid; place-items: center;
    background: transparent; border: none; border-radius: var(--radius-sm);
    color: var(--text-dim); opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s;
  }
  .item:hover .hide, .hide:focus-visible { opacity: 1; }
  nav.dragging .hide { opacity: 0; }
  .hide:hover { color: var(--text); background: var(--hover); }
  .hidden-link {
    margin-top: 6px; padding: 4px 12px; font-size: var(--fs-sm); font-weight: 400;
    color: var(--text-dim);
  }
  .hidden-link:hover { background: none; text-decoration: underline; }

  .bottom {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
</style>