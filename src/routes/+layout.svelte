<script lang="ts">
  import "../app.css";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { settings } from "$lib/settings.svelte";
  import { TABS } from "$lib/tabs";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { listenForSignIn } from "$lib/auth.svelte";
  import { watchPlaying } from "$lib/playing.svelte";
  import { listenForLaunchTimes, hideLaunchTip } from "$lib/launchTime.svelte";
  import LaunchTip from "$lib/components/LaunchTip.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import { updateDiscord, presence } from "$lib/discordActivity.svelte";
  import { library } from "$lib/library.svelte";
  import { epic } from "$lib/epic.svelte";
  import { custom } from "$lib/customGames.svelte";
  import { welcome } from "$lib/welcome.svelte";
  import Welcome from "$lib/components/Welcome.svelte";
  import WhatsNew from "$lib/components/WhatsNew.svelte";
  import { whatsNew, checkWhatsNew } from "$lib/whatsNew.svelte";
  import { invoke } from "@tauri-apps/api/core";

  // Tell the Rust side what X should do (and show/hide the tray icon) at start and on change
  $effect(() => {
    invoke("set_close_to_tray", { on: settings.closeToTray }).catch(() => {});
  });

  let { children } = $props();

  // Catch the kosmos:// link the browser opens after Steam sign-in
  onMount(() => {
    listenForSignIn();
    watchPlaying();
    listenForLaunchTimes();
    checkWhatsNew(); // "What's new" pop-up, once after an update
  });

  const currentTab = $derived(TABS.find((t) => t.path === page.url.pathname));
  const isOff = $derived(currentTab ? !settings.enabled[currentTab.id] : false);

  $effect(() => {
    document.documentElement.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  });

  $effect(() => {
    document.documentElement.dataset.theme = settings.theme;
  });

  $effect(() => {
    document.documentElement.dataset.accent = settings.accent;
  });

  $effect(() => {
    document.documentElement.style.setProperty("--sidebar-w", settings.sidebarWidth + "px");
  });

  // Discord activity: what you're looking at (only these values are read; nothing is written)
  $effect(() => {
    presence.game;
    const games =
      (settings.librarySteam ? library.games.length : 0) +
      (settings.libraryEpic ? epic.games.length : 0) +
      (settings.libraryCustom ? custom.games.length : 0);
    updateDiscord(settings.discordActivity, page.url.pathname, games);
  });

  // Height of the status bar, so full-height pages (like the Library) leave room for it
  $effect(() => {
    document.documentElement.style.setProperty("--statusbar-h", settings.statusBar ? "26px" : "0px");
  });
</script>

<div class="app">
  <Sidebar />
  <!-- Page on top, status bar below it: the page scrolls on its own, so nothing hides behind the bar -->
  <div class="right">
    <main onwheel={hideLaunchTip}>
      {#if isOff}
        <h1>This tab is turned off</h1>
        <p class="dim">You can turn it back on in Settings.</p>
      {:else}
        {@render children()}
      {/if}
    </main>
    {#if settings.statusBar}<StatusBar />{/if}
  </div>
</div>

<!-- First start: welcome setup in the middle of the window -->
{#if welcome.open}<Welcome />{/if}
{#if whatsNew.open}<WhatsNew />{/if}

<!-- Launch-time tooltip for Play buttons (only drawn while hovering one) -->
<LaunchTip />

<style>
  .app {
    display: grid;
    /* The sidebar gets narrower in small windows so the library always fits 3 games
       (590 px = 64 px padding + 3 game columns of 508 px + room for the scrollbar) */
    grid-template-columns: max(220px, min(var(--sidebar-w), calc(100vw - 590px))) 1fr;
    height: 100vh;
  }
  .right {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  main {
    flex: 1;
    min-height: 0;
    padding: 28px 32px;
    overflow-y: auto;
  }
  .dim {
    color: var(--text-dim);
  }
</style>