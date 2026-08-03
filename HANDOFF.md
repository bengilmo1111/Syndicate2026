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
node tests/run.mjs        # the gate — ~15s, 225 checks, no dependencies
node tests/run.mjs nav    # filter to one suite while iterating
node tests/browser.mjs    # optional: real browser + WebGL, needs Playwright
```

To play it, serve the directory — **ES modules won't load over `file://`**:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Current state (one paragraph)

**Acts I, II and III are complete — ten missions of the fifteen**,
gated into a chain and selectable from tabs on the briefing card, which
renders over a live, slowly orbiting view of the sector.

- **Act I** — `sector-7` (eliminate an Amazon cell, collapse their relay
  pylon), `district-12` (align 18 residents, nothing armed on the map),
  `sable-campus` (escort Dr. Vasht to extraction; losing her loses the
  mission), `the-bracket` (the briefing's first lie — unquantized
  civilians who break and run, on whom the Aligner returns no handshake).
- **Act II** — `okafor-contract` (a named civilian who flees and files on
  a 150s clock; the squad will not auto-target her), `calibration-window`
  (no field component — a room and a choice), `welfare-node-7` (a hidden
  objective nobody mentions, which sets `playerSuspicion`).
- **Act III** — `the-refusal` (the branch point: carry out the order, or
  cut the prisoner loose and turn on your own escort), `gradient-relay-4`
  (drop four generator nodes; the sector is off the update channel and
  the Aligner has nothing to talk to), `run-south` (a retreat across the
  whole block to the Router's safehouse, where EXEC-7 learns their name).

Four agents deploy on a street intersection inside the block. WASD moves
the selection in formation, camera-relative. 1–4 select, Shift+N adds, Q
selects all. Right-click issues a formation-preserving move order
**routed by A\* over the street grid**. Hold left-click to focus fire;
release for auto-fire on the nearest hostile **with line of sight** —
never on a civilian, which is what makes the contract missions mean
something. Space engages the Aligner; C/V/B move compute between
LATENCY / PRECISION / RESILIENCE and G surges by throttling the street.
Cover is directional and rubble shelters you from shots it no longer
blocks. Hostiles reposition to cover and are suppressed by near-misses.

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
- **Quarry** (`okafor-contract`) — a named civilian who flees the squad
  and escapes on a timer. The squad will **not** auto-target her; killing
  a journalist has to be deliberately ordered, and a test enforces it.
- **Branch objectives** — `objective.branch` groups mutually exclusive
  routes. A mission completes when every unbranched objective plus *any
  one* branch completes, and taking one route never fails the other.
  The Refusal is the first; Act IV's three endings will use the same shape.
- **Flag-aware gating** — `def.requiresFlags` means a mission can require
  a *decision*, not just a completion.
- **Unthrottled civilians** — a mission can set `unthrottled: true` and
  the whole street comes off the update channel: six behaviour tags
  rolled every few seconds, and the Aligner returns *nothing* rather than
  refusing. `gradient-relay-4` is the first.
- **Dormant hostiles** — loyalists who are on your side until you free
  their prisoner or shoot one of them. They never fire first and the
  squad will not auto-target them, so defecting cannot happen by accident.
- **Hidden objectives** — an objective can be `hidden` and `optional` and
  carry a `flag`, so the game notices what the player did when nothing
  asked them to. `welfare-node-7`'s holding block is the first, and it
  sets `playerSuspicion`.
- **Per-outcome debriefs** — `def.debriefKey(sim)` picks between win
  variants; freeing Node 7's detainees earns different copy from walking
  past them.
- **Decision missions** — a mission with `def.choice` has no city and no
  squad on the ground. The shell renders its options instead of a DEPLOY
  button, the pick writes a narrative flag onto the campaign, and
  `isFieldMission()` is what keeps `createSim` and the autopilot away from
  it. `calibration-window` is the first.
- **BRAVO's hesitation** — Act II's mechanical signal, set per-mission
  via `bravoHesitation` on the mission def
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
  behind `squad.jailbreakUnlocked`, set by `def.jailbreak` from Act IV on)
- **The jailbreak inversion** — the spine of the game. Same hardware,
  opposite politics: bind puts a throttle on, jailbreak takes one off.
  It does not recruit, and it reaches the operatives you turned, who come
  off the throttle and stop following you. Using the thing that makes you
  the protagonist dismantles the crowd you spent ten missions building.
  The Router warns you in the briefing. **Do not "balance" this away.**
