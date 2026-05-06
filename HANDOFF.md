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
The prototype now has a four-agent cyborg squad rendered top-down on a procedural
cyberpunk street grid. Agents move as a formation under WASD. Number keys 1–4
toggle individual agent selection (Q toggles all). Left-click fires every selected
agent at the cursor. The HUD shows four health bars, a mission objective, and a
running clock. A briefing card sets the EuroCorp / rival-syndicate story tone before
the first mission. There is one hand-built mission: "Secure Sector 7" — eliminate
the four enemy guards on the map.

## What works
- Four agents, formation movement, per-agent damage and death
- Selection rings on selected agents, keyboard 1–4 / Q toggling
- Click-to-fire from all selected agents
- Enemy AI: chase + bump damage
- Win on all enemies dead, lose on all agents dead
- HUD: per-agent health bar, kills, time, objective
- Briefing overlay with story setup; debrief overlay on win/lose
- Static deploy via Vercel (`vercel.json` at repo root)

## What's stubbed / known gaps
- No civilians, no Persuadertron, no police
- One weapon, no loadout, no upgrades
- No world map / mission select — single mission only
- No persistence
- No sound
- Enemies have crude collision against obstacles
- No right-click move-order yet — agents are driven by WASD only
- No per-agent auto-fire — the squad fires only when player clicks

## Next up (pick the top unchecked box in IMPLEMENTATION_PLAN.md)
At the time of this handoff the live boxes under **Phase 1** are:
1. Per-agent auto-fire at nearest enemy in range
2. Click-to-move order (right click) for selected agents

Both are small (~one file each). After that, advance to **Phase 2** mission
systems: build a `world.js` with a typed objective model.

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
