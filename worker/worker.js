// Kosmos Cloudflare Worker (copy of the deployed code, kept here for reference).
// To update: paste this whole file into the Worker in the Cloudflare dashboard and click Deploy.
// The Steam API key is NOT in this file; it is the STEAM_API_KEY secret in Cloudflare.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

// Ask the Steam store the way a normal browser would
const STORE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

function json(data, status = 200, maxAge = 0) {
  const headers = { ...CORS };
  if (maxAge) headers["Cache-Control"] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(data), { status, headers });
}

// Steam sends descriptions as HTML. Turn it into plain text.
function stripHtml(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Store data: anything that is not real data is an error
async function storeJson(url) {
  const res = await fetch(url, { headers: STORE_HEADERS });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Steam sent a web page instead of data (status " + res.status + ")");
  }
}

// Reviews: Steam's new official reviews interface (no key needed)
async function getReviews(appid) {
  const u = new URL("https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/");
  u.searchParams.set(
    "input_json",
    JSON.stringify({
      appid: Number(appid),
      filter: 0, // most helpful
      day_range: 365,
      num_per_page: 5,
      languages: ["english"],
      purchase_type: 1, // all reviews
    })
  );
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error("Reviews answered " + res.status);
  const raw = await res.json();
  return raw.response || raw;
}

// ---------- Store tags (the user-voted tags you see on a Steam store page) ----------
// Steam gives a game's tags as numbers; a separate list turns numbers into names.
async function getTags(appid) {
  const itemsUrl = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  itemsUrl.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: [{ appid: Number(appid) }],
      context: { language: "english", country_code: "US" },
      data_request: { include_tag_count: 20 },
    })
  );
  const [itemsRes, listRes] = await Promise.all([
    fetch(itemsUrl.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } }),
    // The list of all tag names barely changes: remember it for a week
    fetch("https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english", {
      cf: { cacheTtl: 604800, cacheEverything: true },
    }),
  ]);
  if (!itemsRes.ok || !listRes.ok) return [];
  const items = await itemsRes.json();
  const list = await listRes.json();

  const names = {};
  for (const t of (list.response && list.response.tags) || []) names[t.tagid] = t.name;
  const item = items.response && items.response.store_items && items.response.store_items[0];
  const tags = (item && item.tags) || [];
  return tags
    .slice()
    .sort((a, b) => (b.weight || 0) - (a.weight || 0)) // most-voted first, like Steam
    .map((t) => names[t.tagid])
    .filter(Boolean);
}

// Tags for many games at once (Categories tab): up to 50 games per request, top 15 tags each
async function getTagsBatch(ids) {
  const itemsUrl = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  itemsUrl.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: ids.map((id) => ({ appid: Number(id) })),
      context: { language: "english", country_code: "US" },
      data_request: { include_tag_count: 15 },
    })
  );
  const [itemsRes, listRes] = await Promise.all([
    fetch(itemsUrl.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } }),
    fetch("https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english", {
      cf: { cacheTtl: 604800, cacheEverything: true },
    }),
  ]);
  if (!itemsRes.ok || !listRes.ok) throw new Error("Store answered " + itemsRes.status);
  const items = await itemsRes.json();
  const list = await listRes.json();

  const names = {};
  for (const t of (list.response && list.response.tags) || []) names[t.tagid] = t.name;
  const out = {};
  for (const id of ids) out[id] = []; // games Steam doesn't know get an empty list
  for (const item of (items.response && items.response.store_items) || []) {
    out[item.appid || item.id] = (item.tags || [])
      .slice()
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .map((t) => names[t.tagid])
      .filter(Boolean);
  }
  return out;
}

// ---------- Store ----------
// Uses Steam's store search service (no key needed). Prices come in the shopper's currency:
// the country is taken from Cloudflare (where the request comes from), never from the app.

// Which systems a game runs on. Steam Deck: 3 = Verified, 2 = Playable (1 = unsupported)
function platformsOf(p) {
  if (!p) return null; // unknown
  return {
    windows: !!p.windows,
    mac: !!p.mac,
    linux: !!p.steamos_linux,
    deck: p.steam_deck_compat_category === 3 || p.steam_deck_compat_category === 2,
  };
}

// Your store settings, sent by the app:
//   exclude  = mature-content descriptors to hide (1 some nudity, 2 violence/gore,
//              3 adult only sexual content, 4 frequent nudity, 5 general mature)
//   platform = "any" | "windows" | "mac" | "linux" | "deck"
function readPrefs(params) {
  return {
    exclude: (params.get("exclude") || "").split(",").filter((s) => /^[1-5]$/.test(s)).map(Number),
    platform: ["windows", "mac", "linux", "deck"].includes(params.get("platform")) ? params.get("platform") : "any",
  };
}

function passesPrefs(g, prefs) {
  if (prefs.exclude.length && (g.descriptors || []).some((d) => prefs.exclude.includes(d))) return false;
  if (prefs.platform !== "any" && g.platforms && !g.platforms[prefs.platform]) return false;
  return true;
}

// Turn one Steam store item into the small shape the app needs
function storeItem(it) {
  const p = it.best_purchase_option || {};
  const r = (it.reviews && it.reviews.summary_filtered) || {};
  const a = it.assets || {};
  const file = a.header || a.main_capsule;
  const end = (p.active_discounts || []).map((d) => Number(d.discount_end_date) || 0).filter(Boolean);
  const free = !!it.is_free;
  return {
    appid: it.appid,
    name: it.name || "",
    image:
      a.asset_url_format && file
        ? ASSET_BASE + a.asset_url_format.replace("${FILENAME}", file)
        : `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.appid}/header.jpg`,
    free,
    price: p.final_price_in_cents != null ? Number(p.final_price_in_cents) : free ? 0 : null, // cents
    priceText: p.formatted_final_price || (free ? "Free" : ""),
    originalText: p.discount_pct ? p.formatted_original_price || "" : "",
    discount: p.discount_pct || 0,
    discountEnds: end.length ? Math.min(...end) * 1000 : 0,
    reviewPct: r.review_count ? r.percent_positive : null,
    reviewLabel: r.review_score_label || "",
    reviewCount: r.review_count || 0,
    descriptors: it.content_descriptorids || [], // Steam's mature-content descriptors (1-5)
    platforms: platformsOf(it.platforms),
  };
}