- **The strategic layer** (`src/core/territory.js`) — ten sectors, taken by
  winning their missions, each held at one of four **rations**. The ration
  is SURGE one scale up: take more, pay for it socially. FRONTIER calms a
  sector and pays almost nothing; FREE pays best and hands the sector back
  in about eight deployments. It pays into `research`, so the map and the
  cryovat are one economy rather than two systems side by side.
  **The tuning is the feature.** A tax mechanic fails when maximum tax is
  always correct, and a test plays the whole campaign at each ration to
  prove it is not: FREE earns more than PLUS and loses seven of ten
  sectors doing it. Another asserts no ration pays for a full kit.
  A sector claimed *during* a deployment neither pays for it nor gets
  angrier about it — you took it this mission, the meter runs from next.
  Third face of the briefing card, alongside the roster and the cryovat,
  because they are one decision: who you risk, what you spend, and what
  you squeeze to afford it.
- **`Asset.fated`** — immune to collateral. `securable: false` stops a
  named person being *captured* by accident; this stops them being
  *killed* by one. Yelin and the authority root are fated: a kiosk coming
  down on Yelin mid-firefight would silently break the capture and
  walk-away endings. Deliberate fire still works, which is the point.
- **Fire discipline** (`STANCE` in `src/core/squad.js`, cycled with `H`) —
  ENGAGE AT WILL / RETURN FIRE / HOLD FIRE, always on screen top right.
  Left-click fires in every stance: HOLD FIRE is discipline, not
  disarmament. RETURN FIRE reads `agent.provoked`, which is set by a **near
  miss** rather than a hit — an agent who waits to be wounded before
  shooting back is a liability, not a stance — and expires after 4s, or
  the stance quietly becomes ENGAGE for the rest of the mission.
  The Aligner still suppresses fire independently of all of this; the two
  controls do not touch each other and a test says so.
- **Field devices** (`src/core/devices.js`) — the first things the player
  puts *on the map*. Thrown at the cursor, two charges each, no restock.
  **CHOKE FIELD**: half speed and 1.9× spread for anything inside.
  **STANDDOWN AEROSOL**: sedates to `downed` — alive, out for the mission,
  never auto-targeted. Both affect **everyone in the footprint, squad
  included**; a field that spared your own agents would be a gun with an
  area of effect and the placement decision would evaporate.
  Devices arm after a beat, so a panicked drop at your own feet is a
  mistake you get to watch happen.
- **`neutralised` vs `kills`** — the objective model reads
  `sim.neutralised` (shot + sedated), because the syndicate files a
  sedated cell and a dead one identically. `sim.kills` is where the
  difference is kept. **Do not collapse these.** The joke is the game.
- **HOLD FIRE is how a non-lethal run works.** It is what stops the squad
  shooting the people the aerosol is putting to sleep. A test clears The
  Bracket six-for-six with zero kills; without it the same run is not
  bloodless. (Holding the Aligner also works and did the job before
  stances existed — keep that, it is a nice thing to discover.)
- **Full building destruction** — every tower and slab is destructible.
  Health scales on volume (2–15s of full-squad fire) and so does
  `structure.occupancy`, which is the cost model: a tower is ninety
  Free-tier tenants and dropping it kills all of them, wrecking the
  civilian-loss record, costing research, and drawing enforcement scaled
  to the body count (capped at 3 waves). `warnStructure()` says the tenant
  count at 40% integrity, so a collapse is never a surprise. Rubble
  spreads 1.3× the footprint and lands on whoever is in it, **squad
  included** — survivors are pushed clear so nobody ends up stuck inside
  the mesh.
  `buildCity({ occupancyScale })` is the dial; the campus missions set it
  to 0, because the fiction says those floors are empty.
  **`derelict` only pre-collapses street cover.** It predates towers being
  destructible and would otherwise rewrite the skyline of every sector
  that sets it — Gradient Relay 4 sets it.
- **The roster** (`src/core/roster.js`) — four *people*, not four slots.
  Operatives persist with names, deployments and kills; losses are
  permanent; a replacement inherits the **designation** but not the
  person, so the radio still says BRAVO and the player knows it is not
  her. Four cybernetics bought with research (2 per mission, +1 for
  bringing everyone home, +1 for killing no civilians) and fitted in a
  cryovat on the briefing card. `applyToAgent()` is the *only* place the
  persistent record and the simulated body meet — the sim still does not
  know a save file exists.
  Losses and research land **on a win only**: permadeath that punishes a
  retry is a tax on experimenting, not a consequence.
  A reflex governor suppresses BRAVO's Act II hesitation, which is the
  in-fiction fix and explicitly not a fix for BRAVO.
