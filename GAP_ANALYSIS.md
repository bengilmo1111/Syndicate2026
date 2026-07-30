# Gap Analysis — Syndicate Wars (1996) vs Syndicate 2026

What the original actually did, what we have, and what is missing. This is
a **reference document for planning**, not a roadmap — the roadmap is
`IMPLEMENTATION_PLAN.md`. Items here feed into it as they get scheduled.

Researched July 2026 against Wikipedia, Hardcore Gaming 101, MobyGames,
GameSpot's contemporary review, and community documentation. Sources at
the bottom. Where a detail is community-reported rather than documented,
it says so.

---

## 1 · What the original was

Bullfrog, 1996, DOS and PS1. Third in the series, and the one that took
the 1993 game's fixed isometric city into **full 3D with a rotatable,
pitchable camera**. You run four agents through a city that can be taken
apart around you.

Two campaigns — **EuroCorp** (34 missions) and the **Church of the New
Epoch** (29) — arranged in chapters of up to three missions. Briefings
arrive through an in-fiction email client. A world map tracks which
regions each syndicate holds; you start in Western Europe and unlock
territory by conquest, then **set each country's tax rate**, trading
income against the risk of rebellion. Research is funded per-item with a
minimum and maximum cost: minimum funding completes in ten days, more
money buys speed.

The tactical layer is where its reputation comes from. **Practically
every building is destructible** — with the right ordnance you level city
blocks. Agents and NPCs both use vehicles, including flying ones. Health,
shields and weapon energy all recharge. The **Persuadertron** converts
civilians and enemies into followers who trail you, *pick up dropped
weapons, and fight for you*.

---

## 2 · System-by-system

Legend: ✅ have · ◐ partial · ❌ missing

### Tactical layer

| System | Syndicate Wars | Syndicate 2026 | |
|---|---|---|---|
| Four agents, single + group select | yes | yes | ✅ |
| Rotatable **and pitchable** camera | yes | Z/X yaw, R/F tilt, constrained | ✅ |
| Destructible environment | **practically every building**; level whole blocks | street cover + scripted landmarks only; buildings are permanent | ◐ |
| Cover and positioning | implicit in geometry | directional cover, rubble as cover | ✅ (we go further) |
| Pathfinding | criticised as poor | A\* over the street graph | ✅ (we go further) |
| Vehicles | agents and NPCs, some flying | none | ❌ |
| Persuadertron | strength thresholds per target type; followers arm themselves from dropped weapons and fight | radius conversion, followers trail the squad, unarmed and non-combatant | ◐ |
| Police react to Persuadertron use | yes — carrying it draws fire | heat comes from gunfire and surge only | ◐ |
| Real-time behaviour sliders | **IPA**: Intelligence / Perception / Adrenaline, altering autonomous agent *behaviour* | compute channels: latency / precision / resilience, altering *stats* | ◐ |
| Shields | recharging, separate from health | none | ❌ |
| Ammo / weapon energy | recharging pool | unlimited | ❌ |
| Weapon roster | ~19, including psycho gas, knockout gas, razor wire, ion mines, status fields, graviton gun, satellite rain, nuclear grenade | 4 conventional firearms | ◐ |
| Dropped weapons | pick up in the field | none | ❌ |
| Deployables / traps | trip wires, mines, Cerberus IFF guardian drone | none | ❌ |
| Enemy variety | police, punks, guards, agents, zealots | rivals, enforcers, unquantized | ◐ |
| Enemy tactics | criticised as limited | limited — no cover seeking, no flanking | ◐ |
| Crowd behaviour | panic, gas reactions | panic, throttle under surge | ◐ |

### Meta layer

| System | Syndicate Wars | Syndicate 2026 | |
|---|---|---|---|
| World map | regions, progressive unlock by conquest | none | ❌ |
| Territory economy | per-country tax rate; income vs rebellion risk | none | ❌ |
| Research | funded per item, money buys speed | none | ❌ |
| Agent roster | larger than four; pick a squad of four | exactly four, fixed | ❌ |
| Agent upgrades | cryovat cybernetics | none | ❌ |
| In-mission economy | rob or destroy banks for funds | none | ❌ |
| Persistence | full campaign save | none | ❌ |
| Campaign length | 34 / 29 missions in chapters | 4 shipped of 15 specified | ◐ |
| Two playable factions | EuroCorp and the Church | one (OpenAI) | ❌ |
| Briefing fiction | in-game email client | briefing cards, corporate memo voice | ✅ |
| Sound | full | none | ❌ |

---

## 3 · Major gaps, ranked

Ranked by **how much the game changes per unit of work**, not by size.

### 1. There is no meta-game at all
The entire strategic half of the original is absent. No world map, no
territory, no economy, no research, no persistence. Every mission is
currently a disconnected sandbox, so nothing the player does accumulates.

The original's tax mechanic is the part worth stealing precisely: raising
tax funds research and raises rebellion risk. That is the same shape as
our SURGE — take more, pay for it socially — which means the strategic
and tactical layers would be arguing the same argument at two scales.
That's a strong thematic fit, and it's already what `PRD.md` pillar 5
promises.

