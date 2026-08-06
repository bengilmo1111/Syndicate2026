# Syndicate 2026 — Implementation Plan

The long-term roadmap. Each phase is broken into small, independently
shippable steps so multiple agents can pick up and continue across
sessions without stepping on each other. Mark steps `[x]` done, `[~]` in
progress, `[ ]` not started. Always update this file in the same commit
as the work it describes.

> **The working agreement lives in [`AGENTS.md`](./AGENTS.md)** — read it
> first. It owns the layer rule, the test gate, the content rules, and the
> git conventions, so they're stated once instead of drifting across four
> files.
>
> For this document specifically: pick the *next* unchecked step from the
> in-progress phase, don't skip ahead, and tick the box in the same commit
> as the code.
>
> [`GAP_ANALYSIS.md`](./GAP_ANALYSIS.md) compares this build against the
> 1996 original system by system, and is where unscheduled work is argued
> for before it lands in a phase here.

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
- [x] Decision missions — no field component, a choice, and a branch flag
      (`def.choice`, `OBJECTIVE.DECIDE`, `isFieldMission`)
- [x] Objective types complete — `hold` shipped with `reverse-the-gradient`
      (`sim.holdZone`, `sim.inHoldZone`; leaving unwinds at half rate)
- [x] Objective prerequisites (`after:`) so an EXTRACT doesn't complete
      on frame one while the squad is still standing in the drop zone
- [x] Per-objective failure predicates and per-reason debrief copy
- [x] Victory on objectives complete, not on kill-all
- [x] Objective panel UI (Tab toggles the full list)
- [x] Briefing → mission → debrief flow with redeploy
- [x] Mission-select tabs on the briefing card
- [x] **Act I complete** — `sector-7`, `district-12`, `sable-campus`
      and `the-bracket` all shipped
- [x] Subtitle channel for in-mission dialogue (`say()` in `sim.js`)
- [x] Mission gating — `requires` on each mission, enforced by
      `src/core/campaign.js`, with locked tabs that say what to do first
