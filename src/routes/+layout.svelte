<script lang="ts">
  import "../app.css";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { settings } from "$lib/settings.svelte";
  import { TABS } from "$lib/tabs";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { listenForSignIn } from "$lib/auth.svelte";
  import { watchPlaying } from "$lib/playing.svelte";

  let { children } = $props();

  // Catch the kosmos:// link the browser opens after Steam sign-in
  onMount(() => {
    listenForSignIn();
    watchPlaying();
  });

  const currentTab = $derived(TABS.find((t) => t.path === page.url.pathname));
  const isOff = $derived(currentTab ? !settings.enabled[currentTab.id] : false);

  $effect(() => {
    document.documentElement.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  });

  $effect(() => {
    document.documentElement.dataset.theme = settings.theme;
  });
</script>

<div class="app">
  <Sidebar />
  <main>
    {#if isOff}
      <h1>This tab is turned off</h1>
      <p class="dim">You can turn it back on in Settings.</p>
    {:else}
      {@render children()}
    {/if}
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
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