*Where:* Phase 5. Biggest single gap.

### 2. Buildings are indestructible — **closed**
"Level a city block" is the original's headline. We destroyed street
furniture and scripted landmarks; the towers were permanent scenery.

**Shipped.** Every tower and slab is destructible, with health scaling on
volume — 2 to 15 seconds of the whole squad on full auto, so a block is a
commitment rather than a burst.

**The cost model is people.** A tower is not scenery with a health bar,
it is ninety Free-tier tenants, and dropping it kills all of them. That
wrecks the mission's civilian-loss record, costs the research the cryovat
runs on, and draws enforcement scaled to the body count (capped at three
waves — expensive, not unrecoverable). The game warns you at 40%
integrity, by tenant count, so finding out afterwards is impossible and
doing it anyway is a decision.

Rubble spreads a third past the original footprint and lands on whoever
is standing in it, **including the squad**, which is now a way to lose an
operative permanently.

Two latent bugs surfaced doing it, both invisible until towers could
fall. The nav cache was stamped on `structures.length`, which a collapse
never changes — so a route computed before a collapse walked straight
through the new footprint; harmless for street cover, not for a tower's
rubble field. And the `derelict` dial pre-collapses anything
destructible, which would have silently rewritten the skyline of every
sector that sets it.

*Still open:* partial damage states (a building is intact or rubble,
nothing between), and collapse that propagates to neighbours.

### 3. No progression, no roster, no persistence — **closed**
Four fixed agents who reset every mission. The original had a roster you
drew a squad of four from, cybernetic upgrades in the cryovat, and
consequences for losing people. Without this, agent death costs nothing
and there is no reason to care about ALPHA over DELTA — which also
undercuts the story, since Act III is about them becoming people.

**Shipped** in `src/core/roster.js`. Operatives persist across the
campaign with names, deployments and kills; four cybernetics are bought
with research earned per mission (more for bringing everyone home, more
for killing no civilians) and fitted in a cryovat on the briefing card;
losses are permanent, and a replacement inherits the *designation* but
not the person, so the radio still says BRAVO.

The narrative leverage arrived with it: Act IV·14's first checkpoint is
BRAVO talking about a kitchen she cannot verify is hers, and if she was
lost somewhere in Acts II–IV a different beat runs — the operative
wearing BRAVO checks the corner and waits for an order, and the player
can ask their name or give one.

*Still open:* drawing a squad of four from a larger pool (the roster
deploys the four whose slots are filled, it does not let you pick), and
cybernetics that change *how* an agent plays rather than its numbers.

### 4. The weapon roster is four conventional guns
The original's identity lives in its *strange* tools — psycho gas to
panic a crowd, knockout gas for a non-lethal run, razor wire and trip
wires for area denial, status fields to slow, satellite rain for orbital
bombardment, a graviton gun. These create tactics rather than just
damage numbers.

We have four guns that differ in statistics. Good, but they all solve
the same problem. **The highest-value additions are the non-lethal and
area-denial ones**, because they interact with the Aligner and the heat
system rather than bypassing them — a knockout-gas run is a real
alternative to a firefight in a way that a bigger gun never is.

*Where:* Phase 4.

### 5. The Persuadertron doesn't snowball — **largely closed**
In the original, each target type has a persuade threshold — civilians
and scientists 0, police and guards 6, punks 10, agents and zealots 20
(community-documented) — and **your existing followers count toward
meeting it**. So converting a crowd is how you earn the ability to
convert an enemy agent. Followers also collect dropped weapons and fight
for you.

Now implemented: resistance per target type (civilians 0, enforcement 6,
rivals 12), your followers count toward it, and turned operatives fight
their former side. Still missing: civilian followers that pick up dropped
weapons and fight, which the original had.

*Where:* Phase 3. Cheap relative to impact; the follower entity exists.

### 6. No vehicles
Cars and hovercars, drivable by agents and NPCs, plus ambient traffic.
This is a large chunk of what made the original's cities feel like
cities rather than dioramas.

*Where:* unscheduled. Large. Ambient traffic alone — no driving — would
buy most of the atmosphere for a fraction of the work, and is worth
doing first as a separate item.

### 7. Enemy AI has no tactics — **partially closed**
Hostiles now reposition to cover and are suppressed by near-misses
(`src/core/tactics.js`). Still missing: retreating when badly hurt, and
any coordination between them — they each solve their own problem.

Note this was a criticism of the *original* too. It is a gap we should
not inherit just because our reference did.

*Where:* Phase 3.5, partially done.

### 8. No in-mission resource pressure
No ammo, no shields, no reason to disengage. Firefights have no economy,
so the correct play is always to keep shooting.

*Where:* Phase 4. Shields-that-recharge are the more interesting half:
they create a reason to break contact and reposition, which is exactly
the "cold tactical pacing" pillar.

