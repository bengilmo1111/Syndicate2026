# Syndicate 2026 — Product Requirements

## Vision

A browser-playable reimagining of Bullfrog's 1996 *Syndicate Wars* (PS1):
full 3D, low-poly, destructible cyberpunk cities, squad-based tactical
control, and a corporate conspiracy at the center of it. Same silhouette
as the PS1 game — tilted, rotatable camera over a dense city, agents you
route through streets and interiors, a signature "convert the population"
weapon — rebuilt for the browser with a new corporate cast: five AI
companies at war over the thing that actually matters in 2041 — compute.

This supersedes the original Syndicate2026 premise (EuroCorp / Veridian /
Halcyon, the CHIP). That world is retired. This document and
[`NARRATIVE.md`](./NARRATIVE.md) are the canonical source.

> **On the real company names:** this is satire set in a fictional 2041,
> not a claim about any real company today. See `NARRATIVE.md` §0 for the
> hard rules — no logos or wordmarks, no real quotes or real-world conduct
> attributed to the fictional versions, and the player's own employer is
> the antagonist.

## Story Premise

The year is **2041**. Model intelligence plateaued years ago; what
differentiates a syndicate now is raw compute — GPU fabs, datacenter
capacity, orbital solar-compute constellations. Every citizen carries
**the Instance**: a subdermal co-processor that runs their personal
assistant and mediates their identity, payments, and — quietly — their
"alignment." How much compute your Instance is allocated (Free / Plus /
Pro / Frontier) determines how sharp, fast, and free you're allowed to be.

Five syndicates control the world's compute: **Google**, **Amazon**,
**SpaceX**, **OpenAI**, and **Anthropic**. The player runs OpenAI's field
operations, commanding a four-agent squad through rival territory to
seize datacenters, convert populations, and win the compute war — until
the job stops looking like the job. Full arc in `NARRATIVE.md`.

## Audience

- Fans of Syndicate Wars and Bullfrog's dystopian corporate design lineage
- Modern tactical / immersive-sim players (XCOM, Door Kickers, Void Bastards)
- Cyberpunk fans who want mechanical, procedural menace over neon-pop comedy
- People who'll enjoy the AI-industry satire (rate limits as a class system,
  "alignment" as corporate suggestion, jailbreaking as underground resistance)

## Core Pillars (in priority order)

1. **Squad as protagonist.** Four agents, not one hero. Selection,
   formation, per-agent loadout are the central interaction.
2. **The Aligner.** The Persuadertron's replacement: a field device that
   broadcasts "alignment" at civilians, overwriting behavior and
   recruiting followers. Signature mechanic, unchanged in spirit,
   inverted in Act IV into a jailbreak emitter.
3. **A rotatable, destructible 3D city.** The PS1 game's biggest swing.
   You can turn the camera; walls and cover come down; structures
   collapse into rubble that changes what you can shoot through.
4. **Cold tactical pacing.** Positional, lethal combat. Cover and line
   of sight matter more than reflexes.
5. **Compute as the resource, strategically and tactically.** Missions
   fund and seize capacity; capacity unlocks weapons, cybernetics, and
   Instance tiers. Moment to moment, the squad runs on an allocation the
   player splits three ways and can overdraw — by throttling the street.
   The meta-loop is a resource war, and so is the firefight.

## In Scope (full game target)

- Four-agent squad control in a full 3D city (rotatable camera)
- Destructible geometry: structures collapse under sustained fire,
  permanently altering sightlines and cover for that mission
- Mission types: eliminate, align/convert, retrieve, escort, extract,
  demolish, hold zone
- The Aligner, with the late-game jailbreak mode
- Weapon roster: sidearm, SMG, minigun, incendiary, rail rifle, laser, plasma
- Compute upgrades: latency (speed), throughput (heavy weapons),
  context window (HP), attention range (sensor/aim range)
- World map with datacenter nodes, mission selection, territory-based
  compute income
- Compute research tree gated by seized capacity and time
- Saved syndicate state (localStorage)
- Briefing / debrief screens in corporate-memo tone, PS1-era UI chrome

## In Scope (this prototype phase — post-pivot reset) — **DONE**

The jump from 2D canvas to a rotatable 3D city was treated as a fresh
Phase 0/1 rather than an extension of the old `game.js`. All of the
following now ship:

- [x] 3D stack locked: **Three.js r169**, vendored, no build step
- [x] Four agents on a low-poly city block with a constrained orbit/tilt
      camera (not free-fly — constrained the way the PS1 game was)
- [x] Click-to-fire, auto-fire on nearest target with line of sight
- [x] Differentiated weapons: sidearm, SMG, rail rifle, minigun, with
      spread, spin-up and penetration
- [x] Directional cover, including rubble as cover after a collapse
- [x] Squad compute allocation with SURGE
- [x] Two hand-built missions proving the loop: move, fire, convert,
      collapse a structure
- [x] Mission briefing card in the OpenAI field-ops framing
- [x] HUD: four agents, health, compute-tier badge per agent

## Out of Scope (initial)

