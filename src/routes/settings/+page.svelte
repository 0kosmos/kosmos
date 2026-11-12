<script lang="ts">
  import { openWelcome } from "$lib/welcome.svelte";
  import {
    settings,
    toggleTab,
    moveTab,
    setReduceMotion,
    setLiveStats,
    setLibrarySource,
    setStoreEpic,
    setCloseToTray,
    setTheme,
    setAccent,
    setStatusBar,
    setShowVideos,
    setDiscordActivity,
    setTimeZone,
    ACCENTS,
    setStoreRegion,
    toggleStoreExclude,
    setStorePlatform,
    type StorePlatform,
  } from "$lib/settings.svelte";
  import { view, saveView } from "$lib/libraryView.svelte";
  import { TABS } from "$lib/tabs";

  // ---------- Categories (buttons on top) ----------
  const CATEGORIES = [
    { id: "general", label: "General" },
    { id: "library", label: "Library" },
    { id: "store", label: "Store" },
    { id: "performance", label: "Performance" },
    { id: "system", label: "System" },
  ] as const;
  type CatId = (typeof CATEGORIES)[number]["id"];

  const CAT_KEY = "kosmos-settings-category";
  let cat = $state<CatId>(
    (() => {
      try {
        const saved = localStorage.getItem(CAT_KEY);
        return CATEGORIES.some((c) => c.id === saved) ? (saved as CatId) : "general";
      } catch {
        return "general";
      }
    })()
  );
  function choose(id: CatId) {
    cat = id;
    try {
      localStorage.setItem(CAT_KEY, id);
    } catch {
      /* ignore */
    }
  }

  // ---------- General ----------
  const rows = $derived(settings.order.map((id) => TABS.find((t) => t.id === id)!));

  // ---------- Library ----------
  const NEWS_KEY = "kosmos-library-news-collapsed";
  let newsShown = $state(
    (() => {
      try {
        return localStorage.getItem(NEWS_KEY) !== "1";
      } catch {
        return true;
      }
    })()
  );
  function toggleNews() {
    newsShown = !newsShown;
    try {
      localStorage.setItem(NEWS_KEY, newsShown ? "0" : "1");
    } catch {
      /* ignore */
    }
  }
  function toggleFilterPanel() {
    view.showFilters = !view.showFilters;
    saveView();
  }

  // ---------- Store ----------
  // On Steam the currency comes from the store region, so one setting covers both
  const REGIONS: [string, string][] = [
    ["", "Automatic (where you are)"],
    ["US", "United States · US Dollar ($)"],
    ["GB", "United Kingdom · Pound (£)"],
    ["DE", "Germany · Euro (€)"],
    ["FR", "France · Euro (€)"],
    ["IT", "Italy · Euro (€)"],
    ["ES", "Spain · Euro (€)"],
    ["NL", "Netherlands · Euro (€)"],
    ["PL", "Poland · Złoty (zł)"],
    ["NO", "Norway · Krone (kr)"],
    ["CH", "Switzerland · Franc (CHF)"],
    ["UA", "Ukraine · Hryvnia (₴)"],
    ["TR", "Turkey · US Dollar ($)"],
    ["CA", "Canada · Canadian Dollar (CA$)"],
    ["MX", "Mexico · Peso (Mex$)"],
    ["BR", "Brazil · Real (R$)"],
    ["AR", "Argentina · US Dollar ($)"],
    ["AU", "Australia · Australian Dollar (A$)"],
    ["NZ", "New Zealand · NZ Dollar (NZ$)"],
    ["JP", "Japan · Yen (¥)"],
    ["KR", "South Korea · Won (₩)"],
    ["CN", "China · Yuan (¥)"],
    ["IN", "India · Rupee (₹)"],
    ["ID", "Indonesia · Rupiah (Rp)"],
    ["SG", "Singapore · Singapore Dollar (S$)"],
    ["ZA", "South Africa · Rand (R)"],
    ["AE", "United Arab Emirates · Dirham (AED)"],
  ];

  const PLATFORMS: [StorePlatform, string][] = [
    ["any", "Any"],
    ["windows", "Windows"],
    ["mac", "macOS"],
    ["linux", "Linux / SteamOS"],
    ["deck", "Steam Deck"],
  ];

  // Steam's own mature-content descriptors (same choices as the Steam store's content settings)
  const CONTENT: [number, string, string][] = [
    [1, "Some Nudity or Sexual Content", "Games with occasional nudity or sexual content"],
    [4, "Frequent Nudity or Sexual Content", "Games where nudity or sexual content is common"],
    [3, "Adult Only Sexual Content", "Explicit sexual content (adults only)"],
    [2, "Frequent Violence or Gore", "Games with a lot of violence or gore"],
    [5, "General Mature Content", "Other mature themes, suitable for adults only"],
  ];

  // Every time zone this PC knows (e.g. "Europe/Rome"), for the status bar clock
  const TIME_ZONES: string[] = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  })();
