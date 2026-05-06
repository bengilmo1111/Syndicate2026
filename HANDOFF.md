# Handoff — Syndicate 2026

This file is the single source of truth for "what is the world like right now"
when an AI session opens this repo. Read this **first**. Update it **last**, in
the same commit as your code change.

## Branch & deploy
- **Production:** `main` is the branch Vercel deploys to https://syndicate2026.vercel.app/.
  Anything merged to `main` ships to that URL within ~30s.
- **Feature work:** new work goes on `claude/syndicate-game-foundation-RPdGc`
  (or a fresh `claude/<topic>` branch). Open a small focused branch, commit,
  push, then merge to `main` with `git merge --no-ff` to keep the lineage
  visible in `git log --graph`.
- Don't squash. Small descriptive commits make the change history readable.

## How to test locally
The game is a static site with no build step.
```
python3 -m http.server 8000
# then open http://localhost:8000/
```
Or open `index.html` directly in Chrome / Edge / Firefox.

## How it deploys
`vercel.json` configures the repo root as a static site. Pushing to the feature
branch produces a Vercel preview URL automatically (if the project is connected).
No environment variables required.

## Current state (one paragraph)
The prototype is a four-agent squad on a top-down cyberpunk street grid running
the "Sector 7 — Reclamation" mission. WASD moves selected agents in formation.
Number keys 1–4 select; Q toggles all. Right-click issues a move order to the
selected agents that preserves their relative formation; a coloured chevron
marks each pending destination. Hold left-click to focus all selected agents
on the cursor. When the mouse is up, every alive agent auto-fires on the
nearest enemy within 260 px. Mission state lives in a typed model in
`world.js` (objectives, types, status); the HUD shows the active objective's
progress like `Eliminate rival guards (3/5)`. Win when all objectives
complete; lose when the squad is wiped.

## What works
- Four agents, formation movement, per-agent damage / death
- 1–4 select / Shift+number toggle / Q select-all
- Right-click move order, formation-preserved, with on-canvas markers
- Hold left-click for focus fire; auto-fire when mouse is released
- Enemy AI: chase + bump damage with obstacle slide
- Typed mission model: objectives with type/target/progress/status
- HUD: per-agent health bar, kills, time, active objective + progress
- Briefing / debrief overlays with redeploy
- Static deploy via Vercel (`main` → https://syndicate2026.vercel.app/)

## What's stubbed / known gaps
- Only one objective type implemented (`ELIMINATE`)
- One mission, no world map / mission select
- No civilians, no Persuadertron, no police
- One weapon, no loadout, no upgrades, no research
- No persistence (no localStorage save yet)
- No sound or particle effects
- No line-of-sight check on auto-fire — agents will shoot through walls

## Next up (top of Phase 2 in IMPLEMENTATION_PLAN.md)
1. **Objective panel UI**: a Tab-toggled list showing every objective with
   its status and progress. Lives in `ui.js` with new DOM in `index.html`.
2. **Mission registry**: pull the inline `makeMission()` body in `world.js`
   into a `missions/sector-7.js` file and let `world.js` look up by id.
3. **Add a second objective type**: `RETRIEVE` is the easiest next step —
   add a briefcase entity to `entities.js`, count pickups, complete the
   objective when target reached.

After Phase 2 closes, Phase 3 (civilians + Persuadertron) is the big-ticket
feel-of-Syndicate work.

## Files of note
- `PRD.md` — vision, story, scope. Update before scope changes.
- `IMPLEMENTATION_PLAN.md` — roadmap. Tick boxes as you go.
- `HANDOFF.md` — this file. Keep current.
- `index.html` — entry. Canvas + briefing overlay live here.
- `styles.css` — neon palette, HUD layout, briefing/debrief cards.
- `game.js` — main loop, input handling, mission state machine.
- `entities.js` — Agent, Enemy, Projectile, obstacles, spawners.
- `squad.js` — squad selection, formation movement, orders.
- `ui.js` — HUD DOM updates and overlay text.
- `vercel.json` — static deploy config.

## Working agreement
- One logical change per commit. Conventional-style messages
  (`feat:`, `fix:`, `docs:`, `refactor:`).
- Update `IMPLEMENTATION_PLAN.md` checkboxes in the same commit as the code.
- Update this file at the end of the session if the "current state" or "next up"
  section is no longer accurate.
- If you change controls or add a key binding, also update the briefing card
  copy in `index.html` so players see it.

## Skills considered
No new Claude Code Skills are needed for this project right now. It's a static
JS game — the existing `simplify` and `review` skills cover code-quality passes.
If we add a build step or a server later, revisit.
