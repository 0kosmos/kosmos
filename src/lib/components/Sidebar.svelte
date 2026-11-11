<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { settings, toggleTab, reorderVisible } from "$lib/settings.svelte";
  import { TABS, SETTINGS_TAB, type Tab, type TabId } from "$lib/tabs";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import { flip } from "svelte/animate";
  import { playing } from "$lib/playing.svelte";
  import { library } from "$lib/library.svelte";
  import { pc, togglePcPanel, loadPcInfo } from "$lib/pcInfo.svelte";
  import { gameStats, watchGameStats } from "$lib/gameStats.svelte";
  import { account } from "$lib/account.svelte";
  import { startSignIn, auth } from "$lib/auth.svelte";
  import { me, refreshProfile, statusText, statusKind } from "$lib/profile.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { downloadsBadge, refreshDownloadsBadge } from "$lib/downloadsBadge.svelte";
  import { epic, loadEpic } from "$lib/epic.svelte";

  // ---------- Dot on "Downloads": updates waiting or downloads going (Steam + Epic) ----------
  // Checked at startup and when you come back to the window (at most once a minute)
  onMount(() => {
    const check = () => {
      refreshDownloadsBadge();
      loadEpic();
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  });
  const pendingDownloads = $derived(downloadsBadge.steam + epic.games.filter((g) => g.installing).length);

  // ---------- Your profile box (bottom) ----------
  // Loads when you sign in / out; refreshed when you come back to the window (max once a minute).
  $effect(() => {
    refreshProfile(account.steamid, true);
  });
  onMount(() => {
    const onFocus = () => refreshProfile(account.steamid);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });
  const myProfile = $derived(account.steamid && me.p?.steamid === account.steamid ? me.p : null);
  function openMyProfile() {
    openUrl(`steam://openurl/https://steamcommunity.com/profiles/${account.steamid}/`).catch(() => {});
  }
  const USER = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8";

  // Live stats: only while the option is on and a game is running (paused when Kosmos is hidden)
  $effect(() => {
    watchGameStats(settings.liveStats ? playing.appid : 0);
  });

  const fmtMb = (mb: number) => (mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB");
  import { setSidebarWidth, clampSidebar, SIDEBAR_MIN, SIDEBAR_MAX } from "$lib/settings.svelte";

  // ---------- Resize the sidebar by dragging its right edge ----------
  // While dragging we only change the CSS width (cheap); it's saved when you let go.
  // Double-click the edge to go back to the default width.
  let resizing = $state(false);
  let resizeStartX = 0;
  let resizeStartW = 0;
  let liveW = 0;

  function setLiveWidth(w: number) {
    liveW = clampSidebar(w);
    document.documentElement.style.setProperty("--sidebar-w", liveW + "px");
  }

  function onResizeDown(e: PointerEvent) {
    if (e.button !== 0) return;
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = settings.sidebarWidth;
    liveW = resizeStartW;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: PointerEvent) {
    if (resizing) setLiveWidth(resizeStartW + e.clientX - resizeStartX);
  }

  function onResizeUp() {
    if (!resizing) return;
    resizing = false;
    setSidebarWidth(liveW);
  }

  function onResizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === "ArrowRight") setSidebarWidth(settings.sidebarWidth + step);
    else if (e.key === "ArrowLeft") setSidebarWidth(settings.sidebarWidth - step);
    else return;
    e.preventDefault();
  }

  // If the panel was left open last time, refresh its info once at startup
  $effect(() => {
    if (pc.open) loadPcInfo();
  });

  const CHIP = "M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4";

  // Name of the running game: from your library first, then Steam's registry entry
  const playingName = $derived(
    playing.appid
      ? (library.games.find((g) => g.appid === playing.appid)?.name || playing.name || "a game")
      : ""
  );

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
  <div class="brand"><Logo size={26} /><span>Kosmos</span></div>

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
          {#if tab.id === "downloads" && pendingDownloads}
            <span
              class="badge-dot"
              title={pendingDownloads + (pendingDownloads === 1 ? " update or download" : " updates or downloads")}
              aria-label={pendingDownloads + " pending"}
            ></span>
          {/if}
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

  {#if playing.appid}
    <a class="playing" href={"/game?id=" + playing.appid} title="Open this game's page">
      <span class="live" aria-hidden="true"></span>
      <span class="playing-text">
        <span class="label">Currently playing</span>
        <span class="game">{playingName}</span>
        {#if settings.liveStats}
          {@const s = gameStats.appid === playing.appid ? gameStats.s : null}
          {#if s?.found}
            <span class="stats">
              <span>CPU</span><b>{s.cpu == null ? "…" : Math.round(s.cpu) + "%"}</b>
              {#if s.gpu != null}<span>GPU</span><b>{Math.round(s.gpu)}%</b>{/if}
              <span>RAM</span><b>{fmtMb(s.ramMb)}</b>
              {#if s.vramMb}<span>VRAM</span><b>{fmtMb(s.vramMb)}</b>{/if}
            </span>
          {:else if s}
            <span class="stats-note">Can't see the game's programs (it may use a separate launcher)</span>
          {/if}
        {/if}
      </span>
    </a>
  {/if}

  <!-- Bottom group: My PC and Settings -->
  <div class="footer">
  <!-- My PC: collapsible, info read once from Windows -->
  <div class="pc">
    <button class="pc-head" onclick={togglePcPanel} aria-expanded={pc.open}>
      <Icon d={CHIP} />
      <span>My PC</span>
      <span class="chev" class:open={pc.open} aria-hidden="true">›</span>
    </button>
    {#if pc.open}
      {#if pc.info}
        <dl class="pc-body">
          {#each pc.info.gpus as g}
            <dt>GPU</dt><dd title={g.name}>{g.name}{g.vramGb ? ` · ${g.vramGb} GB` : ""}</dd>
          {/each}
          <dt>CPU</dt><dd title={pc.info.cpu}>{pc.info.cpu}{pc.info.cpuThreads ? ` · ${pc.info.cpuThreads} threads` : ""}</dd>
          <dt>RAM</dt><dd>{pc.info.ramGb} GB</dd>
          <dt>OS</dt><dd title={pc.info.os}>{pc.info.os}</dd>
        </dl>
      {:else}
        <p class="pc-body dim">Reading...</p>
      {/if}
    {/if}
  </div>

  <a href={SETTINGS_TAB.path} class:active={page.url.pathname === SETTINGS_TAB.path}>
    <Icon d={SETTINGS_TAB.icon} />
    {SETTINGS_TAB.label}
  </a>

  <!-- Your Steam profile: click to open it in Steam -->
  {#if account.steamid}
    <button class="me" onclick={openMyProfile} title="Open your Steam profile">
      <span class="me-pic">
        {#if myProfile?.avatar}
          <img src={myProfile.avatar} alt="" width="32" height="32" />
        {:else}
          <Icon d={USER} size={16} />
        {/if}
        {#if myProfile && myProfile.state != null}
          <span class="me-dot {statusKind(myProfile)}" aria-hidden="true"></span>
        {/if}
      </span>
      <span class="me-text">
        <span class="me-name">{myProfile?.name || "Your profile"}</span>
        {#if myProfile && statusText(myProfile)}
          <span class="me-status {statusKind(myProfile)}">{statusText(myProfile)}</span>
        {/if}
      </span>
    </button>
  {:else}
    <button class="me" onclick={startSignIn} title="Sign in through Steam">
      <span class="me-pic"><Icon d={USER} size={16} /></span>
      <span class="me-text">
        <span class="me-name">{auth.waiting ? "Finish in your browser" : "Sign in"}</span>
        <span class="me-status">through Steam</span>
      </span>
    </button>
  {/if}
  </div>
  <!-- Drag to resize; double-click to reset. A focusable "separator" is the standard accessible
       window-splitter pattern (arrow keys resize it), so these two warnings don't apply. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="resize"
    class:active={resizing}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize sidebar"
    aria-valuemin={SIDEBAR_MIN}
    aria-valuemax={SIDEBAR_MAX}
    aria-valuenow={settings.sidebarWidth}
    tabindex="0"
    title="Drag to resize · double-click to reset"
    onpointerdown={onResizeDown}
    onpointermove={onResizeMove}
    onpointerup={onResizeUp}
    onpointercancel={onResizeUp}
    ondblclick={() => setSidebarWidth(SIDEBAR_MIN)}
    onkeydown={onResizeKey}
  ></div>
</aside>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 10px 10px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    height: 100%;
    min-width: 0;
  }

  /* Invisible 8 px grab area on the right edge; shows an accent line on hover / drag */
  .resize {
    position: absolute; top: 0; right: -4px; bottom: 0; width: 8px; z-index: 5;
    cursor: col-resize; touch-action: none;
  }
  .resize::after {
    content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px;
    background: var(--accent); opacity: 0; transition: opacity 0.15s;
  }
  .resize:hover::after, .resize.active::after, .resize:focus-visible::after { opacity: 1; }
  .resize:focus-visible { outline: none; }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 10px 20px;
    font-weight: 650;
    font-size: 1.08rem;
    letter-spacing: 0.01em;
    color: var(--text);
    user-select: none;
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
    gap: 11px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
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
  /* Icons are a little quieter than the text; the active tab's icon takes the accent color */
  a :global(svg) { opacity: 0.85; transition: color 0.15s, opacity 0.15s; }
  a:hover :global(svg) { opacity: 1; }
  a.active :global(svg) { color: var(--accent); opacity: 1; }
  .brand :global(svg) { opacity: 1; }
  /* Small dot on "Downloads" when an update or download is waiting */
  .badge-dot {
    width: 7px; height: 7px; border-radius: 50%; margin-left: 2px; flex-shrink: 0;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
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
    margin-top: 6px; padding: 4px 10px; font-size: var(--fs-sm); font-weight: 400;
    color: var(--text-dim);
  }
  .hidden-link:hover { background: none; text-decoration: underline; }

  /* ---------- My PC ---------- */
  .footer {
    display: flex; flex-direction: column; gap: 2px;
    border-top: 1px solid var(--border); padding-top: 8px;
  }
  .pc-head {
    width: 100%; display: flex; align-items: center; gap: 11px; padding: 7px 10px;
    background: transparent; border: none; border-radius: var(--radius-sm);
    color: var(--text-dim); font-size: var(--fs-md); font-weight: 500; text-align: left;
    transition: background 0.15s, color 0.15s;
  }
  .pc-head:hover { background: var(--hover); color: var(--text); }
  .pc-head :global(svg) { opacity: 0.85; }
  .chev { margin-left: auto; transition: transform 0.15s; }
  .chev.open { transform: rotate(90deg); }
  .pc-body {
    margin: 4px 0 6px; padding: 10px 12px; border-radius: var(--radius);
    background: var(--surface-2); font-size: 0.78rem;
    display: grid; grid-template-columns: auto 1fr; gap: 5px 10px;
  }
  .pc-body dt { color: var(--text-dim); }
  .pc-body dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--text-dim); margin: 4px 12px; }

  /* ---------- Your profile ---------- */
  .me {
    display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0;
    margin-top: 6px; padding: 8px 10px; text-align: left;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color 0.15s, background 0.15s;
  }
  .me:hover { border-color: var(--text-dim); }
  .me-pic {
    position: relative; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
    display: grid; place-items: center; background: var(--border); color: var(--text-dim);
  }
  .me-pic img { width: 32px; height: 32px; border-radius: 50%; display: block; }
  /* Status dot on the picture, with a ring in the box color so it stands out */
  .me-dot {
    position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%;
    border: 2px solid var(--surface-2); background: var(--text-dim);
  }
  .me-dot.online { background: var(--accent); }
  .me-dot.game { background: var(--good); }
  .me-dot.away { background: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .me-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .me-name { font-weight: 600; font-size: var(--fs-md); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .me-status { font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .me-status.game { color: var(--good); }

  /* ---------- Currently playing ---------- */
  .playing {
    gap: 10px; padding: 10px 12px; margin-bottom: 4px; align-items: flex-start;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .playing:hover { border-color: var(--good); }
  .live {
    margin-top: 5px;
    flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--good);
    /* No pulsing animation on purpose: it would keep the app redrawing while you play */
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 25%, transparent);
  }
  .playing-text { display: flex; flex-direction: column; min-width: 0; }
  .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  .game { color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stats {
    display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2px 8px; margin-top: 6px;
    font-size: 0.75rem; color: var(--text-dim);
  }
  .stats b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
  .stats-note { margin-top: 4px; font-size: 0.72rem; color: var(--text-dim); white-space: normal; }

</style>