- **Save v3**, migrated from v2. A v2 save keeps its progress and gains a
  fresh roster; a corrupt or foreign roster is replaced without taking the
  campaign down, and implants we later retire are dropped rather than left
  dangling. Tests cover all of that, because the alternative is a player
  losing a campaign to a feature landing behind them.
- **Epilogue missions** — a third kind, after field missions and choice
  missions: no world, no decision, `def.epilogue = { by, fallback,
  variants }` resolved by `epilogueFor()` against the *campaign* flags, so
  the ending plays correctly on a reload with no sim in memory. Reaching
  the card completes it. The `fallback` is not optional — being shown a
  blank card at the end of the game is the worst bug available, so a save
  that arrives with no `ending` still gets one.
- **Predicate objectives** — `objective(type, { done: s => … })` completes
  by predicate on the same state snapshot rather than by counter. An
  ending branch is a decision, not a tally, and `s.flags` /
  `s.interludeAnswers` are on the snapshot for exactly this. `yelin`'s
  three fates are the first use; Mission 14's console is the next.
- **Named people are not collected by proximity** — `Asset.securable`.
  False for someone whose fate is the mission's decision: you cannot
  capture Yelin by standing next to him while shooting at somebody else.
  Same family of rule as the squad refusing to auto-target Priya Okafor.
- **Mid-mission dialog** (`src/core/interlude.js`) — a mission declares
  `interludes`; the sim raises one the first frame its `when(sim)` is
  true, freezes the field while the card is up, and records the answer in
  `sim.interludeAnswers`. An option can write a narrative flag and run an
  `effect(sim)` that changes the field. `the-tower`'s parley is the first;
  missions 13–15 are all partly dialog and should reuse it rather than
  inventing a second mechanism. `interlude()` throws on a beat with no
  options, because that is a hang.
- **HOLD zones** — `sim.holdZone` / `sim.inHoldZone`. One live agent in
  the radius keeps the clock running; walking off unwinds it at half the
  rate it climbs, so losing the zone is a setback rather than a loss.
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

`node tests/run.mjs` — 225 checks, ~15s, zero dependencies. Covers city
generation invariants, navigation, collapse-to-cover, ballistics,
weapons, cover, compute allocation, surge, the Aligner (including the
unquantized refusal), morale, the objective model, heat and enforcement,
every mission definition, and **an autopilot that plays every field
mission to a win** — ten of them, headless, every run.

The suite is mutation-tested. Twelve deliberate regressions have been
confirmed to fail it, including: disabling pathfinding, making rubble
block sight again, making the unquantized alignable, removing the
objective prerequisite gate, reverting the swept projectile test,
letting extraction ignore agents left behind, removing cover from the
damage path, making surge cost no heat, making the throttle not slow
anyone, giving every agent the same weapon, breaking budget conservation,
and letting the minigun fire cold. Six more cover the Act IV systems:
not unlocking jailbreak, making jailbreak a no-op, letting jailbreak
recruit as well as free, letting it spare your own followers, making a
HOLD zone count everywhere, and making it reset instead of unwind. Eight
more cover Act IV·12: not freezing the field during dialog, letting a beat
refire every frame, dropping an answer's flag, dropping its effect,
accepting any option id, uncapping the formation offset, flattening the
formation, and making the parley's hard choice free. Six more cover
Act IV·13: ignoring a `done` predicate, collapsing every ending to the
same copy, letting proximity capture Yelin, putting all three waves on
the deck at deploy, sharing one branch group between the three fates,
and making the kill ending bloodless. Seven more cover Act IV·14–15:
ignoring the ending flag, dropping the epilogue's fallback, treating an
epilogue as a field mission, stacking the three checkpoints on one kill
count, having one console action write another's flag, colliding two
ending titles, and cutting the second "Maren" out of the last scene.
Eleven more cover the roster: making implants inert, making a loss
temporary, making implants free, buying on credit, dropping implants on
load, keeping a retired implant id, losing the designation on a
replacement, dropping the full-squad research bonus, not applying the
roster to the agents at all, making the reflex governor useless, and
removing the BRAVO branch under the campus. Nine more cover demolition:
making towers immortal, making them all empty, letting `derelict` drop
towers, not invalidating the nav graph on collapse, leaving tenants
uncounted, removing the structural warning, flattening enforcement to one
wave regardless of the dead, making rubble harmless, and leaving
survivors stuck inside it. Five more cover the devices: making them free,
arming them instantly, making sedation never wear off, removing the
agents' hardening, and letting the fields spare your own squad. Five more cover fire
discipline: making HOLD FIRE do nothing, making RETURN FIRE identical to
ENGAGE, never expiring `provoked`, ignoring a near miss, and not reading
the stance at all. Eight more cover the strategic layer: making squeezing
free, making the loosest ration pay as much as the tightest, never
revolting, re-claiming a sector on a replay, keeping a retired throttle id
from a save, having the map pay nothing, never loading a saved map, and
making the cryovat cheap again. It is load-bearing, not decorative.

