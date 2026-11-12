<!-- Thin bar along the bottom of the page area: time on the left; Kosmos's version and its own
     CPU and memory use on the right. Light on purpose:
     - the clock only redraws once a minute (at the start of each minute)
     - CPU / memory are read every 5 seconds, and only while Kosmos is visible on screen -->
<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getVersion } from "@tauri-apps/api/app";
  import { settings } from "$lib/settings.svelte";
  import { updater, checkForUpdate, installUpdate } from "$lib/updater.svelte";

  // ---------- Time ----------
  let now = $state(new Date());
  const timeText = $derived.by(() => {
    const zone = settings.timeZone || undefined;
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
        timeZoneName: zone ? "short" : undefined, // show the zone when it's not this PC's
      }).format(now);
    } catch {
      return now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
  });

  // ---------- Version and usage ----------
  let version = $state("");
  let cpu = $state<number | null>(null);
  let memoryMb = $state(0);
  let appMb = $state(0);

  async function readUsage() {
    try {
      const u = await invoke<{ cpu: number | null; memoryMb: number; appMb: number }>("app_usage");
      cpu = u.cpu;
      memoryMb = u.memoryMb;
      appMb = u.appMb;
    } catch {
      /* not running inside Tauri */
    }
  }

  onMount(() => {
    getVersion().then((v) => (version = v)).catch(() => {});
    // Look for a new version once, a few seconds after startup (so it doesn't slow the start)
    const updateCheck = setTimeout(() => checkForUpdate(), 4000);

    // Clock: wake up at the start of each minute
    let clock: ReturnType<typeof setTimeout>;
    const tick = () => {
      now = new Date();
      clock = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();

    // Usage: every 5 s while visible; paused while Kosmos is minimized or hidden
    let usage: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (usage) return;
      readUsage();
      usage = setInterval(readUsage, 5000);
    };
    const stop = () => {
      clearInterval(usage);
      usage = undefined;
      cpu = null; // the next reading starts fresh
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick(); // the clock may be behind after being hidden
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(updateCheck);
      clearTimeout(clock);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });

  const fmtMem = (mb: number) => (mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB");
</script>

<footer class="status">
  <span class="time">{timeText}</span>
  <span class="right">
    <!-- Update button (only when there is one), then the version: click it to check now -->
    {#if updater.status === "available"}
      <button class="update" onclick={installUpdate} title={updater.notes ? "What's new:\n" + updater.notes : "Download and install, then restart Kosmos"}>
        ↑ Update to {updater.version}
      </button>
    {:else if updater.status === "downloading"}
      <span class="note">Downloading update {updater.progress}%</span>
    {:else if updater.status === "installing"}
      <span class="note">Installing update...</span>
    {:else if updater.status === "error"}
      <button class="link bad" onclick={() => checkForUpdate(true)}>
        {updater.failed === "install" ? "Update failed · try again" : "Couldn’t check for updates"}
      </button>
    {:else if updater.status === "checking"}
      <span class="note">Checking for updates...</span>
    {:else if updater.status === "none"}
      <span class="note good">Up to date</span>
    {/if}
    {#if version}
      <button class="link" onclick={() => checkForUpdate(true)} title="Check for updates">Kosmos {version}</button>
    {/if}
    <span class="sep" aria-hidden="true">·</span>
    <span title="Kosmos's share of your PC's processor (all its parts together)">
      CPU <b>{cpu == null ? "…" : cpu < 0.1 ? "0%" : cpu.toFixed(1) + "%"}</b>
    </span>
    <span class="sep" aria-hidden="true">·</span>
    <span
      title={`Memory used by Kosmos, all parts together (same measure as Task Manager):\n` +
        `Kosmos ${fmtMem(appMb)} + page drawing (Microsoft Edge WebView2) ${fmtMem(Math.max(0, memoryMb - appMb))}`}
    >
      RAM <b>{memoryMb ? fmtMem(memoryMb) : "…"}</b>
    </span>
  </span>
</footer>

<style>
  .status {
    height: var(--statusbar-h);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 0 14px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.74rem;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
  }
  .right { display: flex; align-items: center; gap: 8px; }
  b { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .sep { opacity: 0.6; }
  .link {
    padding: 0; border: none; background: none; font: inherit; color: inherit; cursor: pointer;
  }
  .link:hover { color: var(--text); }
  .link.bad, .bad { color: var(--bad); }
  .note { color: var(--text-dim); }
  .note.good { color: var(--good); }
  /* Small pill in the accent color, so a new version is easy to spot */
  .update {
    padding: 1px 9px; border-radius: 999px; border: none;
    font: inherit; font-weight: 600; cursor: pointer;
    background: var(--accent); color: var(--on-accent);
    transition: filter 0.15s;
  }
  .update:hover { filter: brightness(1.1); }
</style>
