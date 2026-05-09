# Handoff — Syndicate 2026

This file is the single source of truth for "what is the world like right now"
when an AI session opens this repo. Read this **first**. Update it **last**, in
the same commit as your code change.

> **If you are about to write any story material — briefings, debriefs,
> mission copy, character lines, civilian VO, UI flavor text — stop and
> read [`NARRATIVE.md`](./NARRATIVE.md) first.** It is the canonical
> source for the four-act arc, characters, lexicon, and per-mission slot
> notes. Mission slots are pre-defined there; pick the corresponding
> slot rather than inventing parallel fiction.

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
The prototype is a four-agent squad on a top-down cyberpunk street grid with
two playable missions selectable from the briefing card via tabs. **Sector 7 —
Reclamation** (Act I Mission 1, `ELIMINATE` x5) and **District 12 — Annexation
Vote** (Act I Mission 2, `PERSUADE` x8, no rival enemies at start) are both
wired through the mission registry. WASD moves selected agents in formation.
Number keys 1–4 select; Q toggles all. Right-click issues a formation-
preserving move order; chevron markers show pending destinations. Hold left-
click to focus fire; auto-fire engages when the mouse is up. Press Space to
engage the Persuadertron — a 170 px cyan ring around each agent that converts
civilians into followers and suppresses fire while engaged. Civilians have HP
and die from projectile fire; killing them spikes HEAT (`+15` each), and once
HEAT crosses 60 two police units spawn at random map edges. The HUD shows
objective progress, hostiles down, followers, a HEAT meter that shifts
cyan→yellow→magenta, mission time, and the `PERSUADERTRON ENGAGED` badge.
The full four-act narrative arc and per-mission slot specs live in
`NARRATIVE.md`.

## What works
- Four agents: formation movement, per-agent damage / death, KIA flag
- Selection: 1–4 select / Shift+number toggle / Q select-all
- Right-click move order, formation-preserved, with on-canvas markers
- Hold left-click focus fire; release for auto-fire on nearest enemy in range
- Persuadertron (Space) — converts civilians within 170 px to followers
- Civilians wander on streets, have 30 HP, can die to friendly fire
- Followers follow squad centroid at follow speed
- Enemy AI: chase + bump damage with obstacle slide
- Police aggro: heat ≥ 60 spawns 2 yellow police; police kills don't count
  toward ELIMINATE (only `faction === 'rival'` does)
- Typed mission model with `eliminate` and `persuade` types wired
- Mission registry under `missions/` with `sector-7` and `district-12`;
  `startEnemies` / `civilianCount` config fields drive per-mission setup
- Mission-select tabs on the briefing card (cyan when active)
- HUD: per-agent health bar, kills, followers, HEAT meter, time, objective
- Briefing reads from mission def; debrief offers redeploy
- Static deploy via Vercel (`main` → https://syndicate2026.vercel.app/)

## What's stubbed / known gaps
- No persistence (no localStorage save yet)
- No sound or particle effects
- No line-of-sight check — agents shoot through walls
- Only `eliminate` and `persuade` objective types wired in `updateMissionStatus`
- No interstitials between missions yet (briefing → mission → debrief only)
- No branch-flag plumbing for the narrative choices in `NARRATIVE.md` Act II+
- No mission-completion gating — both missions are always available; the
  arc-order story isn't enforced yet

## Next up (top of Phase 2 / 3 in IMPLEMENTATION_PLAN.md)

For mission work, briefing copy, debriefs, character lines, or any narrative
material, **read `NARRATIVE.md` first** — mission slots are pre-defined.

1. **Mission 3 — `halcyon-lab` (Asset Retrieval)**: needs a new `RETRIEVE`
   objective type and an extraction NPC that follows the squad once
   collected. See `NARRATIVE.md` Act I, Mission 3. The extraction NPC
   could be a Civilian variant (already follows the squad centroid).
2. **Mission 4 — `the-bracket` (Terror Cell)**: introduces the **Unstrung**
   as an enemy type — weak, poorly-armed civilians presented as terrorists.
   First time the player kills people the briefing has lied about.
3. **Objective panel UI**: Tab-toggled list of every objective with status
   and progress, not just the active one (Phase 2 leftover).
4. **Mission gating**: lock missions until prerequisites complete, so the
   player walks the arc in order.

## Heat / police mechanic (current behaviour)
- Every projectile fired adds `+1` to `state.heat` for each civilian
  within 110 px of the projectile spawn point.
- Killing a civilian with friendly fire adds `+15` heat on top of that.
- When `state.heat >= 60`, two `Police` units spawn at random map edges
  and `state.heat` resets to 20.
- Police share `Enemy` behavior (chase + bump + take damage) but are
  yellow and faster. They keep coming while heat keeps climbing.
- Police kills do NOT count toward the ELIMINATE objective —
  `state.kills` only increments for `enemy.faction === 'rival'`.
- Persuadertron suppresses fire entirely, so a pacifist run never
  generates heat or police.
- The HUD's HEAT meter shows progress toward the threshold; it shifts
  cyan → yellow → magenta as the bar fills.

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
