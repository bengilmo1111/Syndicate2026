# AGENTS.md

Read this first. It is the contract for anyone — human or agent — working
in this repo. The other documents are reference; this one is rules.

---

## What this is

A browser-playable reimagining of Bullfrog's *Syndicate Wars* (PS1): a
squad of four agents in a rotatable, destructible low-poly 3D city, set
in a 2041 where five AI companies fight over compute. Static site, no
build step, no npm dependencies, deployed to Vercel from `main`.

---

## The gate

**`node tests/run.mjs` must pass before you push. No exceptions.**

```
node tests/run.mjs            # ~4s, 105 checks, no dependencies
node tests/run.mjs nav        # filter by suite or test name
node tests/browser.mjs        # optional: real browser, needs Playwright
```

`src/core/` imports no Three.js and no DOM, so Node runs the entire
simulation directly. That is what makes a two-second test loop possible,
and it is the main reason the layer boundary below is non-negotiable.

The suite includes an **autopilot** (`tests/lib/autopilot.mjs`) that plays
every registered mission to completion headlessly. If you add a mission,
it is automatically covered — and if your mission is not winnable, the
suite goes red. This exists because two missions in this project's history
shipped uncompletable and were caught by hand instead:

- Sable Campus' escort was impossible before pathfinding existed
- The Bracket's Aligner reveal was unreachable, because the cell fled
  faster than the player could close to range

Neither would survive `node tests/run.mjs` today. Keep it that way.

**Mutation-test anything load-bearing you add.** Break it deliberately and
confirm the suite goes red. A test that cannot fail is worse than no test,
because it reads like coverage. Twelve such regressions have been confirmed
to fail this suite; the list is in `HANDOFF.md`.

`node tests/browser.mjs` covers what Node cannot see: the page booting,
modules resolving over HTTP, WebGL rendering each mission, keyboard and
mouse actually being wired to the sim, and a clean console. Run it before
anything you'd call a release.

---

## The one architectural rule

```
src/core/   →  pure simulation. Imports NO Three.js, NO DOM, NO src/render, NO src/ui.
src/render/ →  reads sim state. NEVER writes to it.
src/ui/     →  DOM only.
```

This is why the 2D prototype's squad, mission, and heat logic survived the
whole engine swap to 3D, and it is why the tests run in seconds instead of
minutes. If you find yourself importing `three` into `src/core/`, stop —
you are about to make the next change expensive.

Entities that need to reach a presentation-layer feature go through data,
not calls. An `Unquantized` that wants to speak sets `pendingLine`; the sim
drains it into the subtitle channel. Do it that way.

---

## Read order

| When | Read |
|---|---|
| Always, first | **`AGENTS.md`** (this file) |
| Before touching code | **`HANDOFF.md`** — current state, what works, known gaps, next up |
| Before writing *any* story copy | **`NARRATIVE.md`** — canon. Non-optional. |
| To pick up the next task | **`IMPLEMENTATION_PLAN.md`** — roadmap with checkboxes |
| Before changing scope | **`PRD.md`** — vision, pillars, engine rationale |
| Before proposing a big new system | **`GAP_ANALYSIS.md`** — the 1996 original vs this build, gaps ranked |

**Any** briefing, debrief, character line, civilian dialogue, or UI flavor
text means reading `NARRATIVE.md` first. All fifteen mission slots are
pre-specified in §6 — pick the matching slot rather than inventing parallel
fiction. If a creative decision contradicts that document and you believe
the document is wrong, change the document in the same commit as the code.

---

## Hard content rules

The five syndicates use the names of real AI companies. This is satire set
in a fictional 2041, not a claim about anyone today. `NARRATIVE.md` §0 is
the full statement; the short version:

- **No logos, wordmarks, or brand typography.** A syndicate is identified
  by a palette accent and a field-culture voice, nothing else.
- **No real quotes, real executives, or documented real-world conduct**
  attributed to the fictional versions.
- The player's own employer is the antagonist. If the satire only ever
  points at rivals, it isn't satire.

---

## Adding a mission

1. Read the mission's slot in `NARRATIVE.md` §6. Do not invent a new one.
2. Create `src/missions/<id>.js` and export from `src/missions/index.js`.
   Registration is a side effect of import.
3. `setup(rng)` returns `{ city, hostiles, civilianCount, assets?, extraction? }`.
   Use the seeded `rng` — worlds must be reproducible.
4. New objective type? Handle it in `updateMissionStatus()` in
   `src/core/mission.js` and nowhere else.
5. Run `node tests/run.mjs`. The autopilot will try to win your mission.
   If it can't, the mission is not finished.
6. Add a `story beats` test in `tests/missions.test.mjs` for whatever makes
   the mission *that* mission — the beat, not the boilerplate.
7. Set `requires: [previousMissionId]` unless it is genuinely the first
   mission of the game. A mission with no prerequisite is reachable from
   a cold save, and a test asserts every mission but the first is gated.
8. Update the slot's status in `NARRATIVE.md` §6, tick
   `IMPLEMENTATION_PLAN.md`, refresh `HANDOFF.md`.

---

## Git

- Branch `claude/<topic>`. Never push straight to `main`.
- One logical change per commit, conventional prefix (`feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`).
- Merge with `git merge --no-ff` so lineage stays readable. Don't squash.
- `main` deploys to https://syndicate2026.vercel.app/ within ~30s.
- Update `IMPLEMENTATION_PLAN.md` and `HANDOFF.md` in the same commit as
  the code they describe.
- Change a control binding? Update the hint in `src/ui/overlay.js` **and**
  the controls list in `PRD.md`.

---

## Local

ES modules will not load over `file://`. Serve it:

```
python3 -m http.server 8000     # then http://localhost:8000/
```

No `package.json`, no `node_modules`, no build step. Three.js is vendored
at `vendor/three.module.min.js` (r169, MIT) on purpose: no CDN dependency,
works offline, still a plain static deploy. Keep it that way through
Phase 5 — see `PRD.md`.

---

## Honesty

Report what happened. If a test fails, say so and show the output. If you
skipped something, say which part and why. "Verified" means you ran it.
When you find a bug while building something else, fix it or write it down
in `HANDOFF.md` under known gaps — do not let it evaporate.
