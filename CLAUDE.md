# Kosmos

Desktop companion app that sits on top of the Steam client (not a replacement).
Stack: Tauri 2 + SvelteKit (Svelte 5 runes) + TypeScript. Rust only for a thin native layer.
The developer is a beginner: explain changes simply and say which file each change is in.

## Architecture
- Steam data comes through a Cloudflare Worker proxy (API_BASE in src/lib/config.ts).
  The Steam API key lives only in the Worker as a secret. Never put a key in this project.
- Games launch through the real Steam client with steam://run/<appid> (opener plugin).
- Login is Steam OpenID: app opens Worker /auth/login?state=<one-time code> in the browser, Worker verifies
  with Steam (check_authentication) and returns via kosmos://auth?steamid&state (deep-link + single-instance
  plugins). The app only accepts a link whose state matches its own pending code. Worker code is in worker/worker.js.

## Rules
- Performance is the top priority: low idle RAM, near-0% idle CPU, small install, fast on low-end PCs.
- Cache data, use virtualized lists, lazy-load tabs and features.
- Never fetch data for the whole library at once (Steam rate limits).
- No background polling unless truly needed; keep it slow and pause it when the window is hidden.
- "Reduce motion" (the only motion/effects setting; performance mode was removed) must turn effects and animations off.
- Themes use CSS variables in src/app.css (black default, light). No hard-coded colors.
- Clean, modern, slightly polished look, not overdone.
- No notifications, no in-game overlay, never inject into or hook games.
- Never ask for or store Steam passwords. No "Steam" or Valve branding in the app name.

## Workflow
- Make small changes, one step at a time.
- After each step, say how to test it.
- Remind me to commit when a step works.

- The full roadmap is in PLAN.md. Do one step at a time, then stop and wait for me to confirm it works before the next step.