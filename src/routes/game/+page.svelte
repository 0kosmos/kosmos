<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { library } from "$lib/library.svelte";
  import { fetchGameInfo, fetchReviews, type GameInfo, type Review } from "$lib/gameInfo";
  import NewsRow from "$lib/components/NewsRow.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { playing } from "$lib/playing.svelte";
  import { playAndTime, showLaunchTip, hideLaunchTip } from "$lib/launchTime.svelte";

  // ---------- Installed / updating state (read from Steam's registry entry) ----------
  type AppState = { installed: boolean; updating: boolean; running: boolean };
  let appState = $state<AppState | null>(null);

  async function refreshAppState() {
    const id = appid;
    if (!id) return;
    try {
      const s = await invoke<AppState>("steam_app_state", { appid: id });
      if (id === appid) appState = s;
    } catch {
      appState = null; // unknown: we just show Play
    }
  }

  // Check when the game opens, when you come back to the window (e.g. after installing
  // in Steam), and when a game starts or stops. No polling.
  $effect(() => {
    appid;
    appState = null; // new game: forget the old one's state
    refreshAppState();
    const onFocus = () => refreshAppState();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  // A game started or stopped: re-read (e.g. an update may have finished), without clearing first
  $effect(() => {
    playing.appid;
    refreshAppState();
  });

  async function steamLink(link: string) {
    playError = "";
    try {
      await openUrl(link);
    } catch {
      playError = "Couldn't open Steam. Is Steam installed on this PC?";
    }
  }

  const appid = $derived(Number(page.url.searchParams.get("id")));
  const mine = $derived(library.games.find((g) => g.appid === appid));

  // "Running" follows the live signal the sidebar uses, so it disappears as soon as the game closes
  const isRunning = $derived(!!appid && playing.appid === appid);

  let info = $state<GameInfo | null>(null);
  let status = $state<"loading" | "ready" | "error">("loading");
  let shot = $state(0);
  let playError = $state("");
  let allTags = $state(false); // "+N more" tags expanded

  $effect(() => {
    const id = appid;
    info = null;
    status = "loading";
    shot = 0;
    playError = "";
    reqTab = "min";
    allTags = false;
    if (!id) {
      status = "error";
      return;
    }
    let cancelled = false;
    fetchGameInfo(id)
      .then((r) => {
        if (cancelled) return;
        info = r;
        status = "ready";
      })
      .catch(() => {
        if (!cancelled) status = "error";
      });
    return () => {
      cancelled = true;
    };
  });

  // ---------- Reviews (10 at a time, with reviewer name and avatar) ----------
  let reviews = $state<Review[]>([]);
  let cursor = $state<string | null>(null);
  let revStatus = $state<"loading" | "ready" | "error">("loading");
  let loadingMore = $state(false);

  $effect(() => {
    const id = appid;
    reviews = [];
    cursor = null;
    revStatus = "loading";
    if (!id) return;
    let cancelled = false;
    fetchReviews(id)
      .then((p) => {
        if (cancelled) return;
        reviews = p.list;
        cursor = p.cursor;
        revStatus = "ready";
      })
      .catch(() => {
        if (!cancelled) revStatus = "error";
      });
    return () => {
      cancelled = true;
    };
  });

  async function showMore() {
    if (!cursor || loadingMore) return;
    const id = appid;
    loadingMore = true;
    try {
      const p = await fetchReviews(id, cursor);
      if (id !== appid) return; // user opened another game meanwhile
      const seen = new Set(reviews.map((r) => r.id));
      reviews = [...reviews, ...p.list.filter((r) => !seen.has(r.id))];
      cursor = p.cursor;
    } catch {
      /* keep the button so they can try again */
    } finally {
      loadingMore = false;
    }
  }

  // If the new reviews request fails, fall back to the few reviews that came with the game page
  const shownReviews = $derived<Review[]>(
    revStatus === "error"
      ? (info?.reviews?.list ?? []).map((r, i) => ({
          ...r, id: String(i), steamid: "", name: "", avatar: "", date: 0,
        }))
      : reviews
  );

  function openProfile(steamid: string) {
    if (/^\d{17}$/.test(steamid)) openUrl(`https://steamcommunity.com/profiles/${steamid}/`).catch(() => {});
  }

  function fmtDate(ms: number) {
    return ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  }

  const title = $derived(info?.name ?? mine?.name ?? "Game");
  const shots = $derived(info?.screenshots ?? []);
  const pct = $derived(
    info?.reviews && info.reviews.total > 0
      ? Math.round((info.reviews.positive / info.reviews.total) * 100)
      : null
  );

  // ---------- System requirements ----------
  // Steam sends them as text lines like "OS: 64-bit Windows 10".
  // We turn each line into a label + value row; lines without a label become notes.
  type Req = { rows: { label: string; value: string }[]; notes: string[] };

  function parseReq(text = ""): Req | null {
    const rows: Req["rows"] = [];
    const notes: string[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || /^(minimum|recommended):?$/i.test(line)) continue;
      const m = /^([^:]{1,30}):\s*(.+)$/.exec(line);
      if (m) rows.push({ label: m[1], value: m[2] });
      else notes.push(line);
    }
    return rows.length || notes.length ? { rows, notes } : null;
  }

  const reqMin = $derived(parseReq(info?.requirements?.minimum));
  const reqRec = $derived(parseReq(info?.requirements?.recommended));
  let reqTab = $state<"min" | "rec">("min");
  const req = $derived(reqTab === "rec" && reqRec ? reqRec : (reqMin ?? reqRec));

  function back() {
    if (history.length > 1) history.back();
    else goto("/");
  }

  async function play() {
    playError = "";
    hideLaunchTip();
    try {
      await playAndTime(appid); // starts it through Steam and times how long it takes to appear
    } catch {
      playError = "Couldn't start Steam. Is Steam installed on this PC?";
    }
  }
</script>

<div class="wrap">
  <button class="back" onclick={back}>← Library</button>

  {#if status === "loading"}
    <h1>{title}</h1>
    <p class="dim">Loading game page...</p>
  {:else if status === "error"}
    <h1>{title}</h1>
    <p class="dim">Couldn't load the game details. Check your connection and go back to try again.</p>
    <div class="actions">
      <button class="play" onclick={play}>▶ Play</button>
      {#if playError}<span class="err">{playError}</span>{/if}
    </div>
  {:else if info}
    <header class="top">
      {#if info.header}
        <img class="hero" src={info.header} alt="" />
      {/if}
      <div class="meta">
        <div class="title-row">
          <h1>{title}</h1>
          {#if isRunning}
            <span class="badge running"><span class="dot" aria-hidden="true"></span>Running</span>
          {/if}
        </div>
        {#if info.available}
          <!-- Steam's popular tags (falls back to genres if Steam sent no tags) -->
          {@const tags = info.tags?.length ? info.tags : (info.genres ?? [])}
          {#if tags.length}
            <div class="chips">
              {#each allTags ? tags : tags.slice(0, 10) as t}<span>{t}</span>{/each}
              {#if tags.length > 10}
                <button class="chip-more" onclick={() => (allTags = !allTags)}>
                  {allTags ? "Show less" : `+${tags.length - 10}`}
                </button>
              {/if}
            </div>
          {/if}
        {:else}
          <p class="dim">This game has no Steam store page (it may have been removed).</p>
        {/if}
        <div class="actions">
          {#if appState && !appState.installed}
            <button class="play" onclick={() => steamLink(`steam://install/${appid}`)}>⬇ Install</button>
          {:else}
            <button
              class="play"
              onclick={play}
              onpointerenter={(e) => showLaunchTip(appid, e.currentTarget)}
              onpointerleave={hideLaunchTip}
            >▶ Play</button>
          {/if}

          {#if appState?.installed}
            <button
              class="secondary"
              onclick={() => steamLink("steam://nav/downloads")}
              title="Opens Steam's Downloads page, where updates are queued and started"
            >
              Check for updates
            </button>
          {/if}

          <button
            class="secondary"
            onclick={() => steamLink(`steam://openurl/https://store.steampowered.com/app/${appid}/`)}
            title="Opens this game's store page in the Steam client"
          >
            Store page ↗
          </button>

          {#if mine}
            <button
              class="secondary"
              onclick={() => steamLink(`steam://openurl/https://store.steampowered.com/recommended/recommendgame/${appid}`)}
              title="Opens the review page in the Steam client"
            >
              ✎ Write a review
            </button>
          {/if}

          {#if appState?.updating}
            <span class="badge">Steam is updating this game</span>
          {/if}
          {#if mine}<span class="dim">{mine.hours} h played</span>{/if}
          {#if playError}<span class="err">{playError}</span>{/if}
        </div>
      </div>
    </header>

    {#if info.available}
      <div class="layout">
        <!-- ---------- Left: main content ---------- -->
        <div class="main">
          {#if shots.length}
            <section>
              <img class="shot" src={shots[shot].full} alt="Screenshot {shot + 1}" />
              <div class="thumbs">
                {#each shots as s, i}
                  <button class:on={i === shot} onclick={() => (shot = i)} aria-label="Screenshot {i + 1}">
                    <img src={s.thumb} alt="" loading="lazy" decoding="async" />
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          {#if info.shortDescription}
            <section>
              <h2>About</h2>
              <p class="text">{info.shortDescription}</p>
            </section>
          {/if}

          <section>
            <h2>Latest updates</h2>
            <NewsRow {appid} fallbackImage={info.header} />
          </section>

          {#if info.reviews && info.reviews.total > 0}
            <section>
              <h2>Reviews</h2>
              <p class="summary">
                <strong>{info.reviews.summary}</strong>
                <span class="dim">
                  · {pct}% positive · {info.reviews.total.toLocaleString()} reviews
                </span>
              </p>
              {#if revStatus === "loading"}
                <p class="dim">Loading reviews...</p>
              {/if}
              <div class="reviews">
                {#each shownReviews as r (r.id)}
                  <article class="review">
                    <div class="author">
                      {#if r.avatar}
                        <img class="avatar" src={r.avatar} alt="" loading="lazy" decoding="async" />
                      {:else}
                        <span class="avatar blank" aria-hidden="true"></span>
                      {/if}
                      <div class="who">
                        <span class="name">{r.name || "Steam user"}</span>
                        <span class="dim small">
                          {r.hours} h on record{r.date ? " · " + fmtDate(r.date) : ""}
                        </span>
                      </div>
                      {#if r.steamid}
                        <button
                          class="profile"
                          onclick={() => openProfile(r.steamid)}
                          title="Open Steam profile"
                          aria-label={"Open " + (r.name || "reviewer") + "'s Steam profile"}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </button>
                      {/if}
                    </div>
                    <div class="verdict" class:good={r.positive} class:bad={!r.positive}>
                      {r.positive ? "👍 Recommended" : "👎 Not recommended"}
                      {#if r.helpful}<span class="dim small"> · {r.helpful.toLocaleString()} found this helpful</span>{/if}
                    </div>
                    <p class="text clamp">{r.text}</p>
                    {#if r.hardware}
                      <!-- PC specs the reviewer chose to share on Steam -->
                      <dl class="specs">
                        {#if r.hardware.os}<dt>OS</dt><dd>{r.hardware.os}</dd>{/if}
                        {#if r.hardware.cpu}<dt>CPU</dt><dd>{r.hardware.cpu}</dd>{/if}
                        {#if r.hardware.gpu}<dt>GPU</dt><dd>{r.hardware.gpu}{r.hardware.vram ? ` (${r.hardware.vram})` : ""}</dd>{/if}
                        {#if r.hardware.ram}<dt>RAM</dt><dd>{r.hardware.ram}</dd>{/if}
                      </dl>
                    {:else if r.deck}
                      <p class="dim small deck">Played on Steam Deck</p>
                    {/if}
                  </article>
                {/each}
              </div>
              {#if revStatus === "ready" && cursor}
                <button class="more" onclick={showMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Show more reviews"}
                </button>
              {/if}
            </section>
          {/if}
        </div>

        <!-- ---------- Right: info cards ---------- -->
        <aside class="side">
          <div class="card">
            <h3>Details</h3>
            <dl>
              {#if info.developers?.length}
                <dt>Developer</dt><dd>{info.developers.join(", ")}</dd>
              {/if}
              {#if info.publishers?.length}
                <dt>Publisher</dt><dd>{info.publishers.join(", ")}</dd>
              {/if}
              {#if info.releaseDate}
                <dt>Released</dt><dd>{info.releaseDate}</dd>
              {/if}
              {#if pct !== null}
                <dt>Reviews</dt><dd>{pct}% positive</dd>
              {/if}
            </dl>
          </div>

          {#if req}
            <div class="card">
              <div class="card-head">
                <h3>System requirements</h3>
                {#if reqMin && reqRec}
                  <div class="segmented" role="radiogroup" aria-label="Requirements level">
                    <button role="radio" aria-checked={reqTab === "min"} onclick={() => (reqTab = "min")}>Minimum</button>
                    <button role="radio" aria-checked={reqTab === "rec"} onclick={() => (reqTab = "rec")}>Recommended</button>
                  </div>
                {/if}
              </div>
              {#each req.notes as note}
                <p class="note">{note}</p>
              {/each}
              <dl>
                {#each req.rows as row}
                  <dt>{row.label}</dt><dd>{row.value}</dd>
                {/each}
              </dl>
            </div>
          {/if}
        </aside>
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap { max-width: 1180px; container-type: inline-size; }

  /* Two columns on wide windows, one column (cards below) on narrow ones */
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 28px; align-items: start; }
  .side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 0; }
  @container (max-width: 760px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .side { position: static; }
  }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px 16px;
  }
  .card-head { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  h3 {
    margin: 0 0 10px; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  .card-head h3 { margin: 0; }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font-size: var(--fs-sm); }
  dt { color: var(--text-dim); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .note { margin: 0 0 10px; font-size: var(--fs-sm); color: var(--text-dim); font-style: italic; }

  .segmented {
    display: flex; gap: 2px; padding: 2px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .segmented button {
    flex: 1; padding: 5px 8px; border: none; border-radius: 4px; font-size: var(--fs-sm);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .segmented button:hover { color: var(--text); }
  .segmented button[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }
  .back {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 12px;
    color: var(--text-dim);
    margin-bottom: 20px;
  }
  .back:hover { color: var(--text); background: var(--surface-2); }
  h1 { margin: 0 0 6px; font-size: 1.9rem; font-weight: 700; line-height: 1.2; }
  h2 { margin: 0 0 10px; font-size: 1.1rem; font-weight: 600; }
  .dim { color: var(--text-dim); margin: 0; }
  .err { color: var(--bad); }
  .top {
    display: flex; gap: 24px; align-items: center; margin-bottom: 28px; flex-wrap: wrap;
    padding-bottom: 24px; border-bottom: 1px solid var(--border);
  }
  .hero { width: 340px; max-width: 100%; border-radius: var(--radius); display: block; border: 1px solid var(--border); }
  .meta { flex: 1; min-width: 260px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .chips span {
    font-size: 0.8rem; padding: 3px 10px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .actions { display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap; }
  /* Play / Install / Updates / Write a review: all the same size */
  .play, .secondary {
    height: 42px; min-width: 150px; padding: 0 22px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border-radius: var(--radius); font-weight: 700; font-size: 1rem; white-space: nowrap;
  }
  .play { background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent); }
  .play:hover { filter: brightness(1.1); }
  .secondary {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    transition: border-color 0.15s;
  }
  .title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  .title-row h1 { margin: 0; }
  .badge.running {
    display: inline-flex; align-items: center; gap: 6px; font-weight: 600;
    background: color-mix(in srgb, var(--good) 18%, transparent);
  }
  .badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); }
  .chip-more {
    font-size: 0.8rem; padding: 3px 10px; border-radius: 999px;
    background: transparent; border: 1px dashed var(--border); color: var(--text-dim);
  }
  .chip-more:hover { color: var(--text); border-color: var(--text-dim); }
  .secondary:hover { border-color: var(--text-dim); }
  .badge {
    font-size: var(--fs-sm); padding: 4px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--text);
  }
  section { margin-bottom: 28px; }
  .shot { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--radius); display: block; background: var(--surface); }
  .thumbs { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 6px; }
  .thumbs button {
    flex: 0 0 auto; width: 120px; aspect-ratio: 16 / 9; padding: 0;
    border: 2px solid transparent; border-radius: 8px; overflow: hidden; background: var(--surface); opacity: 0.6;
  }
  .thumbs button.on { border-color: var(--accent); opacity: 1; }
  .thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .text { white-space: pre-wrap; line-height: 1.55; margin: 0; }
  .summary { margin: 0 0 12px; }
  .reviews { display: flex; flex-direction: column; gap: 10px; }
  .review { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
  .author { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: block; background: var(--surface-2); }
  .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .name { font-weight: 600; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .small { font-size: var(--fs-sm); }
  .profile {
    flex-shrink: 0; width: 30px; height: 30px; display: grid; place-items: center;
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text-dim); transition: color 0.15s, border-color 0.15s;
  }
  .profile:hover { color: var(--text); border-color: var(--text-dim); }
  .specs {
    margin-top: 10px; padding: 8px 10px; background: var(--surface-2); border-radius: var(--radius-sm);
    grid-template-columns: auto 1fr; gap: 3px 12px;
  }
  .deck { margin-top: 8px; }
  .verdict { font-weight: 600; font-size: var(--fs-md); margin-bottom: 6px; }
  .verdict .dim { font-weight: 400; }
  .more {
    margin-top: 12px; width: 100%; padding: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text-dim); transition: color 0.15s, border-color 0.15s;
  }
  .more:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }
  .more:disabled { opacity: 0.6; cursor: default; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .clamp { display: -webkit-box; -webkit-line-clamp: 6; line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
</style>