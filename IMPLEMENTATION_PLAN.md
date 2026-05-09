# Syndicate 2026 — Implementation Plan

This is the long-term roadmap. Each phase is broken into small, independently
shippable steps so multiple agents can pick up and continue across sessions
without stepping on each other. Mark steps `[x]` as done, `[~]` as in progress,
`[ ]` as not started. Always update this file in the same commit as the work it
describes.

> **Working agreement for AI sessions**
> 1. Read `HANDOFF.md` first. It is the current state of the world.
> 2. **If the next work is a mission, briefing, debrief, or any story copy,
>    read `NARRATIVE.md` *before writing*.** That file is the canonical
>    source for tone, characters, lexicon, and the four-act arc. Mission
>    slots there are pre-defined — pick the corresponding slot rather
>    than inventing parallel fiction.
> 3. Pick the *next* unchecked step from the in-progress phase. Don't skip ahead.
> 4. Keep changes small — one or two files per commit, descriptive message.
> 5. Update this plan and `HANDOFF.md` in the same commit as your code change.
> 6. Always leave the game in a runnable state. Open `index.html` and verify.

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
- [x] Per-agent auto-fire at nearest enemy in range
- [x] Click-to-move order (right click) for selected agents

## Phase 2 — Mission systems
> Mission slots, names, briefings, and beats are defined in
> [`NARRATIVE.md`](./NARRATIVE.md) §5. Each mission below corresponds
> to a slot there; do not invent parallel missions.

- [x] Mission objective model (`{ id, type, target, status, description }`)
- [~] Objective types: `eliminate` and `persuade` shipped; `retrieve`,
      `escort`, `escape`, `sabotage`, `hold` still to do
- [x] Mission victory triggered on objectives complete (not on kill-all)
- [ ] Objective panel UI (Tab to toggle full list)
- [ ] Briefing → mission → debrief flow with retry / continue (already partial)
- [~] Mission select tabs on briefing (basic version shipped); world-map
      view still to do for Phase 5
- [~] Act I missions: `sector-7` and `district-12` shipped;
      `halcyon-lab` and `the-bracket` still to do (`NARRATIVE.md` §5 Act I)
- [x] Mission registry under `missions/` with one definition per mission

## Phase 3 — Persuadertron and civilians
- [x] Civilian entity with simple wandering AI on streets
- [x] Persuadertron weapon: range effect, converts civilian to follower (Space toggle)
- [x] Followers trail the squad
- [x] Followers can be killed (civilian death + heat penalty for it)
- [x] Police entity that responds to gunfire near civilians
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
