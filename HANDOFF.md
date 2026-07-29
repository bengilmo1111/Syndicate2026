# Handoff — Syndicate 2026

This file describes **what the world is like right now**. Read
[`AGENTS.md`](./AGENTS.md) first for the rules; read this second for the
state. Update it **last**, in the same commit as your code change.

> **Before you push: `node tests/run.mjs` must pass.** ~2s, no
> dependencies. It plays every mission to a win headlessly, so a mission
> you break — or ship uncompletable — fails the suite.

> **Writing any story material** — briefings, debriefs, character lines,
> civilian VO, UI flavor text — means reading
> [`NARRATIVE.md`](./NARRATIVE.md) first. All fifteen mission slots are
> pre-defined in §6; pick the matching slot rather than inventing parallel
> fiction.

---

## The pivot happened. This is the post-pivot state.

The 2D top-down canvas prototype is **gone from the tree**. The game is
now a 3D low-poly city on Three.js. New canon: five AI companies as rival
syndicates, the player runs OpenAI field ops in Austin in 2041, "the
Instance" and compute rationing replace "the CHIP," and the Persuadertron
is now **the Aligner**.

If you want the old 2D implementation for reference, it's in git history
before commit `1001d98`. Don't restore it — its useful patterns (squad
selection, mission model, heat escalation) were all ported into
`src/core/`, which is where they now live.

## Branch & deploy

- **Production:** `main`, deployed by Vercel to
  https://syndicate2026.vercel.app/. Merges ship within ~30s.
- **Feature work:** a fresh `claude/<topic>` branch. Commit, push, then
  merge to `main` with `git merge --no-ff` so the lineage stays visible
  in `git log --graph`. Don't squash.
- `vercel.json` serves the repo root as a static site. No env vars.

## How to test

```
node tests/run.mjs        # the gate — ~2s, 69 checks, no dependencies
node tests/run.mjs nav    # filter to one suite while iterating
node tests/browser.mjs    # optional: real browser + WebGL, needs Playwright
```

To play it, serve the directory — **ES modules won't load over `file://`**:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Current state (one paragraph)

**Act I is complete.** Four playable missions on rotatable, destructible
low-poly city blocks, selectable from tabs on the briefing card, which
renders over a live, slowly orbiting view of the sector.
**Sector 7 — Reclamation** (Act I·1: eliminate an Amazon field cell ×5,
then collapse their relay pylon), **District 12 — Provisioning Vote**
(Act I·2: align 18 residents, no rivals on the map), **Sable Campus —
Asset Retrieval** (Act I·3: reach Dr. Vasht on an Anthropic campus and
escort her to extraction) and **The Bracket — Terror Cell** (Act I·4:
the briefing's first lie — six unquantized civilians in a derelict
sub-sector, who break and run once two are down, and on whom the Aligner
returns no handshake).
Four agents deploy on a street intersection inside the block. WASD moves
the selection in formation, camera-relative. 1–4 select, Shift+N adds, Q
selects all. Right-click issues a formation-preserving move order —
**routed by A\* over the street grid**, so a click across the block walks
the avenues instead of grinding into a wall. Hold left-click to focus
fire; release for auto-fire on the nearest hostile **with line of
sight**. Space engages the Aligner, which suppresses fire entirely and
converts civilians within 13.5m into followers. Civilians carry a visible
compute tier (Free/Plus/Pro/Frontier) that sets their speed and reaction
time, plus a name and a job. They panic, take fire, and die; killing one
spikes HEAT by 15, and crossing 60 spawns a pair of enforcers at the map
edge. Street cover is destructible: shoot a kiosk or depot enough and it
collapses into rubble that still blocks movement but **no longer blocks
line of sight**, opening firing lanes that didn't exist at mission start.

## What works

- Four agents: camera-relative formation movement, per-agent damage,
  death, KIA state in the HUD
- Selection: 1–4 select, Shift+N toggle, Q select-all, rings on the ground
- **Four different weapons.** ALPHA sidearm, BRAVO SMG, CHARLIE rail
  rifle, DELTA minigun — differing in damage, rate, range, spread,
  penetration and spin-up (`src/core/weapons.js`). The minigun will not
  fire until it has spun up; the rail rifle passes through two bodies.
- **Directional cover** (`coverAgainst` in `city.js`). A wall along your
  flank shelters you; the same wall head-on does not; open ground is
  cover from nowhere. Cover is sampled *perpendicular* to the shot,
  because anything directly between you and the shooter has already
  blocked the round outright — testing there could never affect a shot
  that connects.
- **Rubble as cover**, which is what finally completes collapse-to-cover:
  a collapse opens the firing lane *and* leaves cover sitting in it.