</script>

<h1>Settings</h1>

<!-- Category buttons -->
<nav class="cats" aria-label="Settings categories">
  {#each CATEGORIES as c}
    <button class="cat" class:on={cat === c.id} aria-current={cat === c.id ? "page" : undefined} onclick={() => choose(c.id)}>
      {c.label}
    </button>
  {/each}
</nav>

{#if cat === "general"}
  <section>
    <h2>Appearance</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Theme</strong>
          <p class="dim">Black is the default. White is easier to read in bright rooms.</p>
        </div>
        <div class="segmented" role="radiogroup" aria-label="Theme">
          <button role="radio" aria-checked={settings.theme === "dark"} onclick={() => setTheme("dark")}>Black</button>
          <button role="radio" aria-checked={settings.theme === "light"} onclick={() => setTheme("light")}>White</button>
        </div>
      </div>
      <div class="row">
        <div>
          <strong>Accent color</strong>
          <p class="dim">Color of buttons, switches and links. Mono matches the logo.</p>
        </div>
        <div class="swatches" role="radiogroup" aria-label="Accent color">
          {#each ACCENTS as a (a.id)}
            <button
              class="swatch"
              data-accent={a.id}
              role="radio"
              aria-checked={settings.accent === a.id}
              aria-label={a.label}
              title={a.label}
              onclick={() => setAccent(a.id)}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Welcome setup</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Show the welcome setup again</strong>
          <p class="dim">The quick setup Kosmos shows the first time it starts.</p>
        </div>
        <button class="ghost-btn" onclick={openWelcome}>Show</button>
      </div>
    </div>
  </section>

  <section>
    <h2>Discord</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Show activity on Discord</strong>
          <p class="dim">
            While Kosmos is open, Discord shows it in your activity with what you're looking at,
            like "Browsing the library". Needs the Discord app running on this PC.
          </p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.discordActivity} aria-label="Show activity on Discord" onclick={() => setDiscordActivity(!settings.discordActivity)}>
          <span class="knob"></span>
        </button>
      </div>
    </div>
  </section>

  <section>
    <h2>Status bar</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Show status bar</strong>
          <p class="dim">The thin bar at the bottom: time, Kosmos's version, and how much CPU and memory Kosmos uses.</p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.statusBar} aria-label="Show status bar" onclick={() => setStatusBar(!settings.statusBar)}>
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <div>
          <strong>Time zone</strong>
          <p class="dim">Which time the status bar shows. Automatic uses this PC's time.</p>
        </div>
        <select value={settings.timeZone} onchange={(e) => setTimeZone(e.currentTarget.value)} aria-label="Time zone">
          <option value="">Automatic (this PC)</option>
          {#each TIME_ZONES as z (z)}<option value={z}>{z.replace(/_/g, " ")}</option>{/each}
        </select>
      </div>
    </div>
  </section>

  <section>
    <h2>Sidebar</h2>
    <p class="dim intro">Turn tabs on or off and change their order. Library is always on. You can also drag tabs in the sidebar.</p>
    <div class="group">
      {#each rows as tab, i (tab.id)}
        <div class="row tab">
          <span class:off={!settings.enabled[tab.id]}>{tab.label}</span>
          <div class="controls">
            <button class="arrow" onclick={() => moveTab(tab.id, -1)} disabled={i === 0} aria-label={"Move " + tab.label + " up"}>↑</button>
            <button class="arrow" onclick={() => moveTab(tab.id, 1)} disabled={i === rows.length - 1} aria-label={"Move " + tab.label + " down"}>↓</button>
            <button
              class="switch"
              role="switch"
              aria-checked={settings.enabled[tab.id]}
              aria-label={"Show " + tab.label}
              disabled={tab.id === "library"}
              onclick={() => toggleTab(tab.id)}
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  </section>
{:else if cat === "library"}
  <section>
    <h2>Launchers</h2>
    <p class="dim intro">Which games show in your Library (also in the Library's filter panel). Turning one off only hides its games in Kosmos.</p>
    <div class="group">
      <div class="row">
        <div>
          <strong>Steam</strong>
          <p class="dim">All the games on your Steam account, installed or not.</p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.librarySteam} aria-label="Show Steam games" onclick={() => setLibrarySource("steam", !settings.librarySteam)}>
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <div>
          <strong>Epic Games</strong>
          <p class="dim">Your Epic Games library, installed or not. Read from the Epic Games Launcher on this PC, so it updates when the launcher runs.</p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.libraryEpic} aria-label="Show Epic Games games" onclick={() => setLibrarySource("epic", !settings.libraryEpic)}>
          <span class="knob"></span>
        </button>
      </div>
    </div>
  </section>

  <section>
    <h2>Library</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>News and updates</strong>
          <p class="dim">The row of latest news for your recently played games, at the top of the Library.</p>
        </div>
        <button class="switch" role="switch" aria-checked={newsShown} aria-label="Show news and updates" onclick={toggleNews}>
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <div>
          <strong>Filter panel</strong>
          <p class="dim">The Status and Tags filters on the left of the Library. You can also use the Filters button there.</p>
        </div>
        <button class="switch" role="switch" aria-checked={view.showFilters} aria-label="Show filter panel" onclick={toggleFilterPanel}>
          <span class="knob"></span>
        </button>
      </div>
    </div>
  </section>
{:else if cat === "store"}
  <section>
    <h2>Epic Games</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Free games on Epic Games</strong>
          <p class="dim">This week's free games on the Epic Games Store, and next week's, at the top of the Store. Same as the Epic Games checkbox in the Store.</p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.storeEpicFree} aria-label="Show Epic Games free games" onclick={() => setStoreEpic(!settings.storeEpicFree)}>
          <span class="knob"></span>
        </button>
      </div>
    </div>
  </section>

  <section>
    <h2>Region and currency</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Store region</strong>
          <p class="dim">
            Sets the currency and prices shown in the Store. When you buy, Steam always charges in
            your Steam account's own region and currency.
          </p>
        </div>
        <select value={settings.storeRegion} onchange={(e) => setStoreRegion(e.currentTarget.value)} aria-label="Store region">
          {#each REGIONS as [code, label]}<option value={code}>{label}</option>{/each}
        </select>
      </div>
    </div>
  </section>

  <section>
    <h2>Platform</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Only show games that run on</strong>
          <p class="dim">Steam Deck means Verified or Playable on Steam Deck.</p>
        </div>
        <select value={settings.storePlatform} onchange={(e) => setStorePlatform(e.currentTarget.value as StorePlatform)} aria-label="Platform">
          {#each PLATFORMS as [value, label]}<option {value}>{label}</option>{/each}
        </select>
      </div>
    </div>
  </section>

  <section>
    <h2>Mature content</h2>
    <p class="dim intro">Ticked content is hidden from the Store (deals, browse and search), like Steam's own store settings.</p>
    <div class="group">
      {#each CONTENT as [id, label, desc]}
        <label class="row check">
          <div>
            <strong>Hide: {label}</strong>
            <p class="dim">{desc}</p>
          </div>
          <input type="checkbox" checked={settings.storeExclude.includes(id)} onchange={() => toggleStoreExclude(id)} />
        </label>
      {/each}
    </div>
  </section>
{:else if cat === "performance"}
  <section>
    <h2>Performance</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>Reduce motion</strong>
          <p class="dim">Turns off animations and effects. Recommended for older PCs.</p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.reduceMotion} aria-label="Reduce motion" onclick={() => setReduceMotion(!settings.reduceMotion)}>
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <div>
          <strong>Live game stats</strong>
          <p class="dim">
            Shows the running game's CPU, GPU and memory use in the sidebar. Only checked every 2
            seconds while Kosmos is open on screen, never in the background.
          </p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.liveStats} aria-label="Live game stats" onclick={() => setLiveStats(!settings.liveStats)}>
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <div>
          <strong>Trailers and videos</strong>
          <p class="dim">
            Shows game trailers next to the screenshots on game pages. Off by default, because
            videos use much more internet and memory. They never play by themselves: only when you
            open one.
          </p>
        </div>
        <button class="switch" role="switch" aria-checked={settings.showVideos} aria-label="Trailers and videos" onclick={() => setShowVideos(!settings.showVideos)}>
          <span class="knob"></span>
        </button>
      </div>
    </div>
  </section>
{:else if cat === "system"}
  <section>
    <h2>Window</h2>
    <div class="group">
      <div class="row">
        <div>
          <strong>When I press X</strong>
          <p class="dim">
            "Minimize to tray" keeps Kosmos running as an icon next to the clock. Click it to open
            Kosmos again, or right-click it to quit.
          </p>
        </div>
        <div class="segmented" role="radiogroup" aria-label="When I press X">
          <button role="radio" aria-checked={!settings.closeToTray} onclick={() => setCloseToTray(false)}>Close the app</button>
          <button role="radio" aria-checked={settings.closeToTray} onclick={() => setCloseToTray(true)}>Minimize to tray</button>
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  h1 { margin: 0 0 16px; font-size: 1.6rem; font-weight: 700; }
  h2 {
    margin: 0 0 10px; font-size: var(--fs-sm); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim);
  }
  section { max-width: 680px; margin-bottom: 26px; }
  .dim { color: var(--text-dim); margin: 2px 0 0; font-size: var(--fs-sm); }
  .intro { margin: -4px 0 10px; }
  strong { font-weight: 600; font-size: var(--fs-md); }

  /* ---------- Category buttons ---------- */
  .cats {
    display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 22px; padding-bottom: 12px;
    border-bottom: 1px solid var(--border); max-width: 680px;
  }
  .cat {
    padding: 7px 14px; border-radius: var(--radius-sm); border: 1px solid transparent;
    background: transparent; color: var(--text-dim); font-size: var(--fs-md); font-weight: 500;
    transition: background 0.15s, color 0.15s;
  }
  .cat:hover { background: var(--hover); color: var(--text); }
  .cat.on { background: var(--surface-2); color: var(--text); border-color: var(--border); }

  /* One card per section, rows separated by thin lines */
  .group {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 16px;
    transition: background 0.15s;
  }
  .row + .row { border-top: 1px solid var(--border); }
  .row:hover { background: var(--hover); }
  .row.tab { padding: 8px 10px 8px 16px; font-size: var(--fs-md); }
  .row.check { cursor: pointer; }
  .row.check input { accent-color: var(--accent); width: 17px; height: 17px; flex-shrink: 0; cursor: pointer; }

  select { flex-shrink: 0; max-width: 280px; }

  .off { color: var(--text-dim); text-decoration: line-through; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .arrow {
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    background: var(--surface-2); border: 1px solid var(--border);
    transition: border-color 0.15s;
  }
  .arrow:hover:not(:disabled) { border-color: var(--text-dim); }
  button:disabled { opacity: 0.35; cursor: default; }

  .switch {
    flex-shrink: 0; margin-left: 6px;
    width: 40px; height: 22px; border-radius: 11px; padding: 2px;
    background: var(--border); border: none;
    transition: background 0.15s;
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .knob {
    display: block; width: 18px; height: 18px; border-radius: 50%;
    background: var(--knob); transition: transform 0.15s;
  }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); background: var(--on-accent); }

  /* Accent color picker: each swatch shows its own color (data-accent sets --accent on it) */
  .swatches {
    display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; flex-shrink: 0;
    max-width: 184px; /* two rows of six */
  }
  .swatch {
    width: 24px; height: 24px; border-radius: 50%; padding: 0;
    background: var(--accent); border: 1px solid var(--border);
    transition: box-shadow 0.15s;
  }
  .swatch:hover { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--border); }
  .swatch[aria-checked="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }

  .segmented {
    display: flex; gap: 2px; padding: 2px; flex-shrink: 0;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .segmented button {
    padding: 5px 14px; border: none; border-radius: 4px; font-size: var(--fs-md);
    background: transparent; color: var(--text-dim); transition: color 0.15s, background 0.15s;
  }
  .segmented button:hover { color: var(--text); }
  .segmented button[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }
  .ghost-btn {
    flex-shrink: 0; padding: 6px 14px; font-size: var(--fs-md);
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); transition: border-color 0.15s;
  }
  .ghost-btn:hover { border-color: var(--text-dim); }
</style>