// One page of Steam's store search. sort: 11 = top sellers, 21 = best rated, 1 = name
async function storeQuery({ start = 0, count = 100, sort = 11, tagids = [], discounted = false, free = false }, cc) {
  const filters = { released_only: true, type_filters: { include_games: true } };
  if (tagids.length) filters.tagids_must_match = tagids.map((id) => ({ tagids: [id] }));
  if (discounted) filters.price_filters = { only_discounts: true };
  if (free) filters.price_filters = { only_free_items: true };
  const u = new URL("https://api.steampowered.com/IStoreQueryService/Query/v1/");
  u.searchParams.set(
    "input_json",
    JSON.stringify({
      query: { start, count, sort, filters },
      context: { language: "english", country_code: cc, steam_realm: 1 },
      data_request: { include_basic_info: true, include_assets: true, include_reviews: true, include_ratings: true, include_platforms: true },
    })
  );
  const res = await fetch(u.toString(), { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!res.ok) throw new Error("Store answered " + res.status);
  const raw = await res.json();
  const r = raw.response || {};
  return {
    items: (r.store_items || []).filter((it) => it.success === 1 && it.visible !== false).map(storeItem),
    total: (r.metadata && r.metadata.total_matching_records) || 0,
  };
}

// Best deals: popular games at least 25% off with at least 80% positive reviews
async function storeDeals(cc, prefs) {
  const { items } = await storeQuery({ count: 100, sort: 11, discounted: true }, cc);
  return items
    .filter((g) => g.discount >= 25 && (g.reviewPct ?? 0) >= 80 && g.reviewCount >= 200 && passesPrefs(g, prefs))
    .slice(0, 20);
}

// Browse with filters. Steam can't filter by price, reviews, mature content or platform itself,
// so we filter its pages here and return up to `want` matches plus where to continue ("next").
async function storeBrowse(q, cc, prefs) {
  const want = Math.min(Math.max(q.count || 50, 1), 50);
  const out = [];
  let start = q.start;
  let total = 0;
  for (let page = 0; page < 4 && out.length < want; page++) {
    const r = await storeQuery({ ...q, start, count: 100 }, cc);
    total = r.total;
    let used = 0;
    for (const g of r.items) {
      used++;
      if (q.discounted && !g.discount) continue;
      if (q.maxPrice != null && (g.price == null || g.price > q.maxPrice)) continue;
      if (q.minReview && (g.reviewPct ?? 0) < q.minReview) continue;
      if (!passesPrefs(g, prefs)) continue;
      out.push(g);
      if (out.length >= want) break;
    }
    start += used;
    if (r.items.length < 100 || start >= total) {
      start = -1; // nothing more
      break;
    }
  }
  return { items: out, next: start };
}

// Full store search: the same search as the Steam website (names, tags, descriptions),
// thousands of results instead of ~10. Steam's search page gives us the matching game IDs in
// order; one batch request then gets prices, reviews, images, mature content and platforms.
// Returns what your settings hid too (per reason), so the app can remind you.
async function storeSearch(term, cc, prefs, start = 0, count = 50) {
  const n = Math.min(Math.max(count, 1), 50);
  const u = new URL("https://store.steampowered.com/search/results/");
  u.searchParams.set("term", term);
  u.searchParams.set("start", String(start));
  u.searchParams.set("count", String(n));
  u.searchParams.set("infinite", "1"); // JSON instead of a full web page
  u.searchParams.set("category1", "998"); // games only
  u.searchParams.set("cc", cc);
  u.searchParams.set("l", "english");
  u.searchParams.set("ignore_preferences", "1");
  const page = await storeJson(u.toString());
  const total = Number(page.total_count) || 0;
  // Only plain game IDs (bundles/packages use other attributes)
  const ids = [...String(page.results_html || "").matchAll(/data-ds-appid="(\d+)"/g)].map((m) => Number(m[1]));
  const unique = [...new Set(ids)];

  const items = unique.length ? await storeItemsFor(unique, cc) : [];
  const hidden = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, platform: 0 };
  const shown = [];
  for (const g of items) {
    const blocked = (g.descriptors || []).filter((d) => prefs.exclude.includes(d));
    if (blocked.length) {
      for (const d of blocked) hidden[d]++;
      continue;
    }
    if (prefs.platform !== "any" && g.platforms && !g.platforms[prefs.platform]) {
      hidden.platform++;
      continue;
    }
    shown.push(g);
  }
  const next = start + n < total && ids.length ? start + n : -1;
  return { items: shown, total, next, hidden };
}

// Full store data for a list of games (keeps the given order). Max 50 per request.
async function storeItemsFor(ids, cc) {
  const u = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  u.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: ids.slice(0, 50).map((id) => ({ appid: id })),
      context: { language: "english", country_code: cc, steam_realm: 1 },
      data_request: {
        include_basic_info: true, include_assets: true, include_reviews: true,
        include_ratings: true, include_platforms: true,
      },
    })
  );
  const res = await fetch(u.toString(), { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!res.ok) throw new Error("Store answered " + res.status);
  const byId = {};
  for (const it of ((await res.json()).response || {}).store_items || []) {
    if (it.success === 1 && it.visible !== false) byId[it.appid] = storeItem(it);
  }
  return ids.map((id) => byId[id]).filter(Boolean);
}

// ---------- Community Market ----------
// Steam's public market (no login needed). Limits we have to live with:
//  - at most 10 items per Steam request without a login, so we combine a few pages per call
//  - search prices always come in US dollars: we convert them with daily exchange rates
//    (shown as approximate); an item's details give Steam's exact price in your currency
//  - Steam limits how often the market can be asked, so everything is cached for a while
const MARKET = "https://steamcommunity.com/market";
const MARKET_HEADERS = { "User-Agent": STORE_HEADERS["User-Agent"], "Accept-Language": "en-US,en;q=0.9" };
const ECON_IMG = "https://community.cloudflare.steamstatic.com/economy/image/";

// Steam's own currency numbers (for exact item prices)
const STEAM_CURRENCY = {
  USD: 1, GBP: 2, EUR: 3, CHF: 4, RUB: 5, PLN: 6, BRL: 7, JPY: 8, NOK: 9, IDR: 10, MYR: 11,
  PHP: 12, SGD: 13, THB: 14, VND: 15, KRW: 16, UAH: 18, MXN: 19, CAD: 20, AUD: 21, NZD: 22,
  CNY: 23, INR: 24, ZAR: 28, AED: 32,
};
// Country -> currency (countries not listed use US dollars, like Steam does for many regions)
const COUNTRY_CURRENCY = {
  GB: "GBP", CH: "CHF", RU: "RUB", PL: "PLN", BR: "BRL", JP: "JPY", NO: "NOK", ID: "IDR", MY: "MYR",
  PH: "PHP", SG: "SGD", TH: "THB", VN: "VND", KR: "KRW", UA: "UAH", MX: "MXN", CA: "CAD", AU: "AUD",
  NZ: "NZD", CN: "CNY", IN: "INR", ZA: "ZAR", AE: "AED",
};
const EURO = "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ");
function currencyFor(cc) {
  if (EURO.includes(cc)) return "EUR";
  return COUNTRY_CURRENCY[cc] || "USD";
}