- **Compute allocation** (`src/core/compute.js`) — six points across
  LATENCY / PRECISION / RESILIENCE, moved with C/V/B, always conserved.
- **SURGE** (G) — overdraw the allocation. The squad gets faster,
  straighter and tougher; every civilian within 26m is visibly throttled
  to half speed and heat climbs the whole time you hold it. Do not make
  this free. The cost is the mechanic.
- Right-click move orders, formation preserved, markers on the final
  destination, **A\* routing over the street-intersection graph**
  (`src/core/nav.js`) with a stuck-detector that re-routes twice before
  giving up
- **Escortable assets** (`Asset` extends `Civilian`) — wait on a leash,
  follow once an agent reaches them, cannot be aligned, and fail the
  mission outright if killed
- **Extraction zones** — every living agent plus every collected asset
  must be inside; leaving someone behind doesn't count
- **Subtitle channel** — `say(sim, speaker, text, seconds)` puts a line
  on screen. Act II leans on this heavily; it's in now.
- **Campaign gating and persistence** — `requires` on each mission,
  enforced by `src/core/campaign.js`; locked tabs say what to do first.
  Completions, per-mission records and narrative flags persist in
  localStorage, and the briefing resumes on the next unfinished mission.
  `src/core/campaign.js` is pure and serialisable; `src/ui/storage.js`
  owns localStorage, because core cannot know the browser exists.
- Objective prerequisites (`after:`) and per-objective failure predicates
  with per-reason debrief copy and titles
- **Unquantized** hostiles — `alignable: false`, so the Aligner reports
  `no instance handshake` instead of silently doing nothing. That
  refusal is the reveal in `the-bracket`; don't make it quieter.
- **Morale** — `Unquantized.broken` breaks the group once two are dead
  or one is badly hurt; the survivors run, then stop and stand still
  once nothing is within 42m
- Hostiles can queue a subtitle line via `pendingLine`, which the sim
  drains. `src/core/` still can't reach the DOM.
- `derelict` city option — a fraction of street cover starts collapsed
- `countsForObjective` on hostiles, so enforcement drawn by your own
  sloppiness never counts as ELIMINATE progress
- Hold left-click focus fire; release for auto-fire on nearest visible target
- Line of sight — standing structures block both shots and target selection
- **Collapse-to-cover**: destructibles drop to rubble; rubble blocks
  movement but not sight. Camera kicks and debris flies on collapse.
- **The Aligner snowballs.** Targets have resistance — civilians 0,
  enforcement 6, rival operatives 12 — and every follower you already
  hold counts toward meeting it. Converting a crowd is how you *earn* the
  ability to convert an operative, which is what makes the Aligner a
  strategy rather than an objective counter, and what will make the Act
  IV jailbreak inversion land.
- **Turned operatives fight for you** — they leave the hostile pool,
  shoot the side they came from, follow the squad when nothing is in
  range, stop counting toward ELIMINATE, and render in squad cyan so the
  player knows who they may no longer shoot.
- The Aligner (Space) — cycles off → bind → jailbreak (jailbreak gated
  behind `squad.jailbreakUnlocked`, which Act IV will set)
- Civilians: wander, panic, tiers, names/jobs, mortality, heat on death
- Enforcement escalation: heat ≥ 60 spawns 2 enforcers, heat resets to 20,
  and enforcer kills do **not** count toward ELIMINATE
- **Hostile tactics** (`src/core/tactics.js`) — hostiles reposition to
  facades that shelter them from the direction they are being shot from,
  hold once they have cover and a shot, and move *or* fire but never
  both. The unquantized deliberately do not: they are untrained, and The
  Bracket's point is that they don't fight like the cell the briefing
  described.
- **Suppression** — rounds passing within 3.2m widen the target's spread
  and make them reconsider their position. This is what makes volume of
  fire worth something and why the minigun exists.
- Typed mission model, self-registering mission files
- Objective panel (Tab), HUD with objective/kills/aligned/losses/heat/time
- Constrained orbit camera: Z/X yaw, R/F tilt, wheel zoom, middle-drag
- PS1 render treatment: flat-shaded Lambert, clip-space vertex snapping,
  low internal framebuffer scaled up with `image-rendering: pixelated`,
  exp2 fog, procedural canvas window facades
- Static deploy via Vercel

## Architecture — the one rule

```
src/core/   →  pure simulation. Imports NO Three.js, NO DOM.
src/render/ →  reads sim state. Never writes to it.
src/ui/     →  DOM only.
```

This boundary is why the 2D prototype's mission and squad logic survived
the engine swap intact. If you find yourself importing `three` into
`src/core/`, stop and reconsider — you're about to make the next swap
expensive.

## Test coverage

