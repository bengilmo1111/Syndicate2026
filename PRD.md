# Syndicate 2026 — Product Requirements

## Vision
A modern, browser-playable reimagining of Bullfrog's 1993 *Syndicate* that retains
the original's tone, mechanics, and silhouette: top-down tactical control of a
four-agent cyborg squad in a corporate-feudal cyberpunk dystopia, fighting rival
syndicates for territory, tech, and the population's loyalty.

## Story Premise
The year is 2096. EuroCorp's grip on the world has cracked. With the CHIP — the
neural implant that mediates law, finance, and identity — splintered across rival
firms, three syndicates wage open war over the city-states. The player runs a
rising syndicate from a darkened executive suite, sending squads of cybernetically
augmented agents into the megacities to assassinate, persuade, steal, and seize
territory. Every successful mission funds research; every research breakthrough
buys deeper control of the population.

But that is the surface premise. The full narrative — a four-act arc in which
the player's executive (designation **EXEC-7**) discovers they were never a
willing employee, defects, and leads an insurgency to break the CHIP — lives in
**[`NARRATIVE.md`](./NARRATIVE.md)**. That document is the canonical source for
all story, mission writing, briefing copy, debriefs, character names, and tone.
Read it before writing any narrative material.

## Audience
- Fans of the 1993 original and the Bullfrog/Peter Molyneux design lineage
- Players of modern tactical games (Invisible Inc., Hotline Miami, X-COM, Door Kickers)
- Browser/casual players who want short, replayable mission loops
- Cyberpunk fans who enjoy moody, mechanical UIs over twitch action

## Core Pillars (in priority order)
1. **Squad as protagonist.** You command four agents at once, not one hero.
   Selection, formation, and per-agent loadouts are the central interaction.
2. **The Persuadertron.** Civilians can be converted. The world is not just
   targets — it is a population to influence. This is the signature mechanic.
3. **Cold tactical pacing.** Combat is positional and lethal, not twitchy.
   Cover, line of sight, and weapon range matter more than reflexes.
4. **Strategic meta-loop.** Mission rewards fund research; research unlocks
   weapons and cybernetics; new gear changes how missions are approached.
5. **Atmosphere over fidelity.** Neon-on-asphalt mood, monochrome HUD chrome,
   sparse synth audio. Readable 2D top-down beats expensive 3D.

## In Scope (full game target)
- Four-agent squad control with click-to-move, drag-select, and number-key select
- Mission types: assassinate, persuade, steal/retrieve, escort, eliminate-all
- Persuadertron weapon and a controllable civilian following count
- Weapon roster: pistol, Uzi, minigun, flamethrower, long-range rifle, laser, gauss
- Cybernetic upgrades: legs (speed), arms (recoil/heavy weapons), chest (HP), eyes (range)
- World map with city nodes, mission selection, and tax-from-territory income
- Research tree gated by funds and time
- Saved syndicate state (localStorage)
- Mission briefing and debrief screens with original-game tone

## In Scope (this prototype phase)
- Four agents on screen, selectable, moving as a formation under WASD
- Click-to-fire, auto-fire on nearest enemy in range
- Single hand-built mission with multiple objective types
- Mission briefing card with story framing
- HUD showing four agents (health, selection, weapon)
- Cyberpunk static-city backdrop (street grid + building blocks)

## Out of Scope (initial)
- 3D rendering
- Multiplayer or co-op
- Persistent save sync across devices
- Procedural city generation
- Voice acting

## Controls (target)
- **1 / 2 / 3 / 4** — toggle individual agent active
- **Q** or **`** — select all four
- **WASD / arrows** — move active agents (formation preserved)
- **Left click** — fire active agents at cursor
- **Right click** — issue move order to clicked location (active agents)
- **Space** — toggle Persuadertron mode (when equipped)
- **Tab** — open mission briefing / objectives panel

## Success Metrics
- A new player can identify the game as Syndicate-inspired within 30 seconds
- Squad control feels responsive (no agent gets stuck on geometry)
- Mission objectives are legible without reading a manual
- A first mission completes in 3–6 minutes
- The game runs at 60 fps on a mid-range laptop in Chrome/Edge/Firefox
- The full build is a static deploy (Vercel) with no backend

## Technical Posture
- Vanilla HTML5 canvas + ES modules. No frameworks, no build step.
- Static asset pipeline. Deployable to Vercel as a plain static site.
- All state is in-memory plus localStorage. No server.
- Code is organized by concern: `game.js` (loop), `entities.js` (sim),
  `ui.js` (DOM HUD/menus), `world.js` (map, missions — to be added).

## Risks & Open Questions
- **Performance:** many entities + line-of-sight checks could drop frame rate.
  Mitigation: spatial partition only when entity count > 100.
- **Scope:** persuasion + research + world map is a big tail. Hold the line at
  one polished mission before expanding.
- **Tone:** the 1993 game is bleak. Keep the framing dystopian; resist the
  pull toward heroism or neon-pop comedy.
- **IP:** this is an homage, not a remake. Avoid trademarked names, voice lines,
  and asset reuse. Use original copy and original art.