// Daily exchange rates from US dollars (free, no key; cached for 12 hours)
async function usdRates() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      cf: { cacheTtl: 43200, cacheEverything: true },
    });
    if (!res.ok) return null;
    return { ...(await res.json()).rates, USD: 1 };
  } catch {
    return null;
  }
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return amount.toFixed(2) + " " + currency;
  }
}

async function marketJson(url, ttl) {
  const res = await fetch(url, { headers: MARKET_HEADERS, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (res.status === 429) {
    const e = new Error("busy");
    e.busy = true; // Steam asked us to slow down
    throw e;
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Market sent a web page instead of data (status " + res.status + ")");
  }
}

// A game's market categories (e.g. CS2: Type, Weapon, Exterior, Quality...), cached for a day
async function marketFilters(appid) {
  const d = await marketJson(`${MARKET}/appfilters/${appid}`, 86400);
  const facets = [];
  for (const [key, f] of Object.entries(d.facets || {})) {
    // Steam's own items list every game as a category: far too many to show
    if (appid === "753" && /_Game$/.test(key)) continue;
    const tags = Object.entries(f.tags || {})
      .map(([id, t]) => ({ id, label: t.localized_name || id, count: Number(t.matches) || 0 }))
      .filter((t) => t.label)
      .sort((a, b) => b.count - a.count);
    if (tags.length) facets.push({ key, label: f.localized_name || key, tags });
  }
  // Most useful categories first (type of item, weapon / hero / class, condition, rarity...)
  const ORDER = ["Type", "item_class", "itemclass", "Weapon", "Hero", "Class", "Slot", "Exterior", "Quality", "Rarity", "steamcat", "droprate", "cardborder"];
  const rank = (key) => {
    const i = ORDER.indexOf(key.split("_").slice(1).join("_"));
    return i === -1 ? ORDER.length : i;
  };
  return facets.sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

// Search the market. f = "facetKey:tagId,facetKey:tagId" (e.g. "730_Weapon:weapon_ak47").
// Combines up to 3 Steam pages of 10; applies the price range (in US cents) on those pages.
async function marketSearch(q) {
  const out = [];
  let start = q.start;
  let total = 0;
  let busy = false;
  const rates = await usdRates();
  const rate = (rates && rates[q.currency]) || null;
  const currency = rate ? q.currency : "USD";
  // The price range comes in your currency (cents); Steam's prices are US cents
  if (rate) {
    if (q.min != null) q.min = Math.floor(q.min / rate);
    if (q.max != null) q.max = Math.ceil(q.max / rate);
  }

  for (let page = 0; page < 3 && out.length < q.want; page++) {
    const u = new URL(`${MARKET}/search/render/`);
    u.searchParams.set("norender", "1");
    u.searchParams.set("start", String(start));
    u.searchParams.set("count", "10");
    u.searchParams.set("query", q.query);
    u.searchParams.set("search_descriptions", "0");
    u.searchParams.set("sort_column", q.sort);
    u.searchParams.set("sort_dir", q.dir);
    if (q.appid) u.searchParams.set("appid", q.appid);
    for (const [facet, tag] of q.filters) u.searchParams.append(`category_${facet}[]`, `tag_${tag}`);
    let d;
    try {
      d = await marketJson(u.toString(), 600);
    } catch (e) {
      if (e.busy) {
        busy = true;
        break;
      }
      throw e;
    }
    total = Number(d.total_count) || 0;
    const results = d.results || [];
    for (const r of results) {
      const usdCents = Number(r.sell_price) || 0;
      if (q.min != null && usdCents < q.min) continue;
      if (q.max != null && usdCents > q.max) continue;
      const a = r.asset_description || {};
      const local = rate ? (usdCents / 100) * rate : usdCents / 100;
      out.push({
        hash: r.hash_name || r.name,
        name: r.name,
        appid: a.appid || Number(q.appid) || 0,
        game: (r.app_name || "").slice(0, 80),
        type: a.type || "",
        color: /^[0-9a-f]{6}$/i.test(a.name_color || "") ? a.name_color : "",
        icon: a.icon_url ? ECON_IMG + a.icon_url + "/256fx256f" : "",
        listings: Number(r.sell_listings) || 0,
        usdCents,
        priceText: usdCents ? (rate && currency !== "USD" ? "≈ " : "") + formatMoney(local, currency) : "",
      });
    }
    start += 10;
    if (results.length < 10 || start >= total) {
      start = -1;
      break;
    }
  }
  return { items: out, total, next: busy && !out.length ? q.start : start, busy, currency };
}

// One item's exact prices in your currency: lowest listing, median sale price, sales in 24 h
async function marketItem(appid, hash, currency) {
  const u = new URL(`${MARKET}/priceoverview/`);
  u.searchParams.set("appid", appid);
  u.searchParams.set("market_hash_name", hash);
  u.searchParams.set("currency", String(STEAM_CURRENCY[currency] || 1));
  const d = await marketJson(u.toString(), 900);
  return {
    lowest: d.lowest_price || "",
    median: d.median_price || "",
    volume: d.volume || "",
  };
}

// ---------- Steam groups ----------
// Steam has no proper public groups API, so we read:
//  - each group's public data feed (memberslistxml): name, headline, description, avatar, counts
//  - the group's public page: its administrators and moderators
//  - Steam's community search: finding groups by name
const COMMUNITY = "https://steamcommunity.com";
const GROUP_ID_BASE = 103582791429521408n; // group IDs: 64-bit = base + Steam's short group number
const ACCOUNT_ID_BASE = 76561197960265728n; // player IDs: 64-bit = base + short account number

// Group texts use Steam's forum markup ([b], [url=...], [h1]...): keep only the words
function plainBBCode(s) {
  return String(s || "")
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function xmlTag(xml, name) {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return m ? m[1].trim() : "";
}

// One group's details from its public data feed. `path` is "groups/<url>" or "gid/<64-bit id>".
async function groupInfo(path) {
  const res = await fetch(`${COMMUNITY}/${path}/memberslistxml/?xml=1`, {
    headers: MARKET_HEADERS,
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const details = xmlTag(xml, "groupDetails");
  if (!details) return null;
  return {
    id: xmlTag(xml, "groupID64"),
    url: xmlTag(details, "groupURL"),
    name: decodeEntities(xmlTag(details, "groupName")),
    headline: decodeEntities(xmlTag(details, "headline")),
    summary: plainBBCode(stripHtml(xmlTag(details, "summary"))).slice(0, 4000),
    avatar: xmlTag(details, "avatarFull") || xmlTag(details, "avatarMedium"),
    members: Number(xmlTag(details, "memberCount")) || 0,
    online: Number(xmlTag(details, "membersOnline")) || 0,
    inGame: Number(xmlTag(details, "membersInGame")) || 0,
    inChat: Number(xmlTag(details, "membersInChat")) || 0,
  };
}

// Search groups by name (Steam's community search; leaves out game hubs, which aren't groups)
async function groupSearch(text, page) {
  // Steam only wants a session cookie that matches the request; any random value works
  const sid = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const u = new URL(`${COMMUNITY}/search/SearchCommunityAjax`);
  u.searchParams.set("text", text);
  u.searchParams.set("filter", "groups");
  u.searchParams.set("sessionid", sid);
  u.searchParams.set("steamid_user", "false");
  u.searchParams.set("page", String(page));
  const res = await fetch(u.toString(), {
    headers: { ...MARKET_HEADERS, Cookie: "sessionid=" + sid },
    cf: { cacheTtl: 1800, cacheEverything: true },
  });
  if (!res.ok) throw new Error("Community answered " + res.status);
  const d = await res.json();
  const html = String(d.html || "");
  const rows = html.split('class="search_row group"').slice(1);
  const items = [];
  for (const row of rows) {
    const link = /href="https:\/\/steamcommunity\.com\/groups\/([^"/]+)"/.exec(row);
    if (!link) continue; // game hub or something else, not a joinable group
    const name = /class="searchPersonaName"[^>]*>([^<]*)</.exec(row);
    const img = /<img src="([^"]+)"/.exec(row);
    const members = /([\d,.]+)<\/span>\s*members/.exec(row);
    const summary = /class="search_group_summary_text">([\s\S]*?)<\/div>/.exec(row);
    items.push({
      url: decodeURIComponent(link[1]),
      name: decodeEntities((name && name[1]) || link[1]).trim(),
      avatar: img ? img[1] : "",
      members: members ? Number(members[1].replace(/[,.]/g, "")) : 0,
      summary: summary ? plainBBCode(decodeEntities(summary[1].replace(/<[^>]+>/g, ""))).slice(0, 200) : "",
    });
  }
  const total = Number(d.search_result_count) || 0;
  return { items, total, next: rows.length ? page + 1 : -1 };
}

// Administrators and moderators, read from the group's public page
async function groupStaff(url, env) {
  const res = await fetch(`${COMMUNITY}/groups/${encodeURIComponent(url)}`, {
    headers: MARKET_HEADERS,
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) return { admins: [], mods: [] };
  const html = await res.text();
  const section = (title) => {
    const i = html.indexOf(`> ${title} </div>`) >= 0 ? html.indexOf(`> ${title} </div>`) : html.search(new RegExp(`>\\s*${title}\\s*</div>`));
    if (i < 0) return [];
    const rest = html.slice(i);
    const end = rest.indexOf("member_sectionheader", 30);
    const part = end > 0 ? rest.slice(0, end) : rest.slice(0, 6000);
    return [...part.matchAll(/data-miniprofile="(\d+)"/g)].map((m) => String(ACCOUNT_ID_BASE + BigInt(m[1])));
  };
  const adminIds = section("Administrators").slice(0, 20);
  const modIds = section("Moderators").slice(0, 20);
  const all = [...new Set([...adminIds, ...modIds])];
  const people = {};
  if (all.length) {
    try {
      const d = await steam("/ISteamUser/GetPlayerSummaries/v2/", { steamids: all.join(",") }, env, 86400);
      for (const p of (d.response && d.response.players) || []) {
        people[p.steamid] = { steamid: p.steamid, name: p.personaname || "", avatar: p.avatarmedium || "", online: Number(p.personastate) > 0 };
      }
    } catch {
      /* show them without names */
    }
  }
  const pick = (ids) => ids.map((id) => people[id] || { steamid: id, name: "", avatar: "", online: false });
  return { admins: pick(adminIds), mods: pick(modIds) };
}

// PC specs a reviewer chose to share on Steam (null if they didn't)
function cleanHardware(h) {
  if (!h || typeof h !== "object") return null;
  const ramMb = Number(h.system_ram) || 0;
  const vramMb = Number(h.vram_size) || 0;
  const out = {
    os: String(h.os || "").slice(0, 80),
    cpu: String(h.cpu_name || "").replace(/\(R\)|\(TM\)/gi, "").replace(/\s+/g, " ").trim().slice(0, 100),
    gpu: String(h.adapter_description || "").slice(0, 100),
    ram: ramMb ? Math.round(ramMb / 1024) + " GB" : "",
    vram: vramMb ? Math.round(vramMb / 1024) + " GB" : "",
  };
  return out.os || out.cpu || out.gpu || out.ram ? out : null;
}

// ---------- Game news / patch notes ----------
// Steam writes announcements in "BBCode" ([p], [b], [img], [list] ...).
// We turn that into a simple list of blocks the app can show as plain text,
// so no outside HTML ever gets into the app.
//   { t: "h", text } heading      { t: "p", text } paragraph   { t: "li", text } list item
//   { t: "img", src }  image       { t: "yt", id }  YouTube video  { t: "hr" } divider
const CLAN_IMAGES = "https://clan.akamai.steamstatic.com/images/";

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\\([[\]])/g, "$1"); // Steam writes a literal "[" as "\["
}

function bbcodeToBlocks(src) {
  const text = String(src || "").replace(/\{STEAM_CLAN_IMAGE\}\/?/g, CLAN_IMAGES).slice(0, 60000);
  const blocks = [];
  let buf = "";
  let kind = "p";
  let bold = 0;
  let plainChars = 0; // non-bold characters in the current paragraph
  let imgUrlMode = false; // inside [img]url[/img]

  const flush = () => {
    const t = decodeEntities(buf).replace(/\s+/g, " ").trim();
    if (t) {
      let k = kind;
      // A short paragraph that is entirely bold is a heading
      if (k === "p" && plainChars === 0 && t.length < 120) k = "h";
      blocks.push({ t: k, text: t.slice(0, 4000) });
    }
    buf = "";
    plainChars = 0;
  };
  const addText = (s) => {
    if (imgUrlMode) {
      const u = s.trim();
      if (/^https:\/\//.test(u)) blocks.push({ t: "img", src: u });
      return;
    }
    const parts = s.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) flush();
      buf += part;
      if (bold === 0) plainChars += part.replace(/\s/g, "").length;
    });
  };

  const re = /\[(\/?)([a-z0-9*]+)(?:([= ])([^\]]*))?\]/gi;
  let last = 0;
  let m;
  while ((m = re.exec(text)) && blocks.length < 400) {
    addText(text.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attr = (m[4] || "").trim();

    switch (tag) {
      case "h1": case "h2": case "h3": case "h4":
        flush();
        kind = closing ? "p" : "h";
        break;
      case "p": case "quote": case "code": case "tr": case "table":
        flush();
        break;
      case "td": case "th":
        if (closing) buf += "  ·  ";
        break;
      case "list": case "olist":
        flush();
        kind = "p";
        break;
      case "*":
        flush();
        kind = closing ? "p" : "li";
        break;
      case "b": case "strong":
        bold = Math.max(0, bold + (closing ? -1 : 1));
        break;
      case "hr":
        if (!closing) { flush(); blocks.push({ t: "hr" }); }
        break;
      case "img": {
        if (closing) { imgUrlMode = false; break; }
        flush();
        const s = /src="([^"]+)"/.exec(attr) || (m[3] === "=" ? [null, attr] : null);
        if (s && /^https:\/\//.test(s[1])) blocks.push({ t: "img", src: s[1] });
        else imgUrlMode = true;
        break;
      }
      case "previewyoutube": {
        if (closing) break;
        flush();
        const id = (attr.split(";")[0] || "").trim();
        if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) blocks.push({ t: "yt", id });
        break;
      }
      default:
        // inline tags like [i], [u], [url=...], [spoiler]: keep only their text
        break;
    }
  }
  addText(text.slice(last));
  flush();

  // Drop dividers at the very start or end
  while (blocks.length && blocks[0].t === "hr") blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].t === "hr") blocks.pop();
  return blocks;
}

