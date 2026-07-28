# Syndicate 2026 — Implementation Plan

The long-term roadmap. Each phase is broken into small, independently
shippable steps so multiple agents can pick up and continue across
sessions without stepping on each other. Mark steps `[x]` done, `[~]` in
progress, `[ ]` not started. Always update this file in the same commit
as the work it describes.

> **Working agreement for AI sessions**
> 1. Read `HANDOFF.md` first. It is the current state of the world.
> 2. **If the next work is a mission, briefing, debrief, or any story
>    copy, read `NARRATIVE.md` *before writing*.** It's canonical for
>    tone, cast, lexicon, and the four-act arc. All fifteen mission slots
>    are pre-defined in §6 — pick the matching slot rather than inventing
>    parallel fiction.
> 3. Pick the *next* unchecked step from the in-progress phase. Don't
>    skip ahead.
> 4. Keep changes small — one or two files per commit, descriptive message.
> 5. Update this plan and `HANDOFF.md` in the same commit as your code.
> 6. Always leave the game runnable. Verify before you push (see
>    **Verification** below).
> 7. **Respect the layer boundary.** `src/core/` must never import from
>    `src/render/`, `src/ui/`, or Three.js. That separation is the only
>    reason the 2D prototype's logic survived the engine swap.

---

## Phase 0 — 2D foundation (DONE, then retired)
- [x] Canvas prototype: squad, missions, Persuadertron, civilians, heat/police
- [x] Two playable missions, mission registry, HUD, briefing/debrief

That prototype is gone from the tree. Its game-logic patterns live on in
`src/core/`; read `git log` before `1001d98` if you need the original.

## Phase 0.5 — Pivot re-baseline (DONE)
Premise, cast, and target fidelity all changed. This phase re-platformed
the 2D logic onto a 3D engine instead of losing it.
- [x] Lock the 3D stack — **Three.js r169**, vendored, no build step
- [x] Port squad state / mission model / objective model into
      engine-agnostic modules with no rendering dependency
- [x] One low-poly city block with a constrained orbit/tilt camera and
      four agents moving on it — the `PRD.md` hard checkpoint
- [x] Destructible structures proving collapse-to-cover (rubble keeps
      blocking movement but stops blocking line of sight)
- [x] Re-skin briefing/HUD copy to OpenAI field-ops framing
- [x] Re-run the 15 mission slots through the new lexicon
      (Halcyon → a named rival, CHIP → Instance, Persuadertron → Aligner,
      "unstrung" → "unquantized") — see `NARRATIVE.md` §6

## Phase 1 — 3D identity (DONE)
- [x] Four-agent squad with per-agent selection (1–4, Shift+N, Q)
- [x] Camera-relative formation movement under WASD
- [x] Constrained orbit camera: Z/X yaw, R/F tilt, wheel zoom, middle-drag
- [x] Right-click move orders with on-ground markers
- [x] Left-click focus fire; auto-fire on nearest target in range
- [x] Line of sight — shots blocked by standing structures
- [x] Multi-agent HUD strip with health and compute tier
- [x] PS1 render treatment: flat shading, vertex snapping, low-res
      framebuffer, exp2 fog, procedural window facades
- [x] Briefing card with story framing; debrief with stats

## Phase 2 — Mission systems (IN PROGRESS)
> Mission slots, names, briefings, and beats are in `NARRATIVE.md` §6.
> Do not invent parallel missions.

- [x] Mission objective model with a typed registry
- [x] Objective types shipped: `eliminate`, `align`, `demolish`,
      `retrieve`, `extract`
- [ ] Objective type remaining: `hold` (stubbed in `src/core/mission.js`,
      needs a zone entity — first used by `reverse-the-gradient`)
- [x] Objective prerequisites (`after:`) so an EXTRACT doesn't complete
      on frame one while the squad is still standing in the drop zone
- [x] Per-objective failure predicates and per-reason debrief copy
- [x] Victory on objectives complete, not on kill-all
- [x] Objective panel UI (Tab toggles the full list)
- [x] Briefing → mission → debrief flow with redeploy
- [x] Mission-select tabs on the briefing card
- [~] Act I missions: `sector-7`, `district-12` and `sable-campus`
      shipped; **`the-bracket` is next** and closes Act I
- [x] Subtitle channel for in-mission dialogue (`say()` in `sim.js`)
- [ ] Mission gating — lock missions until prerequisites complete so the
      player walks the arc in order
