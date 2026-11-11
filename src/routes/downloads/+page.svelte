<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Capsule from "$lib/components/Capsule.svelte";

  // Downloads view: what Steam has installed or is downloading, from Steam's own
  // install files on this PC. Steam does all the work; this page only shows it.
  type Install = {
    appid: number;
    name: string;
    sizeOnDisk: number;
    library: string;
    status: "installed" | "update" | "downloading" | "paused";
    firstInstall: boolean; // not fully installed yet (an install, not an update)
    bytesToDownload: number;
    bytesDownloaded: number;
    lastUpdated: number;
  };

  let games = $state<Install[]>([]);
  let status = $state<"loading" | "ready" | "error">("loading");
  let sort = $state<"name" | "size" | "updated">("name");

  async function load() {
    try {
      games = await invoke<Install[]>("steam_installs");
      status = "ready";
    } catch {
      status = "error";
    }
  }

  const active = $derived(games.filter((g) => g.status !== "installed"));
  const busy = $derived(games.some((g) => g.status === "downloading"));
  const installed = $derived(
    games
      .filter((g) => g.status === "installed")
      .sort((a, b) =>
        sort === "size"
          ? b.sizeOnDisk - a.sizeOnDisk
          : sort === "updated"
            ? b.lastUpdated - a.lastUpdated
            : a.name.localeCompare(b.name)
      )
  );

  // Space used per drive, e.g. "C:  210 GB · 9 games"
  const drives = $derived.by(() => {
    const map = new Map<string, { bytes: number; count: number }>();
    for (const g of games) {
      const d = g.library.slice(0, 2).toUpperCase();
      const e = map.get(d) ?? { bytes: 0, count: 0 };
      e.bytes += g.sizeOnDisk;
      e.count++;
      map.set(d, e);
    }
    return [...map.entries()].sort();
  });

  // Load when the page opens and when you come back to the window.
  // Only while something is actively downloading: re-read every 2 s, and only while
  // this window is visible. Otherwise nothing runs.
  $effect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  $effect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 2000);
    return () => clearInterval(timer);
  });

  function fmtSize(bytes: number) {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(bytes >= 100 * 1024 ** 3 ? 0 : 1) + " GB";
    if (bytes >= 1024 ** 2) return Math.round(bytes / 1024 ** 2) + " MB";
    return bytes ? Math.max(1, Math.round(bytes / 1024)) + " KB" : "0 MB";
  }

  function pct(g: Install) {
    return g.bytesToDownload > 0 ? Math.min(100, Math.floor((g.bytesDownloaded / g.bytesToDownload) * 100)) : 0;
  }

  function label(g: Install) {
    if (g.status === "downloading") return g.firstInstall ? "Installing" : "Updating";
    if (g.status === "paused") return g.firstInstall ? "Install paused" : "Update paused";
    if (g.status === "update") return g.firstInstall ? "Install queued" : "Update available";
    return "Installed";
  }
  // Steam shows its own "are you sure?" window, so nothing is removed without confirming there
  function uninstall(appid: number) {
    openUrl(`steam://uninstall/${appid}`).catch(() => {});
  }
</script>

<div class="head">
  <h1>Downloads</h1>
  <button class="ghost" onclick={() => openUrl("steam://nav/downloads").catch(() => {})}>
    Open Steam downloads ↗
  </button>
</div>