async function getNews(appid) {
  const u = new URL("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/");
  u.searchParams.set("appid", appid);
  u.searchParams.set("count", "12");
  u.searchParams.set("maxlength", "0");
  u.searchParams.set("feeds", "steam_community_announcements");
  const res = await fetch(u.toString(), { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("News answered " + res.status);
  const raw = await res.json();
  const items = (raw.appnews && raw.appnews.newsitems) || [];

  return items.map((n) => {
    const blocks = bbcodeToBlocks(n.contents);
    const firstImg = blocks.find((b) => b.t === "img");
    const preview = blocks
      .filter((b) => b.t === "p" || b.t === "li")
      .map((b) => b.text)
      .join(" ")
      .slice(0, 200);
    return {
      id: String(n.gid),
      title: String(n.title || "").slice(0, 200),
      date: (n.date || 0) * 1000,
      url: /^https:\/\//.test(n.url || "") ? n.url : "",
      image: firstImg ? firstImg.src : "",
      preview,
      blocks,
    };
  });
}

// Reviews with the reviewer's name and avatar, 10 at a time.
// cursor "*" = first page; Steam gives us the cursor for the next page.
// Names and avatars for all 10 reviewers are fetched in ONE request.
async function getReviewPage(appid, cursor, env) {
  const u = new URL("https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/");
  u.searchParams.set(
    "input_json",
    JSON.stringify({
      appid: Number(appid),
      filter: 0, // most helpful
      day_range: 365,
      num_per_page: 10,
      languages: ["english"],
      purchase_type: 1, // all reviews
      cursor,
    })
  );
  const res = await fetch(u.toString(), { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("Reviews answered " + res.status);
  const raw = await res.json();
  const r = raw.response || raw;
  const reviews = r.reviews || [];

  // Look up reviewer names and avatars (up to 100 per request; we only need 10)
  const ids = [...new Set(reviews.map((x) => x.author && x.author.steamid).filter(Boolean))];
  const players = {};
  if (ids.length) {
    try {
      const data = await steam(
        "/ISteamUser/GetPlayerSummaries/v2/",
        { steamids: ids.join(",") },
        env,
        86400 // names and avatars rarely change: remember for a day
      );
      for (const p of (data.response && data.response.players) || []) players[p.steamid] = p;
    } catch {
      /* no names/avatars this time; the reviews still show */
    }
  }

  const list = reviews.map((x) => {
    const sid = (x.author && x.author.steamid) || "";
    const p = players[sid];
    return {
      id: x.recommendationid,
      steamid: sid,
      name: p ? p.personaname : "",
      avatar: p ? p.avatarmedium : "",
      text: String(x.review || "").slice(0, 1500),
      positive: !!x.voted_up,
      helpful: x.votes_up || 0,
      hours: Math.round(((x.author && x.author.playtime_forever) || 0) / 60),
      date: (x.timestamp_created || 0) * 1000,
      deck: !!x.primarily_steam_deck,
      hardware: cleanHardware(x.hardware),
    };
  });

  // No more pages when Steam sends nothing new
  const next = reviews.length && r.cursor && r.cursor !== cursor ? r.cursor : null;
  return { list, cursor: next };
}

// Cover images: Steam's store API knows the real ("coded") image addresses,
// which newer games need. One request handles up to 50 games. No key needed.
const ASSET_BASE = "https://shared.cloudflare.steamstatic.com/store_item_assets/";

async function getCovers(ids) {
  const u = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  u.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: ids.map((id) => ({ appid: Number(id) })),
      context: { language: "english", country_code: "US" },
      data_request: { include_assets: true },
    })
  );
  const res = await fetch(u.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error("Store answered " + res.status);
  const raw = await res.json();

  const covers = {};
  for (const id of ids) covers[id] = null;
  for (const item of (raw.response && raw.response.store_items) || []) {
    const a = item.assets;
    if (!a || !a.asset_url_format) continue;
    // Prefer the tall library cover, then the wide images
    const file = a.library_capsule || a.header || a.main_capsule;
    if (!file) continue;
    covers[item.appid || item.id] = ASSET_BASE + a.asset_url_format.replace("${FILENAME}", file);
  }
  return covers;
}

// ---------- Steam sign-in (OpenID 2.0) ----------
// The app opens /auth/login?state=<random code> in the browser. We send the user to Steam's
// official login page (Kosmos never sees the password). Steam sends them back to
// /auth/callback, where we ask Steam to confirm the login is real (check_authentication).
// Only then do we hand the verified SteamID to the app through a kosmos:// link,
// together with the app's random code so the app knows the link is the answer to its own request.

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const STATE_RE = /^[A-Za-z0-9_-]{16,64}$/;

// A small web page shown in the browser during sign-in
function page(body, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kosmos sign-in</title>
<style>
  :root { --bg:#0a0a0b; --text:#ececef; --dim:#8c8c94; --accent:#7c8cff; --on-accent:#0a0a0b; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f4f4f6; --text:#16161a; --dim:#62626c; --accent:#5b6cf0; --on-accent:#fff; }
  }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg);
         color:var(--text); font-family:system-ui,"Segoe UI",sans-serif; }
  main { max-width:420px; padding:32px 16px; text-align:center; }
  h1 { font-size:1.3rem; margin:0 0 8px; }
  p { color:var(--dim); margin:0 0 20px; line-height:1.5; }
  a { display:inline-block; padding:10px 18px; border-radius:10px; background:var(--accent);
      color:var(--on-accent); font-weight:600; text-decoration:none; }
</style></head>
<body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function failPage() {
  return page(
    `<h1>Sign-in didn't work</h1><p>Please go back to Kosmos and try again.</p>`,
    400
  );
}

// Returns the verified SteamID64, or null if anything is wrong
async function verifySteamLogin(url) {
  const q = url.searchParams;
  if (q.get("openid.mode") !== "id_res") return null;
  if (q.get("openid.op_endpoint") !== STEAM_OPENID) return null;

  // Steam must have sent the user back to exactly this address, with the same code
  const returnTo = q.get("openid.return_to") || "";
  if (!returnTo.startsWith(url.origin + "/auth/callback?")) return null;
  if (new URL(returnTo).searchParams.get("state") !== q.get("state")) return null;

  const claimed = q.get("openid.claimed_id") || "";
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
  if (!m || q.get("openid.identity") !== claimed) return null;

  // The important fields must be covered by Steam's signature
  const signed = (q.get("openid.signed") || "").split(",");
  for (const f of ["claimed_id", "identity", "return_to", "response_nonce", "op_endpoint"]) {
    if (!signed.includes(f)) return null;
  }

  // Ask Steam directly whether this login is genuine
  const body = new URLSearchParams();
  for (const [k, v] of q) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!/^is_valid\s*:\s*true\s*$/m.test(text)) return null;

  return m[1];
}