- [ ] Interstitial screens between missions (Yelin's notes, graffiti beats)

## Phase 3 — The Aligner and the street
- [x] Civilians with wander AI, tiers, names, and jobs
- [x] Aligner: radius conversion, followers trail the squad, fire
      suppressed while engaged
- [x] Civilians take fire and die; deaths spike heat
- [x] Enforcement escalation on heat
- [x] Jailbreak mode modelled (`squad.jailbreakUnlocked`, Act IV gate)
- [ ] Unquantized civilians — immune to the Aligner (needed for `the-bracket`)
- [ ] Panic contagion and crowd flow through streets
- [ ] Followers take cover instead of clumping on the squad centroid

## Phase 4 — Loadout and progression
- [ ] Pre-mission loadout screen: assign weapons per agent
- [ ] Weapon definitions: sidearm, SMG, minigun, incendiary, rail rifle,
      laser, plasma
- [ ] Per-weapon stats: damage, fire rate, range, spread, ammo, recoil
- [ ] Compute upgrade slots: latency / throughput / context window /
      attention range (3 tiers each)
- [ ] Compute + funds currency persisted in localStorage
- [ ] Research screen with timer-based unlocks

## Phase 5 — World map and meta-loop
- [ ] World map screen with datacenter nodes
- [ ] Per-sector compute income while held
- [ ] Mission selection from the world map
- [ ] Rival syndicate AI that contests held sectors
- [ ] Save / load syndicate state across sessions

## Phase 6 — Polish
- [x] Particle effects: tracers, impact sparks, collapse debris
- [x] Camera follow with smoothing; screen shake on collapse
- [ ] Sound: weapons, ambient city, mission stingers (CC0 or original)
- [ ] Building interiors — currently every structure is a solid box
- [x] Pathfinding — A* over the street-intersection graph (`src/core/nav.js`)
- [ ] Followers and escorted assets path too; they still beeline for the
      squad centroid and slide along whatever they hit
- [ ] Accessibility: colorblind palette, key remap, reduce-motion mode
- [ ] Mobile / touch controls (stretch)

---

## File map

```
index.html              entry — canvas, HUD DOM, overlay card
styles.css              HUD chrome, briefing/debrief cards
vendor/
  three.module.min.js   Three.js r169, vendored (MIT)
src/
  main.js               input, fixed-step loop, briefing→mission→debrief
  core/                 ENGINE-AGNOSTIC. No Three.js, no DOM.
    math.js             clamp/lerp, seeded RNG, segment-box, circle-box
    city.js             city generation, collision, line of sight, damage
    nav.js              A* over the street-intersection graph
    entities.js         Agent, Hostile, Enforcer, Civilian, Asset, Projectile
    squad.js            selection, formation, move orders, the Aligner
    mission.js          objective model, prerequisites, mission registry
    sim.js              the simulation — owns all mutable game state
  missions/             one file per mission, self-registering
    sector-7.js         Act I·1  ELIMINATE + DEMOLISH
    district-12.js      Act I·2  ALIGN
    sable-campus.js     Act I·3  RETRIEVE + EXTRACT
  render/               READS sim state, never writes to it
    ps1.js              materials, vertex jitter, fog, lights, windows
    cityView.js         city meshes, collapse reconciliation
    actorView.js        agent/hostile/civilian meshes
    fx.js               pooled tracers, sparks, debris, rings, cursor
    cameraRig.js        constrained orbit camera
    view.js             scene assembly, low-res pipeline, ground picking
  ui/                   DOM only
    hud.js              HUD updates, objective panel
    overlay.js          briefing/debrief cards
```

## Verification (every session)

No test suite yet — verify by playing. Run a local server (ES modules
won't load over `file://`):

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

1. Briefing card renders over a live view of the sector, slowly orbiting.
2. Mission-select tabs switch missions and reload the city.
3. DEPLOY drops four agents on a street intersection inside the block.
4. WASD moves the selection in formation, camera-relative — turn the
   camera with Z/X and confirm W still means "away from the camera."
5. 1/2/3/4 select, Shift+N adds, Q selects all; rings follow selection.
6. Right-click issues a move order; markers appear and clear on arrival.
7. Hold left-click to focus fire; release and agents engage on their own.
8. Shoot a street kiosk until it collapses — the camera kicks, debris
   flies, and you can now shoot across ground you couldn't before.
9. Space engages the Aligner; fire stops, nearby civilians convert.
10. On Sable Campus, right-click across the whole block and confirm the
    squad walks the avenues rather than grinding into a building. Reach
    Dr. Vasht, confirm her line appears as a subtitle, then escort her
    back to the ring — the extraction objective must not tick until she
    is collected, and must not complete with anyone left outside.
11. Tab opens the objective list with live progress.
12. Complete the objectives and confirm the debrief; confirm the wipe
    state by letting the squad die.
13. **Check the browser console is clean.** Zero errors is the bar.