{#if status === "loading"}
  <p class="dim">Reading Steam's install folders...</p>
{:else if status === "error"}
  <p class="dim">Couldn't read Steam's install folders. Is Steam installed on this PC?</p>
{:else if games.length === 0}
  <p class="dim">No installed games found.</p>
{:else}
  <div class="drives">
    {#each drives as [drive, d]}
      <span class="drive"><strong>{drive}</strong> {fmtSize(d.bytes)} · {d.count} {d.count === 1 ? "game" : "games"}</span>
    {/each}
  </div>

  {#if active.length}
    <section>
      <h2>Updates and downloads</h2>
      <div class="list">
        {#each active as g (g.appid)}
          <a class="row" href={"/game?id=" + g.appid}>
            <Capsule appid={g.appid} name={g.name} />
            <div class="info">
              <span class="name">{g.name}</span>
              {#if g.status === "downloading"}
                <!-- Steam only saves progress now and then, so this is the last saved point;
                     live speed and progress are in Steam's own Downloads page -->
                <div class="bar"><div class="fill busy" style:width="{Math.max(pct(g), 3)}%"></div></div>
                <span class="dim small">
                  {#if g.bytesDownloaded > 0}
                    At least {fmtSize(g.bytesDownloaded)} of {fmtSize(g.bytesToDownload)} ({pct(g)}%) · live progress is in Steam
                  {:else}
                    {fmtSize(g.bytesToDownload)} to download · live progress is in Steam
                  {/if}
                </span>
              {:else if g.status === "paused"}
                <div class="bar"><div class="fill paused" style:width="{pct(g)}%"></div></div>
                <span class="dim small">{fmtSize(g.bytesDownloaded)} of {fmtSize(g.bytesToDownload)} · {pct(g)}%</span>
              {:else if g.firstInstall}
                <span class="dim small">{fmtSize(g.bytesToDownload)} to download · waiting in Steam's queue</span>
              {:else}
                <span class="dim small">{fmtSize(g.sizeOnDisk)} · Steam will update it when you play, or from its Downloads page</span>
              {/if}
            </div>
            <span class="badge {g.status}">{label(g)}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <div class="section-head">
      <h2>Installed ({installed.length})</h2>
      <select bind:value={sort} aria-label="Sort installed games">
        <option value="name">Name</option>
        <option value="size">Size on disk</option>
        <option value="updated">Last updated</option>
      </select>
    </div>
    <div class="list">
      {#each installed as g (g.appid)}
        <div class="row">
          <a class="link" href={"/game?id=" + g.appid}>
            <Capsule appid={g.appid} name={g.name} />
            <div class="info">
              <span class="name">{g.name}</span>
              <span class="dim small">{g.library.slice(0, 2).toUpperCase()} drive</span>
            </div>
          </a>
          <span class="size">{fmtSize(g.sizeOnDisk)}</span>
          <button class="uninstall" onclick={() => uninstall(g.appid)} title="Steam will ask you to confirm">
            Uninstall
          </button>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 1.6rem; font-weight: 700; }
  h2 {
    margin: 0; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  section { max-width: 820px; margin-bottom: 28px; }
  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  section > h2 { margin-bottom: 10px; }
  select { padding: 5px 10px; font-size: var(--fs-sm); }
  .dim { color: var(--text-dim); }
  .small { font-size: var(--fs-sm); }

  .drives { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 22px; }
  .drive {
    font-size: var(--fs-sm); color: var(--text-dim); padding: 5px 12px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .drive strong { color: var(--text); margin-right: 4px; }

  .list {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
  }
  .row {
    display: flex; align-items: center; gap: 14px; padding: 10px 14px;
    color: inherit; text-decoration: none; transition: background 0.15s;
  }
  .row + .row { border-top: 1px solid var(--border); }
  .row:hover { background: var(--hover); }
  .link {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px;
    color: inherit; text-decoration: none;
  }
  .uninstall {
    flex-shrink: 0; padding: 5px 12px; border-radius: var(--radius-sm); font-size: var(--fs-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
    opacity: 0; transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  }
  /* Shown when you hover the row (or reach it with the keyboard) */
  .row:hover .uninstall, .uninstall:focus-visible { opacity: 1; }
  .uninstall:hover { color: var(--bad); border-color: var(--bad); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .size { font-size: var(--fs-sm); color: var(--text-dim); flex-shrink: 0; }

  .bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; max-width: 360px; }
  .fill { height: 100%; background: var(--accent); transition: width 0.4s; }
  .fill.paused { background: var(--text-dim); }

  .badge {
    flex-shrink: 0; font-size: var(--fs-sm); font-weight: 600; padding: 3px 10px; border-radius: 999px;
    background: var(--surface-2); color: var(--text);
  }
  .badge.update { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .badge.downloading { background: color-mix(in srgb, var(--good) 20%, transparent); }

  .ghost {
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 7px 14px; color: var(--text-dim); font-size: var(--fs-md);
    transition: color 0.15s, border-color 0.15s;
  }
  .ghost:hover { color: var(--text); border-color: var(--text-dim); }
</style>
