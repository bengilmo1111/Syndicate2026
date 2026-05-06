# Syndicate 2026 — Implementation Plan

This is the long-term roadmap. Each phase is broken into small, independently
shippable steps so multiple agents can pick up and continue across sessions
without stepping on each other. Mark steps `[x]` as done, `[~]` as in progress,
`[ ]` as not started. Always update this file in the same commit as the work it
describes.

> **Working agreement for AI sessions**
> 1. Read `HANDOFF.md` first. It is the current state of the world.
> 2. Pick the *next* unchecked step from the in-progress phase. Don't skip ahead.
> 3. Keep changes small — one or two files per commit, descriptive message.
> 4. Update this plan and `HANDOFF.md` in the same commit as your code change.
> 5. Always leave the game in a runnable state. Open `index.html` and verify.

---

## Phase 0 — Foundation (DONE)
- [x] Project skeleton: `index.html`, `styles.css`, `game.js`, `entities.js`, `ui.js`
- [x] Single-agent prototype: WASD move, click to shoot, basic enemies
- [x] HUD shell with health / weapon / objective / kills / time
- [x] Cyberpunk overlay menu, neon palette in CSS
- [x] Initial PRD and plan committed

## Phase 1 — Syndicate identity (IN PROGRESS)
The point of this phase is to make the prototype unambiguously *Syndicate*-flavored.
- [x] Rewrite PRD around squad + story + Persuadertron pillars
- [x] Rewrite this plan with phased, checkable steps
- [x] Add `HANDOFF.md` and `vercel.json`
- [x] Replace single agent with a four-agent squad
- [x] Per-agent selection: keys 1–4 toggle; Q selects all
- [x] Formation movement under WASD (relative offsets preserved)
- [x] Multi-agent HUD strip (4 portraits / health bars)
- [x] Mission briefing card with story framing on game start
- [x] City backdrop: street grid + building blocks (placeholder tiles)
- [ ] Per-agent auto-fire at nearest enemy in range
- [ ] Click-to-move order (right click) for selected agents

## Phase 2 — Mission systems
- [ ] Mission objective model (`{ id, type, target, status, description }`)
- [ ] Objective types: `eliminate`, `persuade`, `retrieve`, `escort`, `escape`
- [ ] Objective panel UI (Tab to toggle)
- [ ] Mission victory triggered on objectives complete (not on kill-all)
- [ ] Briefing → mission → debrief flow with retry / continue
- [ ] Two more missions (different objectives, same map shell)

## Phase 3 — Persuadertron and civilians
- [ ] Civilian entity with simple wandering AI on streets
- [ ] Persuadertron weapon: cone effect, converts civilian to follower
- [ ] Followers trail the squad and break line of sight when killed
- [ ] Police entity that responds to gunfire near civilians
- [ ] Persuasion mission objective ("convert N civilians and escape")

## Phase 4 — Loadout and progression
- [ ] Pre-mission loadout screen: assign weapons per agent
- [ ] Weapon definitions: pistol, Uzi, minigun, flamethrower, long-range, laser, gauss
- [ ] Per-weapon stats: damage, fire rate, range, spread, ammo, recoil
- [ ] Cybernetic upgrade slots: legs / arms / chest / eyes (3 tiers each)
- [ ] Funds + research currency persisted in localStorage
- [ ] Research tree screen with timer-based unlocks

## Phase 5 — World map and meta-loop
- [ ] World map screen with city nodes
- [ ] Per-city tax income while held
- [ ] Mission selection from world map
- [ ] Rival syndicate AI that contests held cities
- [ ] Save / load syndicate state across sessions

## Phase 6 — Polish
- [ ] Particle effects on shoot, hit, death, persuade
- [ ] Camera follow with deadzone and smoothing
- [ ] Sound: weapons, ambient city, mission stingers (CC0/original)
- [ ] Accessibility: colorblind palette, key remap, reduce-motion mode
- [ ] Mobile/touch controls (stretch)

---

## File map (current and planned)
- `index.html` — entry, canvas, menu DOM
- `styles.css` — HUD + menu styling
- `game.js` — main loop, input, state machine
- `entities.js` — Agent, Enemy, Civilian, Projectile, geometry
- `ui.js` — HUD updates, overlay text
- `squad.js` *(planned)* — squad selection, formation, orders
- `world.js` *(planned)* — mission and city map data
- `weapons.js` *(planned)* — weapon definitions and behavior
- `assets/` *(planned)* — sprites, icons, audio

## Verification (every session)
1. Open `index.html` directly in Chrome or run `python3 -m http.server`.
2. Start mission. Confirm four agents render and respond to WASD.
3. Confirm 1/2/3/4 toggle selection (visible ring on selected).
4. Confirm clicking fires from all selected agents.
5. Confirm HUD shows four health bars and ticks down on damage.
6. Confirm a clear win/lose end state with retry.

## Notes
- No build step. ES modules served directly. This must remain true through Phase 5.
- Vercel deploys the repo root as a static site. See `vercel.json`.
- Avoid frameworks. If we need state management beyond a plain object, write it.