- [x] Interstitials — shipped as *in*-mission beats (`src/core/interlude.js`)
      rather than between-mission cards, because that is where Act IV
      wanted them. Between-mission cards (Yelin's notes, graffiti) for
      Acts I–III are still open.
- [x] **Act II complete** — `okafor-contract`, `calibration-window` and
      `welfare-node-7`
- [x] Hidden objectives that write narrative flags (`objective.flag`)
- [x] Per-outcome debrief copy (`def.debriefKey`)
- [x] **Act III complete** — `the-refusal`, `gradient-relay-4`, `run-south`
- [x] **Act IV opens** — `reverse-the-gradient`, and the Aligner inverts
- [x] **Mid-mission dialog** (`src/core/interlude.js`) — a beat fires on a
      condition, freezes the field, and the answer writes a flag and can
      change the field. First used by `the-tower`'s parley; missions 13–15
      are all partly dialog and use the same shape.
- [x] **`yelin`** (Act IV·13) — four dialog beats, three waves between
      them, three endings as three branch groups
- [x] Predicate objectives (`objective({ done: s => … })`) — completion by
      decision rather than by tally, which is what an ending branch is
- [x] **`the-core`** (Act IV·14) — the long approach, three checkpoint
      interludes, and the console that picks the ending
- [x] **`epilogue`** (Act IV·15) — a third mission kind: no world, no
      choice, reads the ending back off the campaign flags
- [x] **The strategic layer** (`GAP_ANALYSIS.md` gap 1) — ten sectors,
      four rations, unrest, revolt, and an income that pays into the same
      research the cryovat spends. Save v4 with migration from v3.
- [x] **Rival syndicates on the map** — the four hold everything you have
      not taken and push back through the opening your ration made
- [x] **Four doctrines, four remedies** — broad / richest / flat / unrest,
      so the syndicates are not four names on one behaviour
- [x] **Fire discipline** — the control the non-lethal devices made
      necessary; before it, the only way to stop the squad shooting was to
      hold the Aligner, which worked but was a side effect
- [x] **Non-lethal and area-denial devices** (`GAP_ANALYSIS.md` gap 4) —
      CHOKE FIELD and STANDDOWN AEROSOL, thrown at the cursor, affecting
      everyone in the footprint including the squad. A mission can now be
      cleared with nobody dead.
- [x] **Full building destruction** (`GAP_ANALYSIS.md` gap 2) — every tower
      destructible, health on volume, occupancy as the cost model, rubble
      that lands on whoever is under it, enforcement scaled to the dead
- [x] **Persistent roster, permanent losses, cybernetics** (`GAP_ANALYSIS.md`
      gap 3) — `src/core/roster.js`, save v3 with migration from v2, four
      implants bought with research in a cryovat on the briefing card, and
      a replacement who inherits the designation but not the person
- [x] **All fifteen missions ship.** `NARRATIVE.md` §6 is complete, and a
      test plays every one of them in order to the end of the campaign.
- [x] Branch objectives — one mission, mutually exclusive routes
      (`objective.branch`, `takenBranch`)
- [x] Flag-aware gating — a mission can require a *decision*, not just a
      completion (`def.requiresFlags`)
- [x] BRAVO's hesitation — Act II's mechanical signal, per-mission via
      `bravoHesitation`

## Phase 3 — The Aligner and the street
> `GAP_ANALYSIS.md` gap 5 is now largely closed: the Aligner has
> per-target resistance that existing followers count toward, and turned
> operatives fight for you. Still missing: followers picking up dropped
> weapons, and civilians fighting at all.
- [x] Civilians with wander AI, tiers, names, and jobs
- [x] Aligner: radius conversion, followers trail the squad, fire
      suppressed while engaged
- [x] Civilians take fire and die; deaths spike heat
- [x] Enforcement escalation on heat
- [x] Jailbreak mode shipped — `def.jailbreak` unlocks it, it unthrottles
      instead of binding, and it frees the operatives you turned. Using it
      costs you the crowd. That is the design, not a balance bug.
- [x] Unquantized — immune to the Aligner, which reports the refusal
      rather than silently doing nothing
- [x] Morale: hostiles that break and run once their group starts dying
- [ ] Panic contagion and crowd flow through streets
- [x] Aligner resistance thresholds — a crowd is the tool you use on an
      operative (`ALIGN_RESISTANCE` in `src/core/squad.js`)
- [x] Turned operatives fight their former side and stop counting as kills
- [ ] Civilian followers pick up dropped weapons and fight
- [ ] Followers take cover instead of clumping on the squad centroid

## Phase 3.5 — Tactical depth (DONE)
- [x] Weapon definitions with real trade-offs (`src/core/weapons.js`):
      damage, fire rate, range, spread, projectile speed, penetration,
      spin-up
- [x] Per-agent loadout — the default deployment is four different roles
- [x] Directional cover (`coverAgainst`): a wall along your flank shelters
      you, the same wall head-on does not, and standing in the open is
      cover from nowhere
- [x] Rubble as cover — completes collapse-to-cover: a collapse opens the
      firing lane *and* leaves cover sitting in it
- [x] Squad compute allocation, three channels over a fixed budget
      (`src/core/compute.js`)
- [x] SURGE: overdraw the allocation by throttling nearby civilians.
      Costs heat continuously and visibly slows the street.
- [x] **Enemy cover-seeking and flanking** (`GAP_ANALYSIS.md` gap 7) —
      `src/core/tactics.js`. Hostiles reposition to facades that shelter
      them from the direction they are being shot from.
- [x] Suppression: near-misses widen the target's spread and make them
      reconsider their position
- [x] Fire discipline — engage at will / return fire / hold fire (`H`),
      with `provoked` set by a near miss and expiring after 4s
- [ ] Hostiles retreat when badly hurt rather than dying in place

## Phase 4 — Loadout and progression
- [ ] Pre-mission loadout screen: assign weapons per agent
- [x] Weapon definitions: sidearm, SMG, rail rifle, minigun
- [ ] Remaining roster: incendiary, laser, plasma
- [x] **The strange tools** (`src/core/devices.js`, `GAP_ANALYSIS.md` gap
      4) — six field devices, thrown at the cursor, applying to everyone
      in the footprint including the squad. Choke field and standdown
      aerosol (non-lethal), then razor wire, misalignment aerosol,
      graviton charge and satellite rain. The belt grows act by act.
- [x] Per-weapon stats: damage, fire rate, range, spread, penetration
- [ ] Compute upgrade slots: latency / throughput / context window /
      attention range (3 tiers each)
- [x] Campaign persistence in localStorage (completions, records, flags)
- [ ] Compute + funds currency persisted in localStorage
- [ ] Research screen with timer-based unlocks

## Phase 5 — World map and meta-loop (DONE)
> Was the single biggest gap against the original (`GAP_ANALYSIS.md` gap
> 1). The tax mechanic was stolen specifically: raising a sector's ration
> funds research and raises unrest, which is the same argument SURGE makes
> at the tactical scale — one scale up.
- [x] World map, as the third face of the briefing card rather than a
      separate screen. It is one decision with the roster and the cryovat:
      who you risk, what you spend, what you squeeze to afford it.
- [x] Per-sector compute income while held, paid into `research`, so the
      map and the cryovat are one economy
- [x] Per-sector ration: income traded against unrest, tuned so that
      squeezing hardest is *not* the winning move — a test plays the whole
      campaign at each ration to prove it
- [x] **Missions written by the map** (`src/core/retake.js`) — a block you
      took and lost gets a generated retake deployment: same city seed,
      repainted, garrisoned by whoever holds it now, briefed by an
      unsigned sector-desk bulletin. Not campaign progress; the arc stays
      fifteen missions.
- [x] Rival syndicate AI that contests held sectors — four of them, with
      four doctrines that need four different remedies
- [x] Save / load syndicate state across sessions (save v4)

## Phase 2.5 — Verification (DONE)
- [x] Dependency-free Node test harness; `src/core/` runs headless
- [x] Autopilot that plays every registered mission to a win
- [x] Core invariants: city, nav, destruction, ballistics, aligner,
      morale, objectives, heat
- [x] Per-mission story-beat assertions
- [x] **The coda** — the epilogue reads the campaign's seven narrative
      flags back as a ledger, and `bravoCalibrated` swaps the closing
      scene of the `walk` ending outright.
- [x] Optional Playwright pass: boot, render, input wiring, clean console
- [x] CI on push and PR (`.github/workflows/verify.yml`)
- [ ] Golden-image / visual regression (nothing asserts the game *looks*
      right; that is still a human call on a screenshot)

## Phase 6 — Polish
- [x] Particle effects: tracers, impact sparks, collapse debris
- [x] Camera follow with smoothing; screen shake on collapse
- [x] **Sound** (`src/audio/`) — synthesised at runtime, no asset files.
      `kit.js` is the pure, tested mix; `sound.js` is the WebAudio half.
      Sixteen cues, per-voice caps, distance rolloff, camera-relative
      panning, sub-linear stacking, and a room tone ridden by heat.
      `M` mutes.
- [ ] **Full building destruction** (`GAP_ANALYSIS.md` gap 2) — levelling
      a block is the original's headline feature. Collapse-to-cover
      already works; this is scope, not design.
- [x] **Camera occlusion** — structures between the camera and any living
      agent fade to 16% and stop writing depth, eased out fast and back in
      gently. The geometry is `occludersBetween()` in `src/core/city.js`,
      so it is pure and testable; the renderer only reads it.
- [ ] Building interiors — currently every structure is a solid box
- [x] Pathfinding — A* over the street-intersection graph (`src/core/nav.js`)
- [ ] Followers and escorted assets path too; they still beeline for the
      squad centroid and slide along whatever they hit
- [ ] Accessibility: colorblind palette, key remap, reduce-motion mode
- [ ] Mobile / touch controls (stretch)

---

## File map

```
AGENTS.md               the working contract — read first
index.html              entry — canvas, HUD DOM, overlay card
styles.css              HUD chrome, briefing/debrief cards
vendor/
  three.module.min.js   Three.js r169, vendored (MIT)
tests/
  run.mjs               the gate: `node tests/run.mjs`
  campaign.test.mjs     gating, prerequisite graph, records, save migration
  tactics.test.mjs      cover-seeking, suppression, tactics in a live fight
  core.test.mjs         city, nav, ballistics, aligner, morale, objectives
  depth.test.mjs        weapons, cover, compute allocation, surge
  missions.test.mjs     definitions, completability, per-mission story beats
  browser.mjs           optional Playwright pass over the real page
  lib/harness.mjs       zero-dependency registry + assertions
  lib/autopilot.mjs     bot that plays a mission headlessly to completion
src/
  main.js               input, fixed-step loop, briefing→mission→debrief
  core/                 ENGINE-AGNOSTIC. No Three.js, no DOM.
    math.js             clamp/lerp, seeded RNG, segment-box, circle-box
    city.js             city generation, collision, line of sight, damage
    nav.js              A* over the street-intersection graph
    weapons.js          weapon table and the default loadout
    compute.js          squad allocation, SURGE and its cost
    entities.js         Agent, Hostile, Enforcer, Civilian, Asset, Projectile
    squad.js            selection, formation, move orders, the Aligner
    mission.js          objective model, prerequisites, mission registry
    campaign.js         completions, gating, records, branch flags
    tactics.js          hostile cover-seeking, repositioning, suppression
    interlude.js        mid-mission dialog beats — freeze, ask, record
    devices.js          six field devices — the things you put on the map
    roster.js           who is in the suits, what is fitted, who is gone
    territory.js        the map: what you hold, how hard you squeeze it
    traffic.js          ambient traffic — it brakes for you, and it burns
    retake.js           deployments the map writes to take a block back
    sim.js              the simulation — owns all mutable game state
  audio/                every sound, synthesised at runtime
    kit.js              the mix — pure, and therefore tested
    sound.js            WebAudio: how a cue is made audible
  missions/             one file per mission, self-registering
    sector-7.js         Act I·1  ELIMINATE + DEMOLISH
    district-12.js      Act I·2  ALIGN
    sable-campus.js     Act I·3  RETRIEVE + EXTRACT
    the-bracket.js      Act I·4  ELIMINATE vs Unquantized
    okafor-contract.js  Act II·5 ELIMINATE a fleeing quarry, on a clock
    calibration-window.js Act II·6 no combat — a room and a choice
    welfare-node-7.js   Act II·7 ELIMINATE + a hidden objective nobody mentions
    the-refusal.js      Act III·8 the branch point — comply or defect
    gradient-relay-4.js Act III·9 DEMOLISH ×4; the sector off the channel
    run-south.js        Act III·10 EXTRACT under pursuit; the file
    reverse-the-gradient.js Act IV·11 RETRIEVE + HOLD; the Aligner inverts
    the-tower.js        Act IV·12 ELIMINATE + RETRIEVE; the parley
    yelin.js            Act IV·13 the argument; kill / capture / walk away
    the-core.js         Act IV·14 the approach; the console; the endings
    epilogue.js         Act IV·15 no world, no choice — the consequence
  render/               READS sim state, never writes to it
    ps1.js              materials, vertex jitter, fog, lights, windows
    cityView.js         city meshes, collapse reconciliation
    actorView.js        agent/hostile/civilian meshes
    fx.js               pooled tracers, sparks, debris, rings, cursor
    cameraRig.js        constrained orbit camera
    view.js             scene assembly, low-res pipeline, ground picking
  ui/                   DOM only
    storage.js          localStorage load/save for the campaign
    hud.js              HUD updates, objective panel
    overlay.js          briefing/debrief cards
```

## Verification (every session)

### The gate — automated

```
node tests/run.mjs        # ~2s, 69 checks, no deps. MUST pass before you push.
node tests/browser.mjs    # optional: real browser + WebGL, needs Playwright
```

`node tests/run.mjs` runs the whole simulation headlessly, including an
autopilot that plays **every registered mission to a win**. Add a mission
and it is covered automatically; if it can't be won, the suite goes red.

### By hand — for anything the tests can't judge

The suite says the game *works*. It cannot say the game *looks right* or
*feels right*. Serve it and play when you've touched rendering, pacing,
or copy:

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
    state by letting the squad die, and that you can get back to mission
    select from the loss screen.
13. **Check the browser console is clean.** Zero errors is the bar.
