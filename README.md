# Syndicate 2026

A browser-playable reimagining of Bullfrog's 1996 *Syndicate Wars*: four
augmented agents, a rotatable low-poly city that comes down around them,
and a corporate war fought over the only thing that matters in 2041 —
compute.

**Play:** https://syndicate2026.vercel.app/

## Run it locally

ES modules won't load over `file://`, so serve the directory:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/
```

No build step, no `package.json`, no dependencies to install. Three.js is
vendored in `vendor/`.

## Controls

| | |
|---|---|
| `1`–`4` / `Shift`+`1`–`4` / `Q` | select an agent / add to selection / whole deployment |
| `WASD` | move, camera-relative, formation preserved |
| Left click | focus fire — release for auto-fire |
| Right click | move order, routed through the streets |
| `Space` | the Aligner |
| `C` / `V` / `B` | shift compute into latency / precision / resilience |
| `G` | surge — faster, straighter, tougher, taken from the street |
| `Tab` | objectives |
| `Z`/`X`, `R`/`F`, wheel, middle-drag | rotate, tilt, zoom, orbit |

## Tests

```sh
node tests/run.mjs        # simulation + every mission played to a win, ~2s
node tests/browser.mjs    # real browser pass (needs Playwright)
```

The suite runs the whole game headlessly because `src/core/` has no
rendering or DOM dependency. That includes an autopilot that plays every
registered mission to completion — a mission that can't be won fails CI.

## Documents

- [`AGENTS.md`](./AGENTS.md) — the working contract. Read first.
- [`HANDOFF.md`](./HANDOFF.md) — current state, what works, known gaps
- [`NARRATIVE.md`](./NARRATIVE.md) — story canon and all fifteen mission slots
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — roadmap
- [`PRD.md`](./PRD.md) — vision, scope, engine rationale

## A note on the company names

The five syndicates use the names of real AI companies. This is satire set
in a fictional 2041, not a claim about any of them today: no logos or
wordmarks, no real quotes or documented conduct attributed to the fictional
versions, and the player's own employer is the antagonist. See
[`NARRATIVE.md`](./NARRATIVE.md) §0.
