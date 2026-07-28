# Handoff — Syndicate 2026

This file is the single source of truth for "what is the world like right
now" when a session opens this repo. Read this **first**. Update it
**last**, in the same commit as your code change.

> **If you are about to write any story material** — briefings, debriefs,
> mission copy, character lines, civilian VO, UI flavor text — **stop and
> read [`NARRATIVE.md`](./NARRATIVE.md) first.** It is canonical for the
> four-act arc, cast, lexicon, and per-mission slot notes. All fifteen
> mission slots are pre-defined in §6; pick the matching slot rather than
> inventing parallel fiction.

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

## How to test locally

Static site, no build step — but **ES modules need a real server**,
`file://` won't work:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Current state (one paragraph)

Two playable missions on a rotatable, destructible low-poly city block.
**Sector 7 — Reclamation** (Act I·1: eliminate an Amazon field cell ×5,
then collapse their relay pylon) and **District 12 — Provisioning Vote**
(Act I·2: align 18 residents, no rivals on the map) are both wired
through the mission registry and selectable from tabs on the briefing
card, which renders over a live, slowly orbiting view of the sector.
Four agents deploy on a street intersection inside the block. WASD moves
the selection in formation, camera-relative. 1–4 select, Shift+N adds, Q
selects all. Right-click issues a formation-preserving move order with
ground markers. Hold left-click to focus fire; release for auto-fire on
the nearest hostile **with line of sight** — shots are blocked by
standing structures. Space engages the Aligner, which suppresses fire
entirely and converts civilians within 13.5m into followers. Civilians
carry a visible compute tier (Free/Plus/Pro/Frontier) that sets their
speed and reaction time, plus a name and a job. They panic, take fire,
and die; killing one spikes HEAT by 15, and crossing 60 spawns a pair of
enforcers at the map edge. Street cover is destructible: shoot a kiosk
or depot enough and it collapses into rubble that still blocks movement
but **no longer blocks line of sight**, opening firing lanes that didn't
exist at mission start.

## What works

- Four agents: camera-relative formation movement, per-agent damage,
  death, KIA state in the HUD
- Selection: 1–4 select, Shift+N toggle, Q select-all, rings on the ground
- Right-click move orders, formation preserved, markers that clear on arrival
- Hold left-click focus fire; release for auto-fire on nearest visible target
- Line of sight — standing structures block both shots and target selection
- **Collapse-to-cover**: destructibles drop to rubble; rubble blocks
  movement but not sight. Camera kicks and debris flies on collapse.
- The Aligner (Space) — cycles off → bind → jailbreak (jailbreak gated
  behind `squad.jailbreakUnlocked`, which Act IV will set)
- Civilians: wander, panic, tiers, names/jobs, mortality, heat on death
- Enforcement escalation: heat ≥ 60 spawns 2 enforcers, heat resets to 20,
  and enforcer kills do **not** count toward ELIMINATE
- Hostile AI: closes distance, holds position once it has a clear shot
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

## What's stubbed / known gaps

- No persistence (no localStorage save yet)
- No sound
- Objective types `retrieve`, `extract`, `hold` are declared in
  `src/core/mission.js` but not implemented — each needs an entity
  (escortable asset / extraction zone / hold zone)
- No mission gating — both missions are always available, arc order
  isn't enforced
- No interstitials between missions
- No branch-flag plumbing yet for `bravoCalibrated`, `playerSuspicion`,
  `defectedAtRefusal`, `yelinFate` (spec'd in `NARRATIVE.md` §9)
- No pathfinding — agents slide along geometry and drop a move order when
  hard-blocked. Fine for street grids, not for interiors.
- Buildings are solid boxes. No interiors.
- No unquantized civilian type yet (needed for `the-bracket`)

## Next up

For any mission work, briefing copy, debriefs, or character lines,
**read `NARRATIVE.md` first** — the slots are pre-defined.

1. **Mission 3 — `sable-campus` (Asset Retrieval)** · `NARRATIVE.md` §6
   Act I·3. Needs the `RETRIEVE` objective wired plus an extraction NPC
   that follows the squad once collected. `Civilian` already follows the
   squad centroid when aligned, so this is a small variant, not a new
   class. Rival: Anthropic.
2. **Mission 4 — `the-bracket` (Terror Cell)** · Act I·4. Introduces the
   **unquantized** as an enemy type — weak, poorly armed, and immune to
   the Aligner, which is how the player works out that the briefing lied.
3. **Mission gating** so the player walks Act I in order.
4. **Interstitials** — the Yelin notes and street graffiti between
   missions carry most of Act I→II's tonal shift.

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

- `PRD.md` — vision, scope, engine rationale. Update before scope changes.
- `NARRATIVE.md` — story canon. Fifteen mission slots in §6.
- `IMPLEMENTATION_PLAN.md` — roadmap and file map. Tick boxes as you go.
- `HANDOFF.md` — this file. Keep current.
- `vendor/three.module.min.js` — Three.js r169, MIT. Vendored on purpose:
  no CDN dependency, works offline, still no build step.

## Working agreement

- One logical change per commit. Conventional-style messages
  (`feat:`, `fix:`, `docs:`, `refactor:`).
- Update `IMPLEMENTATION_PLAN.md` checkboxes in the same commit as the code.
- Update this file when "current state" or "next up" goes stale.
- If you change a control or add a binding, update the hint text in
  `src/ui/overlay.js` **and** the controls list in `PRD.md`.
- Verify before pushing — the checklist is at the bottom of
  `IMPLEMENTATION_PLAN.md`. Zero console errors is the bar.
