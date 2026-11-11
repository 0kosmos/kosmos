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

      // ---------- Game page data (no Steam ID needed) ----------
      if (url.pathname === "/game") {
        const appid = url.searchParams.get("appid") || "";
        if (!/^\d{1,9}$/.test(appid)) {
          return json({ error: "Please add ?appid=<number>" }, 400);
        }

        const [detailsRaw, rv] = await Promise.all([
          storeJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`),
          getReviews(appid).catch((e) => ({ failed: String(e && e.message) })),
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
          300
        );
        const p = data.response?.players?.[0];
        if (!p) return json({ error: "Profile not found" }, 404);
        return json({
          steamid: p.steamid,
          name: p.personaname,
          avatar: p.avatarfull,
          profileUrl: p.profileurl,
          isPublic: p.communityvisibilitystate === 3,
        });
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
