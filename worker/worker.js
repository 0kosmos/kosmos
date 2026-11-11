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