`node tests/browser.mjs` — 57 checks in real Chromium. Boot, module
resolution over HTTP, WebGL render of every mission, keyboard and mouse
wiring, compute keys, surge and its visible cost, frame rate, clean
console.

**Not covered:** nothing asserts the game *looks* right. Visual judgement
is still a human reading a screenshot.

## What's stubbed / known gaps

- No sound
- No interstitials between missions — gating exists, but the beats
  *between* the briefings (Yelin's notes, the graffiti) don't
- `bravoCalibrated` and `playerSuspicion` are recorded but nothing reads
  them yet. `defectedAtRefusal` has gating support but no mission uses it
  — Act III·9 onward should.
- **Followers and escorted assets don't path.** Agents route properly
  now; anyone following them still beelines for the squad centroid and
  slides along whatever they hit. Usually fine because the squad walks
  streets, but it will show on a tight escort.
- Hostiles don't path either — they close in a straight line and hold
  once they have a clear shot
- Buildings are solid boxes. No interiors.

## Next up

For any mission work, briefing copy, debriefs, or character lines,
**read `NARRATIVE.md` first** — the slots are pre-defined.

**All fifteen missions ship.** `NARRATIVE.md` §6 is complete end to end,
the three endings in §7 are wired from the console under the campus
through to three different final scenes, and a test plays the whole
campaign in order — every field mission autoplayed to a win, gated the
way a player meets them, ending on the epilogue.

The arc is done and the progression loop under it is done. What is left is
depth: `GAP_ANALYSIS.md` is the ranked backlog, and gaps 1, 2, 3, 4, 5, 7
and 10 are now closed. What is left is vehicles, sound, camera occlusion
and interiors — plus the halves of 1 and 4 noted there.

1. **Rival syndicates on the map.** The strategic layer currently pits the
   player against *unrest* rather than against Amazon, Google, SpaceX and
   Anthropic — which is the half of gap 1 that is still open, and the
   thing that would make the map feel contested rather than administered.
   Missions generated *by* the map rather than only feeding it is the
   same piece of work.
2. **The offensive strange tools** (gap 4's remainder) — psycho gas,
   razor wire, satellite rain, the graviton gun. Additive now that
   `devices.js` exists; none of them need new architecture.
3. **Sound** (gap 9) and **camera occlusion** (gap 11). Occlusion has been
   flagged pre-emptively since before towers were destructible; it has not
   bitten because the camera is constrained and towers top out at 22m.
3. **Between-mission interstitials for Acts I–III** — Yelin's notes and
   the street graffiti. Act IV got its beats *inside* missions, which is
   where they belonged, but the Act I→II tonal turn still has nothing
   between the briefings. The card shape is the only thing missing;
   `src/core/interlude.js` is not it (that one freezes a live field).
4. **`bravoCalibrated`, `playerSuspicion`, `defectedAtRefusal`,
   `heardYelin`, `pressedYelin`, `toldBravoItWasHers`,
   `askedTheReplacement`** are all recorded and nothing reads them. The
   epilogue is the obvious place: it branches on `ending` alone, and it
   could be reading seven more — plus the roster, which now knows exactly
   who survived to see it.
2. **Interstitials** — the Yelin notes and street graffiti between
   missions carry most of the tonal shift, and Act IV needs them most.
   The subtitle channel handles in-mission lines; between-mission beats
   need a card. Missions 12–15 are all partly dialog.
3. **`bravoCalibrated`, `playerSuspicion`, `defectedAtRefusal`** are
   recorded and nothing reads them. Act IV is where they should pay off
   — the endings are the obvious place.

After Act IV, `GAP_ANALYSIS.md` is the ranked backlog: full building
destruction (gap 2) and the agent roster / cybernetics loop (gap 3) are
the two that most change how the game plays.

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
