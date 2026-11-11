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
</script>

<div class="app">
  <Sidebar />
  <main onwheel={hideLaunchTip}>
    {#if isOff}
      <h1>This tab is turned off</h1>
      <p class="dim">You can turn it back on in Settings.</p>
    {:else}
      {@render children()}
    {/if}
  </main>
</div>

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
  main {
    padding: 28px 32px;
    overflow-y: auto;
  }
  .dim {
    color: var(--text-dim);
  }
</style>