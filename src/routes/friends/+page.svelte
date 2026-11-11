<script lang="ts">
  import { onMount, untrack } from "svelte";
  import SignInCard from "$lib/components/SignInCard.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { account } from "$lib/account.svelte";
  import { fetchFriends, pins, togglePin, chatLink, type Friend } from "$lib/friends.svelte";

  let friends = $state<Friend[]>([]);
  let status = $state<"loading" | "ready" | "private" | "error">("loading");
  let search = $state("");
  let refreshing = $state(false);
  let now = $state(Date.now()); // for "last online ... ago"

  async function load() {
    if (!account.steamid || refreshing) return;
    refreshing = true;
    try {
      const r = await fetchFriends(account.steamid);
      if (r.private) {
        status = "private";
      } else {
        friends = r.friends;
        status = "ready";
      }
      now = Date.now();
    } catch {
      if (status !== "ready") status = "error";
    } finally {
      refreshing = false;
    }
  }

  // Load now; refresh when you come back to the window and every minute while this tab is
  // visible (nothing runs when Kosmos is minimized or you're on another tab).
  // Load when you open the tab, and again right after you sign in here
  $effect(() => {
    if (account.steamid) untrack(load);
  });

  onMount(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  });

  // ---------- Sorting into groups ----------
  const rank = (f: Friend) => (f.game ? 0 : f.state === 1 || f.state >= 5 ? 1 : f.state > 0 ? 2 : 3);

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const list = q ? friends.filter((f) => f.name.toLowerCase().includes(q)) : friends;
    return [...list].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 3 ? b.lastOnline - a.lastOnline : a.name.localeCompare(b.name))
    );
  });

  const groups = $derived.by(() => {
    const pinned = filtered.filter((f) => pins.ids.includes(f.steamid));
    const rest = filtered.filter((f) => !pins.ids.includes(f.steamid));
    return [
      { id: "pinned", label: "Pinned", list: pinned },
      { id: "game", label: "In game", list: rest.filter((f) => rank(f) === 0) },
      { id: "online", label: "Online", list: rest.filter((f) => rank(f) === 1 || rank(f) === 2) },
      { id: "offline", label: "Offline", list: rest.filter((f) => rank(f) === 3) },
    ].filter((g) => g.list.length);
  });

  const onlineCount = $derived(friends.filter((f) => f.state > 0).length);

  // Offline group can be collapsed (remembered)
  const COLLAPSE_KEY = "kosmos-friends-offline-collapsed";
  let offlineCollapsed = $state(
    (() => {
      try {
        return localStorage.getItem(COLLAPSE_KEY) === "1";
      } catch {
        return false;
      }
    })()
  );
  function toggleOffline() {
    offlineCollapsed = !offlineCollapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, offlineCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // ---------- Text ----------
  const STATE: Record<number, string> = { 1: "Online", 2: "Busy", 3: "Away", 4: "Snooze", 5: "Looking to trade", 6: "Looking to play" };

  function ago(ms: number) {
    if (!ms) return "Offline";
    const min = Math.floor((now - ms) / 60_000);
    if (min < 1) return "Last online just now";
    if (min < 60) return `Last online ${min} min ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Last online ${h} ${h === 1 ? "hour" : "hours"} ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `Last online ${d} ${d === 1 ? "day" : "days"} ago`;
    return "Last online " + new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function statusLine(f: Friend) {
    if (f.game) return "Playing " + f.game;
    if (f.state > 0) return STATE[f.state] ?? "Online";
    return ago(f.lastOnline);
  }

  const tone = (f: Friend) => (f.game ? "game" : f.state === 1 || f.state >= 5 ? "online" : f.state > 0 ? "away" : "offline");

  const chat = (f: Friend) => openUrl(chatLink(f.steamid)).catch(() => {});
  const profile = (f: Friend) =>
    openUrl(`steam://openurl/https://steamcommunity.com/profiles/${f.steamid}/`).catch(() => {});
</script>

<div class="page">
  <div class="head">
    <h1>Friends <span class="count">{#if status === "ready"}{onlineCount} online · {friends.length} friends{/if}</span></h1>
    <input class="search" type="search" placeholder="Search friends..." bind:value={search} />
    <button class="ghost" onclick={load} disabled={refreshing} title="Refresh now">{refreshing ? "Refreshing..." : "Refresh"}</button>
  </div>

  {#if !account.steamid}
    <SignInCard title="Sign in to see your friends" />
  {:else if status === "loading"}
    <p class="dim">Loading your friends...</p>
  {:else if status === "private"}
    <div class="card">
      <h2>Your friends list is private</h2>
      <p class="dim">
        Steam only shares your friends list with apps like Kosmos when it's public. In Steam, open
        your profile → Edit Profile → Privacy Settings, set "Friends List" to Public, then press Refresh.
      </p>
    </div>
  {:else if status === "error"}
    <p class="dim">Couldn't load your friends right now. <button class="link" onclick={load}>Try again</button></p>
  {:else if friends.length === 0}
    <p class="dim">You don't have any Steam friends yet.</p>
  {:else if filtered.length === 0}
    <p class="dim">No friends match "{search.trim()}".</p>
  {:else}
    <p class="hint dim">Double-click a friend to open a chat in Steam.</p>
    {#each groups as g (g.id)}
      <section>
        {#if g.id === "offline"}
          <button class="group-head" onclick={toggleOffline} aria-expanded={!offlineCollapsed}>
            <span>{g.label} ({g.list.length})</span>
            <span class="chev" class:open={!offlineCollapsed} aria-hidden="true">›</span>
          </button>
        {:else}
          <h2 class="group-title">{g.label} ({g.list.length})</h2>
        {/if}

        {#if !(g.id === "offline" && offlineCollapsed)}
          <div class="list">
            {#each g.list as f (f.steamid)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="row" ondblclick={() => chat(f)} title="Double-click to chat">
                <span class="avatar {tone(f)}">
                  {#if f.avatar}<img src={f.avatar} alt="" loading="lazy" decoding="async" />{/if}
                </span>
                <span class="who">
                  <span class="name">{f.name}</span>
                  <span class="status {tone(f)}">{statusLine(f)}</span>
                </span>
                <span class="actions">
                  <button class="icon" class:pinned={pins.ids.includes(f.steamid)} onclick={() => togglePin(f.steamid)}
                    title={pins.ids.includes(f.steamid) ? "Unpin" : "Pin to the top"} aria-label={(pins.ids.includes(f.steamid) ? "Unpin " : "Pin ") + f.name}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5z M12 14v6" fill={pins.ids.includes(f.steamid) ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" /></svg>
                  </button>
                  <button class="icon" onclick={() => chat(f)} title="Message in Steam" aria-label={"Message " + f.name}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                  </button>
                  <button class="icon" onclick={() => profile(f)} title="Open Steam profile" aria-label={"Open " + f.name + "'s profile"}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .page { max-width: 1400px; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  h1 { margin: 0 6px 0 0; font-size: 1.6rem; font-weight: 700; display: flex; align-items: baseline; white-space: nowrap; }
  .count { font-size: var(--fs-md); font-weight: 400; color: var(--text-dim); margin-left: 10px; }
  .search { flex: 1; max-width: 320px; min-width: 160px; }
  .dim { color: var(--text-dim); margin: 0; }
  .hint { font-size: var(--fs-sm); margin-bottom: 14px; }
  .ghost {
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 7px 12px; color: var(--text-dim); font-size: var(--fs-md);
  }
  .ghost:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }
  .ghost:disabled { opacity: 0.6; }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .card { padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .card h2 { margin: 0 0 8px; font-size: 1.1rem; }

  section { margin-bottom: 18px; }
  .group-title, .group-head {
    margin: 0 0 8px; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-dim);
  }
  .group-head { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 0; }
  .group-head:hover { color: var(--text); }
  .chev { transition: transform 0.15s; display: inline-block; }
  .chev.open { transform: rotate(90deg); }

  /* Friends as compact cards next to each other (as many per row as fit) */
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .row {
    position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    cursor: default; user-select: none; min-width: 0;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    transition: background 0.15s, border-color 0.15s;
    /* Cards far off screen aren't drawn, so big friend lists stay smooth */
    content-visibility: auto; contain-intrinsic-size: auto 58px;
  }
  .row:hover { background: var(--surface-2); border-color: color-mix(in srgb, var(--text-dim) 40%, var(--border)); }

  .avatar {
    /* (status ring) */
    width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%; padding: 2px;
    background: var(--border); display: grid; place-items: center;
  }
  .avatar img { width: 100%; height: 100%; border-radius: 50%; display: block; }
  /* Ring color = status */
  .avatar.online { background: var(--accent); }
  .avatar.game { background: var(--good); }
  .avatar.away { background: color-mix(in srgb, var(--accent) 45%, var(--border)); }

  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { font-size: var(--fs-sm); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status.online { color: var(--accent); }
  .status.game { color: var(--good); }

  /* Buttons float over the right side of the card on hover, so names get the full width otherwise */
  .actions {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    display: flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm);
    background: var(--surface-2); opacity: 0; transition: opacity 0.15s;
  }
  .row:hover .actions, .actions:focus-within { opacity: 1; }
  .icon {
    width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid transparent; color: var(--text-dim);
  }
  .icon:hover { color: var(--text); border-color: var(--border); background: var(--surface-2); }
  /* A pinned friend's pin is always visible */
  .icon.pinned { color: var(--accent); }
  /* A pinned friend's pin stays visible; the other buttons only appear on hover */
  .row:has(.icon.pinned) .actions { opacity: 1; background: transparent; }
  .row:has(.icon.pinned):not(:hover) .actions .icon:not(.pinned) { display: none; }
  .row:hover:has(.icon.pinned) .actions { background: var(--surface-2); }
  /* Leave room so names shorten with "…" instead of hiding under the buttons */
  .row:has(.icon.pinned) .who { padding-right: 30px; }
  .row:hover .who { padding-right: 100px; }
</style>