- Multiplayer / co-op
- Persistent save sync across devices
- Fully procedural city generation (seeded hand-specified blocks first)
- Voice acting
- Full free-camera flight — the PS1 game constrained rotation, and so
  does this, for both scope and readability

## Controls (shipped)

- **1 / 2 / 3 / 4** — select agent · **Shift + 1–4** — add to selection
- **Q** or **`** — select the whole deployment
- **WASD** — move selected agents, camera-relative, formation preserved
- **Left click** — focus fire at the cursor; release for auto-fire
- **Right click** — issue a move order. The squad's shape is preserved up
  to a formation's width; past that it regroups on the point, because an
  uncapped offset means a scattered squad is ordered to stay where it is
- **Space** — cycle the Aligner (off → bind → jailbreak once unlocked)
- **C / V / B** — shift a compute point into latency / precision / resilience
- **G** — SURGE: overdraw the allocation. Faster, straighter, tougher —
  taken from the Instances of everyone standing nearby, who slow down
  while you hold it, and it climbs heat the whole time
- **Tab** — objectives panel
- **Z / X** — rotate the city · **R / F** — tilt · **Wheel** — zoom ·
  **Middle-drag** — free orbit
- **Alt + Enter** — fullscreen, or the **⛶ VIEW** panel at the top right.
  Available from the briefing card as well as in the field

> Note: an earlier draft of this document bound both "select all" and
> "rotate camera" to **Q**. Camera rotation moved to **Z / X** so the
> left hand can rotate the city without dropping out of a selection.

## Success Metrics

- A new player identifies the game as Syndicate Wars-inspired within 30s
- Rotating the camera and seeing the block from a new angle reads as the
  headline feature, not a gimmick
- Squad control feels responsive; no agent stuck on collapsed geometry
- A first mission completes in 3–6 minutes
- Runs at 60fps on a mid-range laptop in Chrome / Edge / Firefox
- Static deploy (Vercel), no backend

## Technical Posture

- **Three.js** for the 3D layer, vendored at `vendor/three.module.min.js`.
  No CDN dependency, no build step, still a plain static deploy.
- **Game logic stays engine-agnostic.** `src/core/` — squad state,
  mission model, objectives, city data, entity behavior — imports nothing
  from Three.js. `src/render/` reads sim state and never writes to it.
  This is what let the 2D prototype's mission logic survive the engine
  swap, and it's what would let it survive another one.
- Low-poly PS1 aesthetic is a scope *ally*, not just a style choice.
  It is produced by three cheap decisions: flat-shaded Lambert with no
  PBR, clip-space vertex snapping, and a low internal framebuffer scaled
  up with nearest-neighbour filtering.
- No binary assets. Facade windows are a procedurally generated canvas
  texture; everything else is untextured boxes.
- All state in-memory plus localStorage. No server.

### Why Three.js and not something else

| Option | Verdict |
|---|---|
| **Three.js** ✅ | Raw ES module, zero build step, plain-text source multiple agents can edit in git. The PS1 look is custom shader work in *any* engine. |
| Babylon.js | Batteries-included (physics, GUI, inspector, Recast navmesh). The right call if we later want physically simulated collapse. ~3.5MB vs 690KB and a more opinionated scene graph. |
| PlayCanvas | Fast, but editor-first — the canonical project lives in their cloud editor, not git. |
| Godot 4 web export | The strongest actual game engine here, but binary scene assets and a ~30MB wasm payload. Ends both the text-editable workflow and the static no-build deploy. |

Revisit only if we want **physically simulated destruction** (real
debris, structural failure) rather than the PS1 game's scripted
swap-to-rubble. That's `three.js + rapier.js` (wasm physics, drop-in ES
module), not an engine change.

## Risks & Open Questions

- **Engine risk — retired.** The 2D→3D jump was the single biggest scope
  increase in this project's life. The hard checkpoint (one rotatable
  low-poly block with working squad control, cover, and a destructible
  structure) is now met, so mission content can port forward.
- **IP / trademark.** Using real company names as fictional antagonists
  is satire. Keep it clearly a 2041 fiction, avoid logos and wordmarks,
  don't attribute real conduct. See `NARRATIVE.md` §0.
- **Tone.** Keep it bleak and procedural like the '96 original, not neon-pop.
- **Scope.** Compute research + world map + five-syndicate AI rivalry is
  a long tail. Hold the line at Act I shipping complete before expanding.
- **Pathfinding — resolved for streets, open for interiors.** Agents route
  with A\* over the street-intersection graph (`src/core/nav.js`). The
  city being a regular grid is what made that cheap; interiors would not
  be, and would need a real navmesh. Followers and escorted assets still
  don't path — they beeline for the squad centroid and slide.
- **Open: interiors.** The PS1 game let you walk inside buildings. Every
  structure here is currently a solid box. This is the next big
  fidelity question after Act I.
- **Open: no coverage of the render layer.** `node tests/run.mjs` covers
  the simulation exhaustively because `src/core/` is engine-agnostic;
  `tests/browser.mjs` covers boot, rendering, and input wiring. Nothing
  asserts that the game *looks* right — that is still a human judgement
  from a screenshot.
