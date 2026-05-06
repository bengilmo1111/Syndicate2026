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
the "Sector 7 — Reclamation" mission. Civilians wander the streets and can be
converted with the **Persuadertron** (Space). WASD moves selected agents in
formation. Number keys 1–4 select; Q toggles all. Right-click issues a
formation-preserving move order; chevron markers show pending destinations.
Hold left-click to focus fire on the cursor; auto-fire engages when the mouse
is up and an enemy is within 260 px. Press Space to engage the Persuadertron:
firing is suppressed, a 170 px cyan ring is drawn around each agent, and any
civilian inside the ring switches sides and follows the squad. The HUD shows
objective progress, hostiles down, followers, mission time, and a
"PERSUADERTRON ENGAGED" badge while active. Mission and objective data live in
`world.js` + `missions/sector-7.js`.

## What works
- Four agents: formation movement, per-agent damage / death, KIA flag
- Selection: 1–4 select / Shift+number toggle / Q select-all
- Right-click move order, formation-preserved, with on-canvas markers
- Hold left-click focus fire; release for auto-fire on nearest enemy in range
- Persuadertron (Space) — converts civilians within 170 px to followers
- Civilians wander on streets, avoid spawning inside buildings
- Followers follow squad centroid at follow speed
- Enemy AI: chase + bump damage with obstacle slide
- Typed mission model with `eliminate` and `persuade` types wired
- Mission registry under `missions/` — adding a mission is one new file
- HUD: per-agent health bar, kills, followers, time, active objective + progress
- Briefing reads from mission def; debrief offers redeploy
- Static deploy via Vercel (`main` → https://syndicate2026.vercel.app/)

## What's stubbed / known gaps
- Followers can't be killed; civilians take no damage
- No police entity that reacts to gunfire
- Only `eliminate` and `persuade` objective types wired in `updateMissionStatus`
- One mission only, no world map / mission select
- One weapon (the Pulse Rifle); no loadout, no upgrades, no research
- No persistence (no localStorage save yet)
- No sound or particle effects
- No line-of-sight check — agents shoot through walls; civilians too

## Next up (top of Phase 3 / Phase 2 in IMPLEMENTATION_PLAN.md)
1. **Followers can be killed**: civilians take projectile damage; the
   FOLLOWERS counter ticks down when they die. Punishes friendly fire.
2. **Persuasion mission**: a second mission def (`missions/datacore.js`)
   with a `PERSUADE(target=4)` objective. Exercises the registry and
   typed objective model end-to-end. May need a mission-select screen.
3. **Objective panel UI**: Tab-toggled list of every objective with status
   and progress, not just the active one (Phase 2 leftover).
4. **Heat HUD**: surface the existing `state.heat` value as a meter so the
   player can see how close they are to triggering police. Currently
   police arrive without warning beyond the brief on-canvas flash.

## Heat / police mechanic (current behaviour)
- Each projectile fired adds `+1` to `state.heat` for every civilian
  within 110 px of the projectile spawn point.
- When `state.heat >= 60`, two `Police` units spawn at random map edges
  and `state.heat` resets to 20.
- Police share `Enemy` behavior (chase + bump + take damage) but are
  yellow and faster. They spawn endlessly while heat keeps climbing.
- Police kills do NOT count toward the ELIMINATE objective —
  `state.kills` only increments for `enemy.faction === 'rival'`.
- Persuadertron suppresses fire entirely, so a pacifist run never
  generates heat or police.

After those, Phase 4 (loadout + cybernetics + research) is the next major
arc. Phase 5 is the world map / meta-loop.

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
