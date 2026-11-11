Alright so heres the CURRENT STATE
- Library grid (about 110 games) with search, sort and filter, game page with Play button (steam://run), reviews and rating, Settings (tabs on/off with up/down arrows, performance mode).
- Steam data comes through my Cloudflare Worker proxy (API_BASE), so my Steam API key stays off users' PCs.
- Login is a temporary "paste your SteamID64" box.
- My PC is old (i7-3770, 16GB DDR3, GTX 1650 Ti), so it's my low-end test machine.
- Current footprint in a dev build: about 10 MB idle and up to about 70 MB on a game page, 0% CPU idle (Steam's client uses 500 to 600 MB and about 30% CPU for comparison).

GLOBAL RULES
- Performance is the top priority and Kosmos's main selling point: low idle RAM, near-0% idle CPU, small install, fast on low-end PCs. Cache data on disk, virtualized lists, lazy-load tabs and features, never fetch for the whole library at once (respect Steam's rate limits), no background polling unless a feature truly needs it (and then keep it slow and pause it when the window is hidden).
- PERFORMANCE BUDGET: after each phase, tell me how to measure Kosmos's total RAM (all its processes, including WebView2) and idle CPU in a release build (npm run tauri build), and warn me if a feature noticeably increases them. Suggest a cheaper approach whenever one exists.
- "Reduce motion" must turn effects and animations off (performance mode was merged into it).
- Clean, modern, slightly "polished" look, not overdone. Use CSS variables for themes so switching is instant.
- No notifications and no in-game overlay (both removed on purpose, i wanted to add before but not anymore). Never inject into or hook games. Never ask for or store Steam passwords. No "Steam" or Valve branding in the app name.

PHASE 1: THEMES, SETTINGS FOUNDATION AND LOOK
1. Change the default theme from dark blue to a true black style (near-black backgrounds, subtle borders, keep the accent color). Add a Settings option for a light "white" theme. Save the choice.
2. Polish the sidebar, Settings page and Library (spacing, hover states, consistent corners and typography). Library tiles without cover art should fall back to the game's header or capsule image before the colored letter tile.
3. Settings sections: Appearance (theme, reduce motion), Performance (performance mode), Window behavior.

PHASE 2: REAL STEAM SIGN-IN
- Replace the SteamID box with "Sign in through Steam" (Steam OpenID): open Steam's login in the browser, return to the app (deep link or local callback, whichever is simplest and safe for Tauri 2), and verify the response with Steam (check_authentication), ideally in my Cloudflare Worker so logins can't be faked. Save the verified SteamID, add Sign out, and show a friendly message if the profile's game details are private.

PHASE 3: GAME PAGE
- Cleaner, more appealing layout: system requirements (minimum and recommended) in a card on the right.
- Reviews: show reviewer's Steam avatar and username with a small icon/link to their Steam profile (fetch avatars and names in batches via the proxy and cache them), and a "Show more" button to load more reviews.
- "Latest updates" section like Steam's (recent news and patch notes: title, date, short preview, link), clean and collapsible.
- A "Write a review" button that opens the game's Steam review page (we can't submit reviews from outside Steam, so just link to it).
- Install / Update buttons that use steam:// links so the Steam client does the work. Don't try to download games ourselves.

PHASE 4: SIDEBAR AND LIBRARY FEATURES
1. Sidebar tabs can be dragged to reorder and hidden (Library is mandatory and always visible). Keep the existing Settings toggles in sync.
2. "Currently playing: <game>" indicator in the sidebar when a game is running (detect it cheaply on Windows, e.g. Steam's RunningAppID registry value, and tell me if you're unsure).
3. (CHANGED: the hover card was dropped. Instead: small Play / Install button under each library tile [done], and the estimated launch time shows when hovering a Play button, in the library and on the game page. The launch-time details below still apply.) Original idea: Library hover card (about 300 ms delay): game name, review percent with Steam's label and 5 stars converted from the percent (show the percentage next to the stars), and an APPROXIMATE launch time labeled "Estimated". Estimate it from the drive type (SSD or HDD), the game's install size and the CPU/RAM, shown as a range with a "~". As the user launches games through Kosmos, measure the real time until Steam reports the game as running, store it per game, and use the average of real launches instead of the estimate. Be clear about what the estimate can't know, and tell me what Windows APIs you'd use to detect the drive type. Fetch only on hover, cache about 24 hours.
4. Downloads view: read Steam's local appmanifest_*.acf files (including extra library drives) to show installed games, update-available badges, size on disk and download progress, as a toggleable lazy-loaded tab.

PHASE 5: MY PC AND WINDOW BEHAVIOR
1. A "My PC" panel in the sidebar: GPU, CPU, RAM, OS (read once and cached).
2. OPTIONAL live CPU, GPU and RAM usage for the running game, shown inside Kosmos only while its window is visible (pause all polling when it's hidden or minimized). Light polling (about 2 s). Tell me how GPU usage can be read on Windows for NVIDIA, AMD and Intel (vendor-neutral options if possible), and what you're unsure about.
3. Settings option: "When I press X: close the app, or minimize to the system tray" (default: close). Tray icon with Open and Quit.

PHASE 6: LIBRARY FILTERS (CHANGED: the news panel was dropped)
- A filter panel on the left of the Library (like Steam store filters): checkboxes for status (Installed locally, Not installed, Played, Never played, Played in last 2 weeks) and Steam tags shared by 2+ of your games (Horror, Multiplayer, FPS...). A game must match everything ticked. Tags fetched 50 games per request, cached 7 days. Panel can be hidden; overlays the games in narrow windows.
- (dropped) A "News and updates" area for the user's games. Let the user choose where it sits (left, right or top of the library), with the library able to shrink to make room. Clicking an item opens it in a centered popup (modal) over a dimmed and slightly blurred app background. Keep it light, and no blur when reduce motion is on.

STORE [done]: Store tab with best deals (25%+ off, 80%+ reviews), search, filters (price meter, discounted only, free only, min reviews, up to 5 categories), sort, load more. Game page shows price + Buy on Steam for games you don't own (purchase happens in the Steam client).

MARKET [done]: Community Market tab: games (CS2, Dota 2, TF2, Rust, Steam items, PUBG...), each game's own categories (CS2: type, weapon, exterior, quality...), price range, sort, search, item details with Steam's exact prices, "Buy on Steam Market" (opens in the Steam client). Steam allows 10 items per request without login, so the Worker combines 3 pages per load and caches.

LATER (not now): Friends, Community and Workshop pages.

Start with Phase 1, step 1 (the theme system), since everything else depends on it. After each step, tell me exactly how to test it and when to commit and push.