### 9. No sound
Weapons, ambient city, mission stingers. Absent entirely. Disproportionate
effect on feel for the work involved.

*Where:* Phase 6.

### 10. Campaign is 4 of 15 missions
And mission gating still isn't implemented, so the four that exist can be
played in any order — which will actively damage the Act I→II turn.

*Where:* Phase 2. **Gating should land before Act II is written.**

### 11. Camera occlusion is unhandled
The original was criticised for skyscrapers hiding the squad. Our towers
top out around 22m and the camera is constrained, so it hasn't bitten
yet — but it will the moment buildings get taller or interiors arrive.
Fading structures between camera and squad is the standard fix.

*Where:* Phase 6, pre-emptive.

### 12. No interiors
Every structure is a solid box. The original let you go inside.

*Where:* unscheduled, large, and needs real navmesh work rather than our
street graph.

---

## 4 · What the original got wrong — do not copy

Worth recording, because "match the original" is not automatically the
right instinct.

- **Poor pathfinding.** Widely criticised. We already do better with A\*
  over the street graph; don't regress it for the sake of vehicles or
  interiors.
- **Limited enemy AI.** See gap 7 — inherit the setting, not the flaw.
- **Camera obstruction.** See gap 11.
- **Environments that don't vary.** HG101: "really no variation in the
  environments at all." We have per-syndicate palettes, density,
  cover-density and derelict knobs, which is a start; keep pushing so a
  SpaceX launch sector doesn't read as an Amazon depot with new colours.
- **Two factions that play identically.** HG101 calls the EuroCorp/Church
  difference "largely cosmetic." If we ever add a second playable
  syndicate it has to change how you play, not just the briefing text.
- **Chaotic, hard-to-read action.** The contemporary reviews complain
  about confusion. Readability is a feature; our low-res PS1 treatment
  makes it *harder*, so HUD clarity and legible silhouettes matter more
  here than they would in a modern-looking game.
- **Over-nerfed Persuadertron.** Making police fire on the wielder made
  crowd-building so costly that people stopped using the signature
  mechanic. When we add thresholds (gap 5), tune so that the Aligner
  strategy stays viable — our District 12 pacifist run is the check.

---

## 5 · Where we already exceed the original

Not padding — these are things not to regress.

- **Pathfinding.** A\* over the street graph vs. the original's
  much-complained-about agent movement.
- **Directional cover with rubble as partial cover.** The original had
  destructible geometry but no cover model on top of it.
- **A machine-verifiable test loop.** 69 checks including an autopilot
  that plays every mission to a win. Not a 1996 concern, but it is why
  the above can be changed safely.
- **Briefing fiction.** Corporate-memo voice with a per-mission truth the
  briefing conceals is a sharper device than the original's email client.
- **Thematic coherence of the resource.** SURGE ties the tactical
  resource to the game's actual argument. The original's IPA sliders
  were pure stat-tuning with no fiction attached.

---

## 6 · Suggested order

Sequenced by dependency and payoff, not by the ranking above:

1. **Mission gating** (gap 10) — blocks Act II, tiny.
2. **Enemy cover-seeking and flanking** (gap 7) — activates a system we
   already built and tested.
3. **Aligner thresholds + armed followers** (gap 5) — cheap, and deepens
   the signature mechanic before Act IV inverts it.
4. **Act II missions** — the arc is the product.
5. **Persistence + agent roster + cybernetics** (gap 3) — makes losses
   matter, which Act III needs.
6. **Non-lethal and area-denial weapons** (gap 4) — real alternatives to
   shooting.
7. **Full building destruction** (gap 2) — the headline feature.
8. **World map, territory, tax, research** (gap 1) — the strategic half.
9. **Sound** (gap 9), **camera occlusion** (gap 11).
10. **Ambient traffic**, then vehicles (gap 6). **Interiors** (gap 12) last.

---

## Sources

- [Syndicate Wars — Wikipedia](https://en.wikipedia.org/wiki/Syndicate_Wars)
- [Syndicate Wars — Hardcore Gaming 101](https://www.hardcoregaming101.net/syndicate-wars/)
- [Syndicate Wars — MobyGames](https://www.mobygames.com/game/551/syndicate-wars/)
- [Syndicate Wars Review — GameSpot](https://www.gamespot.com/reviews/syndicate-wars-review/1900-2533344/)
- [Syndicate Wars — full PC level list](https://syndicate.lubiki.pl/swars/walkthrough/swars_levellist_pc.php)
- [Weapons (Syndicate Wars) — Syndicate Wiki](https://syndicate.fandom.com/wiki/Weapons_(Syndicate_Wars))
- [Missions (Syndicate Wars) — Syndicate Wiki](https://syndicate.fandom.com/wiki/Missions_(Syndicate_Wars))
- Persuadertron strength values are community-reported
  ([comp.sys.ibm.pc.games.strategic](https://groups.google.com/g/comp.sys.ibm.pc.games.strategic/c/TjpzXyiE4Kk)),
  not from official documentation — treat the exact numbers as
  indicative.
