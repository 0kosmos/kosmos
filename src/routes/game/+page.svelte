<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { library } from "$lib/library.svelte";
  import { fetchGameInfo, type GameInfo } from "$lib/gameInfo";

  const appid = $derived(Number(page.url.searchParams.get("id")));
  const mine = $derived(library.games.find((g) => g.appid === appid));

  let info = $state<GameInfo | null>(null);
  let status = $state<"loading" | "ready" | "error">("loading");
  let shot = $state(0);
  let playError = $state("");

  $effect(() => {
    const id = appid;
    info = null;
    status = "loading";
    shot = 0;
    playError = "";
    reqTab = "min";
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
    try {
      await openUrl(`steam://run/${appid}`);
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
        <h1>{title}</h1>
        {#if info.available}
          {#if info.genres?.length}
            <div class="chips">
              {#each info.genres as g}<span>{g}</span>{/each}
            </div>
          {/if}
        {:else}
          <p class="dim">This game has no Steam store page (it may have been removed).</p>
        {/if}
        <div class="actions">
          <button class="play" onclick={play}>▶ Play</button>
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

          {#if info.reviews && info.reviews.total > 0}
            <section>
              <h2>Reviews</h2>
              <p class="summary">
                <strong>{info.reviews.summary}</strong>
                <span class="dim">
                  · {pct}% positive · {info.reviews.total.toLocaleString()} reviews
                </span>
              </p>
              <div class="reviews">
                {#each info.reviews.list as r}
                  <article class="review">
                    <div class="rhead">
                      <strong class:good={r.positive} class:bad={!r.positive}>
                        {r.positive ? "Recommended" : "Not recommended"}
                      </strong>
                      <span class="dim">{r.hours} h on record</span>
                    </div>
                    <p class="text clamp">{r.text}</p>
                  </article>
                {/each}
              </div>
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
  .play {
    background: var(--accent); color: var(--on-accent); border: none;
    border-radius: var(--radius); padding: 10px 28px; font-weight: 700; font-size: 1rem;
  }
  .play:hover { filter: brightness(1.1); }
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
  .rhead { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .clamp { display: -webkit-box; -webkit-line-clamp: 6; line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
</style>