<script lang="ts">
  import { invoke, convertFileSrc } from "@tauri-apps/api/core";
  import { save } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import VirtualGrid from "$lib/components/VirtualGrid.svelte";
  import { account } from "$lib/account.svelte";
  import { library } from "$lib/library.svelte";

  // Your Steam screenshots, read from Steam's folder on this PC (src-tauri/src/screenshots.rs).
  // Read when the page opens and when you come back to the window. Only the small versions are
  // shown in the grid (and only the ones on screen); the full picture loads when you open one.

  type Shot = { path: string; thumb: string; appid: number; taken: number; online: string };

  let shots = $state<Shot[]>([]);
  let status = $state<"loading" | "ready">("loading");
  let game = $state(0); // 0 = all games
  let order = $state<"new" | "old">("new");
  let onlyOnline = $state(false); // tick: only screenshots you uploaded to your Steam profile

  // Picture size, like File Explorer's views. At full screen: Small 8, Medium 5, Large 3 per row
  // (fewer in smaller windows). Large uses the full pictures, the others Steam's small versions.
  const SIZES = { small: 166, medium: 274, large: 460 } as const;
  type Size = keyof typeof SIZES;
  const SIZE_KEY = "kosmos-screenshot-size";
  let size = $state<Size>(
    (() => {
      try {
        const v = localStorage.getItem(SIZE_KEY);
        return v === "small" || v === "medium" ? v : "large";
      } catch {
        return "large";
      }
    })()
  );
  function setSize(s: Size) {
    size = s;
    try {
      localStorage.setItem(SIZE_KEY, s);
    } catch {
      /* ignore */
    }
  }
  const tileW = $derived<number>(SIZES[size]);
  const tileH = $derived(Math.round((tileW * 9) / 16));

  async function load() {
    try {
      shots = await invoke<Shot[]>("steam_screenshots", { steamid: account.steamid });
    } catch {
      shots = [];
    }
    status = "ready";
  }
  $effect(() => {
    account.steamid; // read again after signing in or out
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  });

  const nameOf = (appid: number) => library.games.find((g) => g.appid === appid)?.name ?? `Game ${appid}`;

  // Games you have screenshots of, most screenshots first
  const onlineCount = $derived(shots.filter((s) => s.online).length);
  const games = $derived.by(() => {
    const count = new Map<number, number>();
    for (const s of shots) count.set(s.appid, (count.get(s.appid) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  });
  const shown = $derived.by(() => {
    let list = game ? shots.filter((s) => s.appid === game) : shots;
    if (onlyOnline) list = list.filter((s) => s.online);
    return order === "new" ? list : [...list].reverse();
  });

  const day = (s: number) =>
    new Date(s * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // ---------- Viewer ----------
  let open = $state(-1); // index in `shown`, -1 = closed
  const current = $derived(open >= 0 ? shown[open] : null);
  let note = $state("");
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function say(text: string) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ""), 5000);
  }

  function step(dir: number) {
    if (open < 0) return;
    open = (open + dir + shown.length) % shown.length;
    note = "";
  }

  function onKey(e: KeyboardEvent) {
    if (open < 0) return;
    if (e.key === "Escape") open = -1;
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  }

  async function saveToPc(s: Shot) {
    const file = s.path.split(/[\\/]/).pop() ?? "screenshot.jpg";
    const dest = await save({
      defaultPath: `${nameOf(s.appid).replace(/[\\/:*?"<>|]/g, "")} ${file}`,
      filters: [{ name: "Picture", extensions: [file.split(".").pop() ?? "jpg"] }],
    }).catch(() => null);
    if (!dest) return;
    invoke("screenshot_save", { source: s.path, dest })
      .then(() => say("Saved."))
      .catch((e) => say("Couldn't save: " + e));
  }

  // Copy the picture (as a file, like in File Explorer) and open your Steam friends list:
  // open a chat and press Ctrl+V. Works the same in Discord and most chat apps.
  function sendToFriend(s: Shot) {
    invoke("screenshot_copy", { source: s.path })
      .then(() => {
        say("Copied! Open a chat with your friend and press Ctrl+V to send it.");
        openUrl("steam://open/friends").catch(() => {});
      })
      .catch((e) => say("Couldn't copy: " + e));
  }

  // Deleting happens in Steam: an uploaded screenshot on its page, otherwise in Steam's
  // screenshot manager for that game
  function deleteInSteam(s: Shot) {
    const link = s.online ? `steam://openurl/${s.online}` : `steam://open/screenshots/${s.appid}`;
    openUrl(link).catch(() => {});
    say(s.online ? "Opened its page on Steam: use Delete there." : "Opened Steam's screenshot manager: select it and use Delete.");
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
  <div class="head">
    <h1>Screenshots <span class="count">{shown.length}</span></h1>
    <select bind:value={game} aria-label="Game">
      <option value={0}>All games ({shots.length})</option>
      {#each games as [appid, n] (appid)}<option value={appid}>{nameOf(appid)} ({n})</option>{/each}
    </select>
    <select bind:value={order} aria-label="Order">
      <option value="new">Newest first</option>
      <option value="old">Oldest first</option>
    </select>
    <div class="sizes" role="radiogroup" aria-label="Picture size">
      {#each ["small", "medium", "large"] as const as s (s)}
        <button role="radio" aria-checked={size === s} onclick={() => setSize(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
      {/each}
    </div>
    <label class="check" title="Only screenshots you uploaded to your Steam profile">
      <input type="checkbox" bind:checked={onlyOnline} />
      On Steam only <span class="n">{onlineCount}</span>
    </label>
  </div>

  {#if status === "loading"}
    <p class="dim">Reading your screenshots...</p>
  {:else if shots.length === 0}
    <p class="dim">
      No Steam screenshots on this PC yet. In a game, press <b>F12</b> (Steam's screenshot key) and
      they'll show up here.
    </p>
  {:else}
    <div class="grid-wrap">
      <VirtualGrid items={shown} itemWidth={tileW} itemHeight={tileH} gap={10} key={(s) => s.path}>
        {#snippet children(s)}
          <button
            class="shot"
            style:width="{tileW}px"
            style:height="{tileH}px"
            onclick={() => (open = shown.indexOf(s))}
            title={nameOf(s.appid) + " · " + day(s.taken)}
          >
            <img src={convertFileSrc(size === "large" || !s.thumb ? s.path : s.thumb)} alt="" loading="lazy" decoding="async" />
            {#if s.online}<span class="tag" title="Uploaded to your Steam profile">On Steam</span>{/if}
          </button>
        {/snippet}
      </VirtualGrid>
    </div>
  {/if}
</div>

{#if current}
  <!-- Viewer: the full picture, with Save / Send / Delete -->
  <div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = -1)}>
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Screenshot">
      <div class="top">
        <div class="info">
          <strong>{nameOf(current.appid)}</strong>
          <span class="dim">{day(current.taken)}{current.online ? " · uploaded to Steam" : ""}</span>
        </div>
        <button class="x" onclick={() => (open = -1)} aria-label="Close">✕</button>
      </div>

      <div class="picture">
        <button class="nav left" onclick={() => step(-1)} aria-label="Previous">‹</button>
        <img src={convertFileSrc(current.path)} alt="Screenshot" />
        <button class="nav right" onclick={() => step(1)} aria-label="Next">›</button>
      </div>

      <div class="actions">
        <button class="primary" onclick={() => saveToPc(current)}>⬇ Save to PC</button>
        <button class="ghost" onclick={() => sendToFriend(current)}>Send to a friend</button>
        {#if current.online}
          <button class="ghost" onclick={() => openUrl(`steam://openurl/${current.online}`).catch(() => {})}>View on Steam ↗</button>
        {/if}
        <span class="spacer"></span>
        <button class="danger" onclick={() => deleteInSteam(current)}>Delete in Steam</button>
      </div>
      {#if note}<p class="note">{note}</p>{/if}
    </div>
  </div>
{/if}

<style>
  .page { height: calc(100vh - 56px - var(--statusbar-h, 0px)); display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  h1 { margin: 0 6px 0 0; font-size: 1.6rem; font-weight: 700; }
  .count { font-size: var(--fs-md); font-weight: 400; color: var(--text-dim); margin-left: 8px; }
  select { max-width: 320px; }
  .dim { color: var(--text-dim); }
  /* Small / Medium / Large */
  .sizes {
    display: flex; gap: 2px; padding: 2px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .sizes button {
    padding: 5px 12px; border: none; border-radius: 4px; font-size: var(--fs-sm);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .sizes button:hover { color: var(--text); }
  .sizes button[aria-checked="true"] { background: var(--surface-2); color: var(--text); font-weight: 600; }
  .check {
    display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; cursor: pointer;
    border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--fs-md); color: var(--text-dim);
    transition: color 0.15s, border-color 0.15s;
  }
  .check:hover { color: var(--text); border-color: var(--text-dim); }
  .check input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; cursor: pointer; }
  .check .n { font-size: var(--fs-sm); color: var(--text-dim); }
  .grid-wrap { flex: 1; min-height: 0; }

  .shot {
    position: relative; padding: 0; overflow: hidden;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface);
    transition: border-color 0.15s, transform 0.15s;
  }
  .shot:hover { border-color: var(--accent); transform: translateY(var(--lift)); }
  .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tag {
    position: absolute; left: 6px; bottom: 6px; padding: 1px 7px; border-radius: 999px;
    font-size: 0.68rem; font-weight: 600; background: var(--scrim); color: #fff; /* on the picture */
  }

  /* ---------- Viewer ---------- */
  .scrim {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
    background: var(--scrim);
  }
  .viewer {
    width: min(1100px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; gap: 12px;
    padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 16px 48px var(--scrim);
  }
  .top { display: flex; align-items: center; gap: 12px; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .info strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .info .dim { font-size: var(--fs-sm); }
  .x {
    flex-shrink: 0; width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .picture { position: relative; min-height: 0; flex: 1; display: grid; place-items: center; }
  .picture img {
    max-width: 100%; max-height: calc(100vh - 200px); display: block;
    border-radius: var(--radius-sm); background: #000; /* behind a picture, same in both themes */
  }
  .nav {
    position: absolute; top: 50%; transform: translateY(-50%); z-index: 1;
    width: 36px; height: 36px; border-radius: 50%; border: none;
    background: var(--scrim); color: #fff; font-size: 1.3rem; line-height: 1;
    opacity: 0.7; transition: opacity 0.15s;
  }
  .nav:hover { opacity: 1; }
  .nav.left { left: 8px; }
  .nav.right { right: 8px; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .primary, .ghost, .danger { padding: 7px 14px; border-radius: var(--radius); font-size: var(--fs-md); }
  .primary { background: var(--accent); color: var(--on-accent); border: none; font-weight: 600; }
  .primary:hover { filter: brightness(1.1); }
  .ghost { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .ghost:hover { border-color: var(--text-dim); }
  .danger { background: transparent; border: 1px solid var(--border); color: var(--bad); }
  .danger:hover { border-color: var(--bad); }
  .note { margin: 0; font-size: var(--fs-sm); color: var(--text-dim); }
</style>
