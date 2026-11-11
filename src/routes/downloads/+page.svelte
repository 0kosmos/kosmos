<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Capsule from "$lib/components/Capsule.svelte";
  import { epic, loadEpic, openEpicLibrary, smallCover, type EpicGame } from "$lib/epic.svelte";
  import { setSteamPending } from "$lib/downloadsBadge.svelte";

  // Downloads view: what Steam and the Epic Games Launcher have installed or are installing,
  // read from their own install files on this PC. The launchers do all the work; this page
  // only shows it. One tab per launcher (remembered).
  const TAB_KEY = "kosmos-downloads-tab";
  let tab = $state<"steam" | "epic">(
    (() => {
      try {
        return localStorage.getItem(TAB_KEY) === "epic" ? "epic" : "steam";
      } catch {
        return "steam";
      }
    })()
  );
  function setTab(t: "steam" | "epic") {
    tab = t;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  }
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
      setSteamPending(games.filter((g) => g.status !== "installed").length); // sidebar dot
      measure(games); // real sizes of games not measured since their last update
    } catch {
      status = "error";
    }
  }

  // ---------- Real folder sizes (Steam) ----------
  // Steam's own size only counts what Steam downloaded; games with their own launcher
  // (e.g. Wuthering Waves) download most data themselves. So we add up each game's folder,
  // in the background, and remember it until the game updates (or you press Refresh).
  const SIZE_KEY = "kosmos-steam-sizes-v1";
  type Measured = Record<number, { bytes: number; updated: number }>;
  let measured = $state<Measured>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(SIZE_KEY) || "{}");
      } catch {
        return {};
      }
    })()
  );
  let measuring = $state(false);

  async function measure(list: Install[], all = false) {
    if (measuring) return;
    const todo = list.filter((g) => g.status === "installed" && (all || measured[g.appid]?.updated !== g.lastUpdated));
    if (!todo.length) return;
    measuring = true;
    try {
      const pairs = await invoke<[number, number][]>("steam_folder_sizes", { appids: todo.map((g) => g.appid) });
      const next = { ...measured };
      for (const [id, bytes] of pairs) {
        const g = todo.find((x) => x.appid === id);
        if (g && bytes > 0) next[id] = { bytes, updated: g.lastUpdated };
      }
      measured = next;
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch {
      /* keep Steam's numbers */
    } finally {
      measuring = false;
    }
  }

  /** Real size if we measured it since the last update, otherwise Steam's number */
  function sizeOf(g: Install) {
    const m = measured[g.appid];
    return m && m.updated === g.lastUpdated ? m.bytes : g.sizeOnDisk;
  }

  /** Read everything again: Steam and Epic lists, and every Steam game's size */
  async function refresh() {
    if (measuring) return;
    measured = {}; // forget saved sizes, so load() measures every game again
    loadEpic(true);
    await load();
  }

  const active = $derived(games.filter((g) => g.status !== "installed"));
  const busy = $derived(games.some((g) => g.status === "downloading"));
  const installed = $derived(
    games
      .filter((g) => g.status === "installed")
      .sort((a, b) =>
        sort === "size"
          ? sizeOf(b) - sizeOf(a)
          : sort === "updated"
            ? b.lastUpdated - a.lastUpdated
            : a.name.localeCompare(b.name)
      )
  );

  // ---------- Epic Games ----------
  const epicActive = $derived(epic.games.filter((g) => g.installing));
  const epicInstalled = $derived(
    epic.games
      .filter((g) => g.installed)
      .sort((a, b) => (sort === "size" ? b.sizeBytes - a.sizeBytes : a.name.localeCompare(b.name)))
  );
  const drive = (path: string) => path.slice(0, 2).toUpperCase();
  // Epic opens its own library; uninstalling is in each game's "..." menu there
  const openEpic = () => openEpicLibrary().catch(() => {});

  // Space used per drive for the open tab, e.g. "C:  210 GB · 9 games"
  const drives = $derived.by(() => {
    const list =
      tab === "steam"
        ? games.map((g) => ({ path: g.library, bytes: sizeOf(g) }))
        : epic.games.filter((g) => g.installed || g.installing).map((g) => ({ path: g.installDir, bytes: g.sizeBytes }));
    const map = new Map<string, { bytes: number; count: number }>();
    for (const g of list) {
      const d = drive(g.path);
      const e = map.get(d) ?? { bytes: 0, count: 0 };
      e.bytes += g.bytes;
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
    loadEpic(true);
    const onFocus = () => {
      load();
      loadEpic(true);
    };
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
  <div class="tabs" role="tablist" aria-label="Launcher">
    <button role="tab" aria-selected={tab === "steam"} onclick={() => setTab("steam")}>
      Steam <span class="n">{games.length}</span>
    </button>
    <button role="tab" aria-selected={tab === "epic"} onclick={() => setTab("epic")}>
      Epic Games <span class="n">{epicInstalled.length + epicActive.length}</span>
    </button>
  </div>
  <button class="ghost" onclick={refresh} disabled={measuring} title="Read installed games and their sizes again">
    {measuring ? "Checking sizes..." : "↻ Refresh"}
  </button>
  {#if tab === "steam"}
    <button class="ghost" onclick={() => openUrl("steam://nav/downloads").catch(() => {})}>
      Open Steam downloads ↗
    </button>
  {:else}
    <button class="ghost" onclick={openEpic}>Open Epic library ↗</button>
  {/if}
</div>

{#if tab === "epic"}
  <!-- ---------- Epic Games ---------- -->
  {#if epicInstalled.length === 0 && epicActive.length === 0}
    <p class="dim">No Epic Games games installed on this PC.</p>
  {:else}
    <div class="drives">
      {#each drives as [d, info]}
        <span class="drive"><strong>{d}</strong> {fmtSize(info.bytes)} · {info.count} {info.count === 1 ? "game" : "games"}</span>
      {/each}
    </div>

    {#if epicActive.length}
      <section>
        <h2>Downloads</h2>
        <div class="list">
          {#each epicActive as g (g.appName)}
            <button class="row plain" onclick={openEpic} title="Open your Epic library">
              {@render epicPic(g)}
              <div class="info">
                <span class="name">{g.name}</span>
                <span class="dim small">{fmtSize(g.sizeBytes)} · progress and pause are in the Epic launcher</span>
              </div>
              <span class="badge downloading">Installing</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if epicInstalled.length}
      <section>
        <div class="section-head">
          <h2>Installed ({epicInstalled.length})</h2>
          <select bind:value={sort} aria-label="Sort installed games">
            <option value="name">Name</option>
            <option value="size">Size on disk</option>
          </select>
        </div>
        <div class="list">
          {#each epicInstalled as g (g.appName)}
            <div class="row">
              <div class="link">
                {@render epicPic(g)}
                <div class="info">
                  <span class="name">{g.name}</span>
                  <span class="dim small">{drive(g.installDir)} drive</span>
                </div>
              </div>
              <span class="size">{fmtSize(g.sizeBytes)}</span>
              <button class="uninstall" onclick={openEpic} title="Opens your Epic library: uninstall from the game's ... menu">
                Uninstall in Epic
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
{:else if status === "loading"}
  <p class="dim">Reading Steam's install folders...</p>
{:else if status === "error"}
  <p class="dim">Couldn't read Steam's install folders. Is Steam installed on this PC?</p>
{:else if games.length === 0}
  <p class="dim">No installed games found.</p>
{:else}
  <div class="drives">
    {#each drives as [d, info]}
      <span class="drive"><strong>{d}</strong> {fmtSize(info.bytes)} · {info.count} {info.count === 1 ? "game" : "games"}</span>
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
                <!-- Steam writes the update's own size once it knows it (not the game's full size) -->
                <span class="dim small">
                  {#if g.bytesToDownload > 0 && g.bytesDownloaded < g.bytesToDownload}{fmtSize(g.bytesToDownload)} update · {/if}Steam
                  will update it when you play, or from its Downloads page
                </span>
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
          <span class="size">{fmtSize(sizeOf(g))}</span>
          <button class="uninstall" onclick={() => uninstall(g.appid)} title="Steam will ask you to confirm">
            Uninstall
          </button>
        </div>
      {/each}
    </div>
  </section>
{/if}

<!-- Small wide picture for an Epic game (same size as Steam's) -->
{#snippet epicPic(g: EpicGame)}
  <div class="pic">
    {#if g.wide || g.cover}
      <img src={smallCover(g.wide || g.cover, 184)} alt="" loading="lazy" decoding="async" />
    {:else}
      <span>{g.name.charAt(0)}</span>
    {/if}
  </div>
{/snippet}

<style>
  /* Steam / Epic Games tabs */
  .tabs {
    display: flex; gap: 2px; padding: 2px; margin-right: auto;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .tabs button {
    padding: 5px 14px; border: none; border-radius: 4px; font-size: var(--fs-md);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .tabs button:hover { color: var(--text); }
  .tabs button[aria-selected="true"] { background: var(--surface-2); color: var(--text); font-weight: 600; }
  .tabs .n { font-size: var(--fs-sm); color: var(--text-dim); font-weight: 400; margin-left: 4px; }
  .pic {
    width: 92px; height: 35px; flex-shrink: 0; overflow: hidden;
    border-radius: 4px; background: var(--surface-2);
    display: grid; place-items: center;
  }
  .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pic span { font-weight: 700; color: var(--text-dim); }
  .row.plain {
    width: 100%; text-align: left; font: inherit; color: inherit;
    background: none; border: none; border-radius: 0;
  }

  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
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
  .ghost:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }
  .ghost:disabled { opacity: 0.6; cursor: default; }
</style>