// Official API data (games list, profile): safe to save for a few minutes
async function steam(path, params, env, ttlSeconds) {
  const u = new URL("https://api.steampowered.com" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", env.STEAM_API_KEY);
  const res = await fetch(u, { cf: { cacheTtl: ttlSeconds, cacheEverything: true } });
  if (!res.ok) throw new Error("Steam answered " + res.status);
  return res.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    // ---------- Sign-in step 1: send the user to Steam's login page ----------
    if (url.pathname === "/auth/login") {
      const state = url.searchParams.get("state") || "";
      if (!STATE_RE.test(state)) return failPage();
      const p = new URLSearchParams({
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": `${url.origin}/auth/callback?state=${state}`,
        "openid.realm": url.origin + "/",
        "openid.identity": OPENID_NS + "/identifier_select",
        "openid.claimed_id": OPENID_NS + "/identifier_select",
      });
      return Response.redirect(`${STEAM_OPENID}?${p}`, 302);
    }

    // ---------- Sign-in step 2: Steam sent the user back; verify and return to the app ----------
    if (url.pathname === "/auth/callback") {
      const state = url.searchParams.get("state") || "";
      if (!STATE_RE.test(state)) return failPage();
      let steamid = null;
      try {
        steamid = await verifySteamLogin(url);
      } catch {
        return page(
          `<h1>Couldn't reach Steam</h1><p>Please go back to Kosmos and try again in a moment.</p>`,
          502
        );
      }
      if (!steamid) return failPage();

      // steamid is 17 digits and state is letters/digits/-/_ only, so this is safe to put in the page
      const appLink = `kosmos://auth?steamid=${steamid}&state=${state}`;
      return page(
        `<h1>You're signed in</h1>
         <p>Returning to Kosmos. You can close this tab afterwards.</p>
         <a href="${appLink}">Open Kosmos</a>
         <script>location.href = ${JSON.stringify(appLink)};</script>`
      );
    }

    try {
      // ---------- Cover images for many games (no Steam ID needed) ----------
      if (url.pathname === "/covers") {
        const ids = (url.searchParams.get("appids") || "")
          .split(",")
          .filter((s) => /^\d{1,9}$/.test(s))
          .slice(0, 50);
        if (!ids.length) return json({ error: "Please add ?appids=1,2,3" }, 400);
        return json({ covers: await getCovers(ids) }, 200, 86400);
      }

      // ---------- Reviews with reviewer names/avatars, 10 per page ----------
      if (url.pathname === "/reviews") {
        const appid = url.searchParams.get("appid") || "";
        const cursor = url.searchParams.get("cursor") || "*";
        if (!/^\d{1,9}$/.test(appid) || !/^[A-Za-z0-9+/=*]{1,120}$/.test(cursor)) {
          return json({ error: "Please add ?appid=<number>&cursor=<cursor>" }, 400);
        }
        return json(await getReviewPage(appid, cursor, env), 200, 3600);
      }

      // ---------- Tags for many games (Categories tab), max 50 per request ----------
      if (url.pathname === "/tags") {
        const ids = [...new Set((url.searchParams.get("appids") || "").split(","))]
          .filter((s) => /^\d{1,9}$/.test(s))
          .slice(0, 50);
        if (!ids.length) return json({ error: "Please add ?appids=1,2,3" }, 400);
        return json({ tags: await getTagsBatch(ids) }, 200, 86400);
      }

      // ---------- Store ----------
      if (url.pathname.startsWith("/store/")) {
        // Shopper's country from Cloudflare (for currency); can be overridden with ?cc=XX
        const ccParam = (url.searchParams.get("cc") || "").toUpperCase();
        const cc = /^[A-Z]{2}$/.test(ccParam) ? ccParam : (request.cf && request.cf.country) || "US";
        const prefs = readPrefs(url.searchParams); // mature content + platform settings

        if (url.pathname === "/store/deals") {
          return json({ cc, items: await storeDeals(cc, prefs) }, 200, 1800);
        }
        if (url.pathname === "/store/search") {
          const term = (url.searchParams.get("q") || "").trim().slice(0, 100);
          if (!term) return json({ cc, items: [], total: 0, next: -1, hidden: {} });
          const start = /^\d{1,6}$/.test(url.searchParams.get("start") || "") ? Number(url.searchParams.get("start")) : 0;
          const count = /^\d{1,2}$/.test(url.searchParams.get("count") || "") ? Number(url.searchParams.get("count")) : 50;
          return json({ cc, ...(await storeSearch(term, cc, prefs, start, count)) }, 200, 1800);
        }
        if (url.pathname === "/store/browse") {
          const p = url.searchParams;
          const sorts = { top: 11, rating: 21, name: 1 };
          const num = (k) => (p.get(k) && /^\d{1,7}$/.test(p.get(k)) ? Number(p.get(k)) : null);
          const q = {
            start: num("start") ?? 0,
            count: num("count") ?? 50, // how many games to return (max 50)
            sort: sorts[p.get("sort")] ?? 11,
            tagids: (p.get("tags") || "").split(",").filter((s) => /^\d{1,7}$/.test(s)).slice(0, 5).map(Number),
            discounted: p.get("discounted") === "1",
            free: p.get("free") === "1",
            maxPrice: num("max"), // cents
            minReview: num("review"), // percent
          };
          return json({ cc, ...(await storeBrowse(q, cc, prefs)) }, 200, 1800);
        }
        return json({ error: "Not found" }, 404);
      }

      // ---------- Community Market ----------
      if (url.pathname.startsWith("/market/")) {
        const p = url.searchParams;
        const appid = /^\d{1,9}$/.test(p.get("appid") || "") ? p.get("appid") : "";
        const ccParam = (p.get("cc") || "").toUpperCase();
        const cc = /^[A-Z]{2}$/.test(ccParam) ? ccParam : (request.cf && request.cf.country) || "US";
        const currency = currencyFor(cc);
        try {
          if (url.pathname === "/market/filters") {
            if (!appid) return json({ facets: [] });
            return json({ facets: await marketFilters(appid) }, 200, 86400);
          }
          if (url.pathname === "/market/search") {
            const num = (k) => (/^\d{1,9}$/.test(p.get(k) || "") ? Number(p.get(k)) : null);
            const sorts = ["popular", "price", "quantity", "name"];
            const filters = (p.get("f") || "")
              .split(",")
              .map((s) => s.split(":"))
              .filter(([facet, tag]) => /^\d{1,9}_[A-Za-z0-9_]{1,60}$/.test(facet || "") && /^[A-Za-z0-9_\-.]{1,80}$/.test(tag || ""))
              .slice(0, 12);
            const q = {
              appid,
              query: (p.get("q") || "").trim().slice(0, 100),
              sort: sorts.includes(p.get("sort")) ? p.get("sort") : "popular",
              dir: p.get("dir") === "asc" ? "asc" : "desc",
              start: num("start") ?? 0,
              want: Math.min(num("count") ?? 30, 30),
              min: num("min"), // your currency, in cents
              max: num("max"), // your currency, in cents
              filters,
              currency,
            };
            return json(await marketSearch(q), 200, 600);
          }
          if (url.pathname === "/market/item") {
            const hash = (p.get("name") || "").slice(0, 200);
            if (!appid || !hash) return json({ error: "Please add ?appid=&name=" }, 400);
            return json({ currency, ...(await marketItem(appid, hash, currency)) }, 200, 900);
          }
        } catch (e) {
          if (e.busy) return json({ busy: true, items: [], total: 0, next: -1 }, 200);
          throw e;
        }
        return json({ error: "Not found" }, 404);
      }

      // ---------- Steam groups: search and details (no Steam ID needed) ----------
      if (url.pathname === "/groups/search") {
        const text = (url.searchParams.get("q") || "").trim().slice(0, 100);
        const page = /^\d{1,3}$/.test(url.searchParams.get("page") || "") ? Number(url.searchParams.get("page")) : 1;
        if (!text) return json({ items: [], total: 0, next: -1 });
        return json(await groupSearch(text, Math.max(page, 1)), 200, 1800);
      }
      if (url.pathname === "/groups/detail") {
        const g = url.searchParams.get("url") || "";
        if (!/^[A-Za-z0-9_\-.]{1,64}$/.test(g)) return json({ error: "Please add ?url=<group url>" }, 400);
        const [info, staff] = await Promise.all([groupInfo("groups/" + g), groupStaff(g, env)]);
        if (!info) return json({ error: "Group not found" }, 404);
        return json({ ...info, ...staff }, 200, 3600);
      }

      // ---------- News feed for several games (Library "News and updates" row) ----------
      // Latest 4 posts of each game (max 10 games), merged newest first, without the full text
      // (the app loads the full post from /news only when one is opened). Uses the same Steam
      // lookup as /news, so both share Cloudflare's cache.
      if (url.pathname === "/feed") {
        const ids = [...new Set((url.searchParams.get("appids") || "").split(","))]
          .filter((s) => /^\d{1,9}$/.test(s))
          .slice(0, 10);
        if (!ids.length) return json({ error: "Please add ?appids=1,2,3" }, 400);
        const lists = await Promise.all(ids.map((id) => getNews(id).catch(() => [])));
        const items = lists
          .flatMap((list, i) =>
            list.slice(0, 4).map(({ blocks, preview, ...rest }) => ({ ...rest, appid: Number(ids[i]) }))
          )
          .sort((a, b) => b.date - a.date)
          .slice(0, 30);
        return json({ items }, 200, 1800);
      }

      // ---------- Latest updates / news for a game ----------
      if (url.pathname === "/news") {
        const appid = url.searchParams.get("appid") || "";
        if (!/^\d{1,9}$/.test(appid)) return json({ error: "Please add ?appid=<number>" }, 400);
        return json({ items: await getNews(appid) }, 200, 3600);
      }

      // ---------- Game page data (no Steam ID needed) ----------
      if (url.pathname === "/game") {
        // Prices in the shopper's currency (country from Cloudflare; ?cc=XX overrides)
        const ccParam = (url.searchParams.get("cc") || "").toUpperCase();
        const gameCc = /^[A-Z]{2}$/.test(ccParam) ? ccParam : (request.cf && request.cf.country) || "US";
        const appid = url.searchParams.get("appid") || "";
        if (!/^\d{1,9}$/.test(appid)) {
          return json({ error: "Please add ?appid=<number>" }, 400);
        }

        const [detailsRaw, rv, tags] = await Promise.all([
          storeJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=${gameCc}`),
          getReviews(appid).catch((e) => ({ failed: String(e && e.message) })),
          getTags(appid).catch(() => []), // tags are a bonus: never break the page over them
        ]);

        const entry = detailsRaw && detailsRaw[appid];
        if (!entry || !entry.success) return json({ available: false }, 200, 3600);
        const d = entry.data;

        const reviews =
          rv && rv.query_summary
            ? {
                summary: rv.query_summary.review_score_desc || "",
                positive: rv.query_summary.total_positive || 0,
                negative: rv.query_summary.total_negative || 0,
                total: rv.query_summary.total_reviews || 0,
                list: (rv.reviews || []).map((r) => ({
                  text: String(r.review || "").slice(0, 600),
                  positive: !!r.voted_up,
                  helpful: r.votes_up || 0,
                  hours: Math.round(((r.author && r.author.playtime_forever) || 0) / 60),
                })),
              }
            : null;

        return json(
          {
            available: true,
            appid: d.steam_appid,
            name: d.name,
            shortDescription: stripHtml(d.short_description),
            developers: d.developers || [],
            publishers: d.publishers || [],
            releaseDate: (d.release_date && d.release_date.date) || "",
            reviewsDebug: rv.failed
              ? rv.failed
              : rv.query_summary
              ? "ok"
              : "no summary, got: " + Object.keys(rv).join(","),
            genres: (d.genres || []).map((g) => g.description),
            tags,
            // Price in the shopper's currency (null = not sold / coming soon)
            price: d.is_free
              ? { free: true, final: "Free", initial: "", discount: 0 }
              : d.price_overview
              ? {
                  free: false,
                  final: d.price_overview.final_formatted || "",
                  initial: d.price_overview.discount_percent ? d.price_overview.initial_formatted || "" : "",
                  discount: d.price_overview.discount_percent || 0,
                }
              : null,
            comingSoon: !!(d.release_date && d.release_date.coming_soon),
            header: d.header_image || "",
            screenshots: (d.screenshots || []).slice(0, 12).map((s) => ({
              thumb: s.path_thumbnail,
              full: s.path_full,
            })),
            requirements: {
              minimum: stripHtml(d.pc_requirements && d.pc_requirements.minimum),
              recommended: stripHtml(d.pc_requirements && d.pc_requirements.recommended),
            },
            reviews,
          },
          200,
          reviews ? 3600 : 60 // a page without reviews is only remembered for a minute
        );
      }

      // ---------- Everything below needs a Steam ID ----------
      const steamid = url.searchParams.get("steamid") || "";
      if (!/^\d{17}$/.test(steamid)) {
        return json({ error: "Please add ?steamid=<your 17-digit SteamID64>" }, 400);
      }

      if (url.pathname === "/profile") {
        const data = await steam(
          "/ISteamUser/GetPlayerSummaries/v2/",
          { steamids: steamid },
          env,
          60 // status changes, so keep it only a minute
        );
        const p = data.response?.players?.[0];
        if (!p) return json({ error: "Profile not found" }, 404);
        return json({
          steamid: p.steamid,
          name: p.personaname,
          avatar: p.avatarfull,
          profileUrl: p.profileurl,
          isPublic: p.communityvisibilitystate === 3,
          state: Number(p.personastate) || 0, // 0 offline, 1 online, 2 busy, 3 away...
          game: p.gameextrainfo || "",
        });
      }

      // ---------- Friends list with status ----------
      // Steam gives the list of friend IDs; names, avatars and status come from player
      // summaries, 100 friends per request. Status is only kept for a minute (it changes often).
      if (url.pathname === "/friends") {
        const list = await (async () => {
          const u = new URL("https://api.steampowered.com/ISteamUser/GetFriendList/v1/");
          u.searchParams.set("steamid", steamid);
          u.searchParams.set("relationship", "friend");
          u.searchParams.set("key", env.STEAM_API_KEY);
          const res = await fetch(u, { cf: { cacheTtl: 300, cacheEverything: true } });
          if (res.status === 401 || res.status === 403) return null; // friends list is private
          if (!res.ok) throw new Error("Steam answered " + res.status);
          return ((await res.json()).friendslist || {}).friends || [];
        })();
        if (list === null) return json({ private: true, friends: [] });

        const since = Object.fromEntries(list.map((f) => [f.steamid, (f.friend_since || 0) * 1000]));
        const ids = list.map((f) => f.steamid);
        const chunks = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        const pages = await Promise.all(
          chunks.map((c) => steam("/ISteamUser/GetPlayerSummaries/v2/", { steamids: c.join(",") }, env, 60))
        );
        const friends = pages
          .flatMap((d) => (d.response && d.response.players) || [])
          .map((p) => ({
            steamid: p.steamid,
            name: p.personaname || "",
            avatar: p.avatarmedium || "",
            // 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play
            state: Number(p.personastate) || 0,
            game: p.gameextrainfo || "", // name of the game they're playing (if visible)
            gameId: p.gameid ? Number(p.gameid) : 0,
            lastOnline: (p.lastlogoff || 0) * 1000,
            since: since[p.steamid] || 0,
            profileUrl: p.profileurl || "",
          }));
        return json({ private: false, friends }, 200, 60);
      }

      // ---------- Your Steam groups ----------
      if (url.pathname === "/groups/mine") {
        const u = new URL("https://api.steampowered.com/ISteamUser/GetUserGroupList/v1/");
        u.searchParams.set("steamid", steamid);
        u.searchParams.set("key", env.STEAM_API_KEY);
        const res = await fetch(u, { cf: { cacheTtl: 3600, cacheEverything: true } });
        if (res.status === 401 || res.status === 403) return json({ private: true, groups: [] });
        if (!res.ok) throw new Error("Steam answered " + res.status);
        const d = (await res.json()).response || {};
        if (d.success === false) return json({ private: true, groups: [] });
        const ids = (d.groups || []).map((g) => String(GROUP_ID_BASE + BigInt(g.gid))).slice(0, 60);
        const infos = await Promise.all(ids.map((id) => groupInfo("gid/" + id).catch(() => null)));
        const groups = infos.filter(Boolean).sort((a, b) => b.members - a.members);
        return json({ private: false, groups }, 200, 3600);
      }

      if (url.pathname === "/games") {
        const data = await steam(
          "/IPlayerService/GetOwnedGames/v1/",
          {
            steamid,
            include_appinfo: "1",
            include_played_free_games: "1",
            format: "json",
          },
          env,
          600
        );
        const r = data.response || {};
        if (r.game_count === undefined) {
          return json({ private: true, games: [] });
        }
        const games = (r.games || []).map((g) => ({
          appid: g.appid,
          name: g.name,
          hours: Math.round((g.playtime_forever / 60) * 10) / 10,
          lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : 0,
        }));
        return json({ private: false, games });
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json(
        { error: "Could not reach Steam, try again later.", detail: String(e && e.message) },
        502
      );
    }
  },
};