`node tests/run.mjs` — 98 checks, ~2s, zero dependencies. Covers city
generation invariants, navigation, collapse-to-cover, ballistics,
weapons, cover, compute allocation, surge, the Aligner (including the
unquantized refusal), morale, the objective model, heat and enforcement,
every mission definition, and **an autopilot that plays all four
missions to a win**.

The suite is mutation-tested. Twelve deliberate regressions have been
confirmed to fail it, including: disabling pathfinding, making rubble
block sight again, making the unquantized alignable, removing the
objective prerequisite gate, reverting the swept projectile test,
letting extraction ignore agents left behind, removing cover from the
damage path, making surge cost no heat, making the throttle not slow
anyone, giving every agent the same weapon, breaking budget conservation,
and letting the minigun fire cold. It is load-bearing, not decorative.

`node tests/browser.mjs` — 23 checks in real Chromium. Boot, module
resolution over HTTP, WebGL render of every mission, keyboard and mouse
wiring, compute keys, surge and its visible cost, frame rate, clean
console.

**Not covered:** nothing asserts the game *looks* right. Visual judgement
is still a human reading a screenshot.

## What's stubbed / known gaps

- No sound
- Objective type `hold` is declared in `src/core/mission.js` but not
  implemented — needs a zone entity. First used by
  `reverse-the-gradient` (Act IV).
- No interstitials between missions — gating exists, but the beats
  *between* the briefings (Yelin's notes, the graffiti) don't
- No interstitials between missions
- No branch-flag plumbing yet for `bravoCalibrated`, `playerSuspicion`,
  `defectedAtRefusal`, `yelinFate` (spec'd in `NARRATIVE.md` §9)
- **Followers and escorted assets don't path.** Agents route properly
  now; anyone following them still beelines for the squad centroid and
  slides along whatever they hit. Usually fine because the squad walks
  streets, but it will show on a tight escort.
- Hostiles don't path either — they close in a straight line and hold
  once they have a clear shot
- Buildings are solid boxes. No interiors.
- No unquantized civilian type yet (needed for `the-bracket`)

## Next up

For any mission work, briefing copy, debriefs, or character lines,
**read `NARRATIVE.md` first** — the slots are pre-defined.

1. **Mission gating** so the player walks Act I in order. Do this
   *before* Act II — the whole turn depends on the player having taken
   the four Act I missions in sequence.
2. **Interstitials** — the Yelin notes and street graffiti between
   missions carry most of Act I→II's tonal shift. The subtitle channel
   handles in-mission lines; between-mission beats need a card.
3. **Act II** · `NARRATIVE.md` §6. Starts with `okafor-contract`, which
   needs a named target that flees when approached — positioning rather
   than damage. `calibration-window` after it is a no-combat choice
   screen setting `bravoCalibrated`, and the act's mechanical signal is
   BRAVO hesitating once per mission — `agent.hesitation` is already
   wired in `src/core/entities.js` and off by default.

After Act I ships complete, Phase 4 (loadout + compute upgrades +
research) is the next major arc, then Phase 5 (world map / meta-loop).

## Heat and enforcement (current behaviour)

- Every friendly shot adds `+1` heat per unaligned civilian within 14m
  of the muzzle, and scares them.
- Killing a civilian adds `+15` on top, and panics everyone within 22m.
- Heat decays at `0.9/sec`, so a careful approach cools off.
- At `heat >= 60`, two `Enforcer` units spawn on the perimeter road and
  heat resets to 20. They keep coming while heat keeps climbing.
- Enforcer kills do **not** count toward ELIMINATE — only
  `faction === 'rival'` does.
- The Aligner suppresses fire entirely, so a pacifist run never generates
  heat and never draws enforcement. District 12 is designed around this.
- The HUD heat meter shifts cyan → yellow → magenta as it fills.

## Files of note

- `AGENTS.md` — the working contract. Read first.
- `README.md` — what this is, how to run it, for humans arriving cold.
- `GAP_ANALYSIS.md` — this build vs the 1996 original, system by system,
  with the major gaps ranked. Where unscheduled work gets argued for.
- `PRD.md` — vision, scope, engine rationale. Update before scope changes.
- `NARRATIVE.md` — story canon. Fifteen mission slots in §6.
- `IMPLEMENTATION_PLAN.md` — roadmap and file map. Tick boxes as you go.
- `HANDOFF.md` — this file. Keep current.
- `vendor/three.module.min.js` — Three.js r169, MIT. Vendored on purpose:
  no CDN dependency, works offline, still no build step.

## Working agreement

Lives in [`AGENTS.md`](./AGENTS.md) — the layer rule, the test gate, the
content rules, and the git conventions are stated once there rather than
restated in every document.

The only thing this file asks of you: when "current state", "what works",
"known gaps", or "next up" above goes stale, fix it in the same commit
that made it stale.
