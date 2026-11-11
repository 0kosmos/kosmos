<script lang="ts">
  import { untrack } from "svelte";
  import SignInCard from "$lib/components/SignInCard.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { account } from "$lib/account.svelte";
  import {
    fetchMyGroups, searchGroups, fetchGroup, groupPageLink,
    type GroupCard, type GroupDetail, type Person,
  } from "$lib/groups";

  // ---------- Your groups ----------
  let mine = $state<GroupCard[]>([]);
  let mineStatus = $state<"loading" | "ready" | "private" | "error" | "signed-out">("loading");

  // Load when you open the tab, and again right after you sign in here
  $effect(() => {
    const id = account.steamid;
    untrack(() => loadMine(id));
  });

  function loadMine(id: string) {
    if (!id) {
      mineStatus = "signed-out";
      mine = [];
      return;
    }
    mineStatus = "loading";
    fetchMyGroups(id)
      .then((r) => {
        if (r.private) mineStatus = "private";
        else {
          mine = r.groups;
          mineStatus = "ready";
        }
      })
      .catch(() => (mineStatus = "error"));
  }

  // ---------- Joinable groups / search ----------
  // Without a search: popular groups (Steam has no "all groups" list, so we use its search for
  // "steam", which returns the big popular groups). With a search: matches for what you typed.
  // Groups you're already in are left out of this list (they're in "Your groups").
  const BROWSE_TERM = "steam";
  let search = $state("");
  const term = $derived(search.trim());
  const searching = $derived(term.length >= 2);
  const listQuery = $derived(searching ? term : BROWSE_TERM);

  let found = $state<GroupCard[]>([]);
  let foundTotal = $state(0);
  let nextPage = $state(-1);
  let listStatus = $state<"loading" | "ready" | "error">("loading");
  let loadingMore = $state(false);

  const mineUrls = $derived(new Set(mine.map((g) => g.url.toLowerCase())));
  const isMine = (url: string) => mineUrls.has(url.toLowerCase());
  const shownList = $derived(found.filter((g) => !isMine(g.url)));

  // Depends only on what to search for; writes results it never reads
  $effect(() => {
    const q = listQuery;
    listStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(() => {
      searchGroups(q)
        .then((r) => {
          if (cancelled) return;
          found = r.items;
          foundTotal = r.total;
          nextPage = r.next;
          listStatus = "ready";
        })
        .catch(() => !cancelled && (listStatus = "error"));
    }, q === BROWSE_TERM ? 0 : 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  async function loadMore() {
    if (nextPage < 0 || loadingMore) return;
    loadingMore = true;
    const q = listQuery;
    try {
      const r = await searchGroups(q, nextPage);
      if (q !== listQuery) return;
      const seen = new Set(found.map((g) => g.url));
      found = [...found, ...r.items.filter((g) => !seen.has(g.url))];
      nextPage = r.items.length ? r.next : -1;
    } catch {
      /* keep the button */
    } finally {
      loadingMore = false;
    }
  }

  // ---------- Group details (popup) ----------
  let dialog: HTMLDialogElement | undefined = $state();
  let opened = $state<GroupCard | null>(null);
  let detail = $state<GroupDetail | null>(null);
  let detailStatus = $state<"loading" | "ready" | "error">("loading");

  function openGroup(g: GroupCard) {
    opened = g;
    detail = null;
    detailStatus = "loading";
    dialog?.showModal();
    fetchGroup(g.url)
      .then((d) => {
        if (opened?.url !== g.url) return;
        detail = d;
        detailStatus = "ready";
      })
      .catch(() => opened?.url === g.url && (detailStatus = "error"));
  }

  const join = () => opened && openUrl(groupPageLink(opened.url)).catch(() => {});
  const profile = (p: Person) =>
    openUrl(`steam://openurl/https://steamcommunity.com/profiles/${p.steamid}/`).catch(() => {});
  const fmt = (n: number) => n.toLocaleString();
</script>

<div class="page">
  <h1>Groups</h1>

  {#if !searching}
    <!-- ---------- Your groups (hidden while searching) ---------- -->
    <section>
      <h2 class="section-title">Your groups{#if mineStatus === "ready"} <span class="sub">· {mine.length}</span>{/if}</h2>
      {#if mineStatus === "loading"}
        <p class="dim">Loading your groups...</p>
      {:else if mineStatus === "signed-out"}
        <SignInCard title="Sign in to see your groups" />
      {:else if mineStatus === "private"}
        <p class="dim">Steam only shares your groups when your profile is public (Steam → profile → Edit Profile → Privacy Settings).</p>
      {:else if mineStatus === "error"}
        <p class="dim">Couldn't load your groups right now.</p>
      {:else if mine.length === 0}
        <p class="dim">You're not in any Steam groups yet. Find some below.</p>
      {:else}
        <div class="grid">
          {#each mine as g (g.url)}
            <button class="card" onclick={() => openGroup(g)}>
              <img class="avatar" src={g.avatar} alt="" loading="lazy" decoding="async" />
              <span class="info">
                <span class="name">{g.name}</span>
                <span class="members">{fmt(g.members)} members</span>
                {#if g.headline}<span class="summary">{g.headline}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- ---------- Search ---------- -->
  <input class="search" type="search" placeholder="Search Steam groups..." bind:value={search} />

  <!-- ---------- Joinable groups / search results ---------- -->
  <section>
    <h2 class="section-title">
      {#if searching}Results for "{term}"{:else}Joinable groups <span class="sub">· popular on Steam</span>{/if}
      {#if searching && listStatus === "ready"}<span class="sub">· {fmt(foundTotal)} on Steam</span>{/if}
    </h2>
    {#if listStatus === "loading" && !found.length}
      <p class="dim">{searching ? "Searching..." : "Loading groups..."}</p>
    {:else if listStatus === "error"}
      <p class="dim">Couldn't load groups right now.</p>
    {:else if shownList.length === 0}
      <p class="dim">{searching ? "No groups found." : "No groups to show right now."}</p>
    {:else}
      <div class="grid" class:faded={listStatus === "loading"}>
        {#each shownList as g (g.url)}
          <button class="card" onclick={() => openGroup(g)}>
            <img class="avatar" src={g.avatar} alt="" loading="lazy" decoding="async" />
            <span class="info">
              <span class="name">{g.name}</span>
              <span class="members">{fmt(g.members)} members</span>
              {#if g.summary}<span class="summary">{g.summary}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      {#if nextPage > 0}
        <button class="more" onclick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more"}</button>
      {/if}
    {/if}
  </section>
</div>

<!-- ---------- Group details ---------- -->
<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog?.close()} onclose={() => (opened = null)} aria-label={opened?.name ?? "Group"}>
  {#if opened}
    <div class="sheet">
      <button class="x close" onclick={() => dialog?.close()} aria-label="Close">✕</button>

      <div class="top">
        <img class="big-avatar" src={detail?.avatar || opened.avatar} alt="" />
        <div class="title">
          <h2>{detail?.name || opened.name}</h2>
          {#if detail?.headline}<p class="headline">{detail.headline}</p>{/if}
          <!-- Already a member: just open it; otherwise join it there -->
          <button class="join" onclick={join}>{isMine(opened.url) ? "View on Steam" : "Join on Steam"}</button>
        </div>
      </div>

      {#if detailStatus === "loading"}
        <p class="dim">Loading group...</p>
      {:else if detailStatus === "error" || !detail}
        <p class="dim">Couldn't load this group's details. You can still open it on Steam.</p>
      {:else}
        <div class="stats">
          <div><strong>{fmt(detail.members)}</strong><span class="dim">Members</span></div>
          <div><strong class="on">{fmt(detail.online)}</strong><span class="dim">Online</span></div>
          <div><strong class="game">{fmt(detail.inGame)}</strong><span class="dim">In game</span></div>
          <div><strong>{fmt(detail.inChat)}</strong><span class="dim">In chat</span></div>
        </div>

        {#if detail.summary}
          <h3>About</h3>
          <p class="about">{detail.summary}</p>
        {/if}

        {#each [["Administrators", detail.admins], ["Moderators", detail.mods]] as [label, people]}
          {#if (people as Person[]).length}
            <h3>{label} <span class="sub">· {(people as Person[]).length}</span></h3>
            <div class="people">
              {#each people as Person[] as p (p.steamid)}
                <button class="person" onclick={() => profile(p)} title="Open Steam profile">
                  <span class="pa" class:online={p.online}>{#if p.avatar}<img src={p.avatar} alt="" loading="lazy" />{/if}</span>
                  <span class="pname">{p.name || "Steam user"}</span>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .page { max-width: 1400px; }
  .search { display: block; width: 100%; max-width: 420px; margin: 4px 0 14px; }
  .grid.faded { opacity: 0.55; transition: opacity 0.15s; }
  h1 { margin: 0 0 16px; font-size: 1.6rem; font-weight: 700; }
  .dim { color: var(--text-dim); margin: 0; }
  .sub { font-weight: 400; color: var(--text-dim); text-transform: none; letter-spacing: 0; }
  section { margin-bottom: 24px; }
  .section-title {
    margin: 0 0 10px; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-dim);
  }

  /* ---------- Group cards ---------- */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .card {
    display: flex; gap: 12px; align-items: flex-start; padding: 10px; text-align: left; color: inherit;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .card:hover { border-color: var(--accent); background: var(--surface-2); transform: translateY(var(--lift)); }
  .avatar { width: 56px; height: 56px; border-radius: var(--radius-sm); flex-shrink: 0; background: var(--surface-2); object-fit: cover; }
  .info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .members { font-size: var(--fs-sm); color: var(--text-dim); }
  .summary {
    font-size: 0.78rem; color: var(--text-dim); line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .more {
    margin-top: 14px; width: 100%; padding: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text-dim); transition: color 0.15s, border-color 0.15s;
  }
  .more:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }

  /* ---------- Details popup ---------- */
  dialog {
    width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 64px); padding: 0; overflow: auto;
    border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text);
  }
  dialog[open] { animation: pop 0.16s ease-out; }
  dialog::backdrop { background: var(--scrim); backdrop-filter: blur(4px); }
  :global(:root[data-motion="reduced"]) dialog::backdrop { backdrop-filter: none; }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }
  .sheet { position: relative; padding: 20px; }
  .x { width: 30px; height: 30px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .close { position: absolute; top: 12px; right: 12px; z-index: 2; }

  .top { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; padding-right: 36px; }
  .big-avatar { width: 112px; height: 112px; border-radius: var(--radius); flex-shrink: 0; object-fit: cover; background: var(--surface-2); }
  .title { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .title h2 { margin: 0; font-size: 1.3rem; line-height: 1.25; }
  .headline { margin: 0; color: var(--text-dim); }
  .join {
    align-self: flex-start; margin-top: 6px; height: 38px; padding: 0 18px; border-radius: var(--radius);
    background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent); font-weight: 700;
  }
  .join:hover { filter: brightness(1.1); }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: var(--surface-2); border-radius: var(--radius-sm); }
  .stats strong { font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  .stats .dim { font-size: 0.75rem; }
  .on { color: var(--accent); }
  .game { color: var(--good); }

  h3 { margin: 16px 0 8px; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  .about { margin: 0; white-space: pre-wrap; line-height: 1.55; font-size: var(--fs-md); }

  .people { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; }
  .person {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px; text-align: left; color: inherit;
    background: var(--surface-2); border: 1px solid transparent; border-radius: var(--radius-sm);
  }
  .person:hover { border-color: var(--border); }
  .pa { width: 30px; height: 30px; border-radius: 50%; padding: 2px; background: var(--border); flex-shrink: 0; }
  .pa.online { background: var(--accent); }
  .pa img { width: 100%; height: 100%; border-radius: 50%; display: block; }
  .pname { font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
