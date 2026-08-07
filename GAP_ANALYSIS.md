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
| Destructible environment | **practically every building**; level whole blocks | every tower and slab, with occupancy as the cost model | ✅ |
| Cover and positioning | implicit in geometry | directional cover, rubble as cover | ✅ (we go further) |
| Pathfinding | criticised as poor | A\* over the street graph | ✅ (we go further) |
| Vehicles | agents and NPCs, some flying | ambient traffic, drivable by the squad; NPCs don't drive, none fly | ◐ |
| Persuadertron | strength thresholds per target type; followers arm themselves from dropped weapons and fight | radius conversion, followers trail the squad, unarmed and non-combatant | ◐ |
| Police react to Persuadertron use | yes — carrying it draws fire | heat comes from gunfire and surge only | ◐ |
| Real-time behaviour sliders | **IPA**: Intelligence / Perception / Adrenaline, altering autonomous agent *behaviour* | compute channels: latency / precision / resilience, altering *stats* | ◐ |
| Shields | recharging, separate from health | the Instance buffer — a recovering share of the same pool, squad only | ✅ |
| Ammo / weapon energy | recharging pool | unlimited, deliberately — see gap 8 | ❌ |
| Weapon roster | ~19, including psycho gas, knockout gas, razor wire, ion mines, status fields, graviton gun, satellite rain, nuclear grenade | 4 firearms plus 6 field devices — choke, standdown, razor wire, misalignment, graviton, satellite rain | ◐ |
| Dropped weapons | pick up in the field | none | ❌ |
| Deployables / traps | trip wires, mines, Cerberus IFF guardian drone | razor wire and three thrown fields, all of which apply to your own squad | ◐ |
| Enemy variety | police, punks, guards, agents, zealots | rivals, enforcers, unquantized | ◐ |
| Enemy tactics | criticised as limited | cover-seeking, suppression, a shared contact, withdrawal when hurt | ✅ (we go further) |
| Crowd behaviour | panic, gas reactions | panic, throttle under surge | ◐ |

### Meta layer

| System | Syndicate Wars | Syndicate 2026 | |
|---|---|---|---|
| World map | regions, progressive unlock by conquest | ten Austin sectors on the briefing card, taken by winning their mission | ✅ |
| Territory economy | per-country tax rate; income vs rebellion risk | four rations per sector; income vs unrest, revolt and rivals | ✅ |
| Research | funded per item, money buys speed | earned from held sectors, spent in the cryovat | ◐ |
| Agent roster | larger than four; pick a squad of four | four named people with permanent losses and replacements who inherit the designation | ◐ |
| Agent upgrades | cryovat cybernetics | four implants, bought with research on the briefing card | ✅ |
| In-mission economy | rob or destroy banks for funds | none | ❌ |
| Persistence | full campaign save | save v4 — progress, flags, records, roster and the map | ✅ |
| Campaign length | 34 / 29 missions in chapters | all 15 shipped, plus retakes the map writes on demand | ◐ |
| Two playable factions | EuroCorp and the Church | one (OpenAI) | ❌ |
| Briefing fiction | in-game email client | briefing cards, corporate memo voice | ✅ |
| Sound | full | synthesised at runtime — 17 cues, a room tone ridden by heat, no asset files | ✅ |

---

## 3 · Major gaps, ranked

Ranked by **how much the game changes per unit of work**, not by size.

### 1. There is no meta-game at all — **closed**
The entire strategic half of the original is absent. No world map, no
territory, no economy, no research, no persistence. Every mission is
currently a disconnected sandbox, so nothing the player does accumulates.

The original's tax mechanic is the part worth stealing precisely: raising
tax funds research and raises rebellion risk. That is the same shape as
our SURGE — take more, pay for it socially — which means the strategic
and tactical layers would be arguing the same argument at two scales.
That's a strong thematic fit, and it's already what `PRD.md` pillar 5
promises.

**Shipped** in `src/core/territory.js`. Ten sectors of Austin, each taken
by winning its mission, each held at one of four **rations** — the
Instance tiers read as a ceiling. FRONTIER takes almost nothing and calms
the sector; FREE caps everyone at the floor, pays best, and cannot hold.

The shape the gap asked for is exact: **the ration is SURGE one scale
up.** SURGE takes cycles off the civilians nearest the squad for a
tactical advantage and climbs heat; a ration takes cycles off a whole
sector for a strategic advantage and climbs unrest. Same sentence,
different font size, and the player answers the game's central question
again every time they open the map.

It pays into `research` — the currency the cryovat already spent — so the
loop closes rather than running alongside. Implant costs were raised to
match; a whole campaign does not pay for a full kit at any ration, so the
cryovat stays a question about who matters.

Tuned so the obvious exploit fails. Playing the whole campaign at FREE
earns more than PLUS and loses seven of ten sectors doing it, and a test
asserts the margin stays small enough that squeezing is not simply
correct — which is the failure state for a tax mechanic.

**Rivals shipped too.** Every sector you have not taken belongs to one of
the four, and they push back — but only through the opening your own
ration made. Pressure scales with a sector's unrest and is net of what a
content sector shrugs off, so a quiet block is effectively immune and an
unhappy one is halfway gone.

That gives the two ways to lose a sector different rations. Squeeze
hardest and the people throw you out before any rival gets the chance;
ration at the Board rate forever and a competitor walks into what you
left unhappy. Same cause, two doors, and a test plays the whole campaign
at each ration to prove both fire.

Rivals carry off-map reach, so taking all of Austin does not make them
evaporate — holding everything is possible and still costs attention. A
sector that revolts goes to nobody, then its own syndicate walks back in.

**And the four play differently**, which §4 is explicit is the flaw to
inherit deliberately or not at all. Each doctrine changes what the player
does about it:

- **AMAZON — BROAD.** Leans on everything you hold at once, so there is
  no sector you can leave unattended.
- **GOOGLE — RICHEST.** Goes for whatever pays you most, so the thing you
  most want to squeeze is the thing you most have to ease off.
- **SPACEX — FLAT.** Pushes from orbit and is only half-interested in how
  content the street is. Tuned to sit *just under* what a calm sector
  shrugs off: they eat the whole margin without breaking the rule that
  rationing lightly is a complete defence.
- **ANTHROPIC — UNREST.** Takes no ground at all. Raises unrest instead,
  pushing sectors toward revolt rather than seizure, so the counter is
  the ration and not the gun.

Concentrated doctrines sit out below `PORTFOLIO_MIN` sectors held —
"richest" and "weakest" are the same block when you hold one, and all
four converging on a new player's only sector makes easing the ration off
stop working exactly when they are learning that it should.

**And the map now writes missions**, which was the last piece of this gap
and the one that turns the strategic layer from a spreadsheet the campaign
feeds into a loop. A sector you took and lost gets a **retake deployment**
generated on demand (`src/core/retake.js`): the same city seed, so the
streets are the ones you already fought down; repainted to whoever holds
it now; garrisoned by them, in their own field culture from NARRATIVE §5;
and briefed by an unsigned sector-desk bulletin that names them. Before
this, the only way to win a block back was to replay the mission that took
it the first time — with its original briefing, its original garrison, and
its original paint. Amazon holding a block still described as "an Amazon
field cell squatting on our racks" was the whole problem in one sentence.

The four garrisons are the four doctrines said in the field rather than on
the map: Amazon posts numbers, Google posts fewer and harder behind more
concrete, SpaceX charges and does not take cover, and an Anthropic block
is off the update channel entirely — the one defence in the game the
Aligner cannot answer. A sector that *revolted* is different again: no
garrison, only residents, no ELIMINATE objective at all, and a longer hold.
Nothing there has to die.

A retake is deliberately **not campaign progress**. It never enters
`completed`, never appears in the tab strip, never moves the deployment
counter. The arc is fifteen missions; this is what the map does around it.

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

### 4. The weapon roster is four conventional guns — **largely closed**
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

**Shipped** in `src/core/devices.js`. Two field devices, thrown at the
cursor, two charges each, non-restocking:

- **CHOKE FIELD** — everything inside drops to Free tier: half speed and
  nearly twice the spread. Pure area denial. It does not care whose
  Instance it is, so standing in your own is exactly as bad as it sounds.
- **STANDDOWN AEROSOL** — sedates. Not kills. `downed` is a distinct
  state: alive, out of the fight for the rest of the mission, and the
  squad will not auto-target one.

The Aligner interaction the gap called for is real and load-bearing:
engaging it suppresses friendly fire entirely, so **holding the Aligner
is how you stop your own squad shooting the people you are putting to
sleep**. A test clears The Bracket with six sedated and zero killed, and
without the Aligner the same run is not bloodless.

And the satire is now a mechanical fact. `sim.neutralised` is what the
objective model reads — shot or sedated, the syndicate files CLEARED
either way. `sim.kills` is kept separately, so the player is the only
party to the deployment who knows which run they actually had.

**And the offensive four shipped too**, which closes this gap. Every one
of them is built to the rule that made the first two work — none is a
bigger gun:

- **RAZOR WIRE** (`U`, Act II). Crossing it is slow and it costs. It
  outlasts a firefight, which makes it the one device you place *before*
  one rather than during it. It shapes where a fight can happen.
- **MISALIGNMENT AEROSOL** (`Y`, Act III). The alignment payload with the
  sign flipped: nobody inside can tell sides apart. A cell caught in it
  fights itself, and so does your squad. It changes *who* people shoot.
  Deliberately narrowed to whoever is armed — "the squad never
  auto-targets a civilian" is an absolute the contract missions are built
  on and this is not its exception. HOLD FIRE is a real counter, and it
  costs you your own guns for as long as it lasts.
- **GRAVITON CHARGE** (`O`, Act IV). Drags everything inside to one place
  and does no damage at all. It decides where people are standing, which
  is what makes it compose with every other tool on the belt.
- **SATELLITE RAIN** (`I`, Act IV). Borrowed from a constellation that is
  not ours. Three and a half seconds of a ring on the ground and then five
  impacts in a fixed pattern — the warning *is* the weapon, and it is the
  same warning everyone else in the block gets. The only thing in the game
  that levels a block without the squad firing a round, and tuned so that
  one strike will not drop a nine-floor tower: it clears a street, it is
  not a demolition button.

The belt **grows act by act** rather than arriving whole. Six area-denial
tools in Act I is a menu, not a toolkit, and the first ten missions were
tuned against a belt of two.

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

### 6. No vehicles — **closed**
Cars and hovercars, drivable by agents and NPCs, plus ambient traffic.
This is a large chunk of what made the original's cities feel like
cities rather than dioramas.

**Ambient traffic shipped** (`src/core/traffic.js`), which was always the
half worth doing first: most of the atmosphere for a fraction of the work.
Nothing is drivable.

It reuses the street grid the squad already paths over — a vehicle picks a
centreline, drives it end to end, picks another. No pathfinding, no
intersection logic, no turning: a car that only ever goes straight down a
street it is already on cannot get stuck, cannot deadlock and cannot cost
a frame. Everything interesting happens where it meets people.

**It brakes for you.** Not "runs you down". These are autonomous in 2041,
braking is what they are for, and a game that kills your own agents with
random background traffic is a game with a random punishment in it.
Standing in the road stops the road, which is a tactic rather than an
accident — and a queue of stopped cars with their brake lights on is the
most legible thing on the street.

**And it is a hazard you choose.** A round that hits a car stops there, so
shooting past a lane of traffic is a different problem from shooting
across an empty street. Two bursts wrecks one; the blast is fatal on top
of it and survivable across the road; the shell blocks the lane
afterwards; and it draws enforcement, because blowing up a car on a street
is loud.

Not on mission one. The tutorial teaches four things and a car detonating
during it is a distraction from all of them.

**And now you can drive one** (`src/core/driving.js`). The interesting part
is that it needed almost no new interface, because the braking rule above
already *was* one: traffic stops for anybody standing in the road, so the
way to get a car is to walk into the street and wait for one, then walk up
the lane to it and press Enter. No hotwiring verb, no ownership model, no
"press E to steal a vehicle". Two rules that already existed, meeting.

Four decisions worth keeping:

- **It stops braking the moment you are in it.** That is the whole point.
  Ambient traffic that runs your agents down is a random punishment; a car
  *you* are steering that runs a stranger down is a decision, and it is
  charged to the player like every other civilian loss — heat included.
  The game has been about what you are prepared to do to people since the
  first briefing, and this is the least ambiguous instrument in it.
- **It is speed, not armour.** Nobody inside can shoot, nobody outside can
  hit them — but the *car* is a target, rounds already stop at vehicles,
  and when it goes up it throws the squad out two metres from the blast.
  Without the car in the enemy's target list a vehicle would be total
  cover and the best move in every firefight would be "get in".
- **Position still counts.** `squad.alive` is what the extraction and hold
  zones read, and riders are in it, so driving into the zone extracts. It
  is `squad.afoot` — on their feet *and* out of a car — that gates being
  shot at, aimed at and walked. A getaway car should work.
- **A car you have touched stops being ambient for good.** It does not
  resume its lane when you step out, which is what makes it a getaway car
  rather than a taxi that leaves.

*Still open:* NPCs do not drive. Ambient traffic is autonomous, which
covers most of what the original used driven NPC vehicles for.

### 7. Enemy AI has no tactics — **closed**
Hostiles reposition to cover, are suppressed by near-misses, break contact
when badly hurt, and fight as a cell rather than as four separate people
(`src/core/tactics.js`).

Note this was a criticism of the *original* too. It is a gap we should
not inherit just because our reference did.

The last two pieces were the ones that changed how a block plays:

- **A contact is shared.** One of them seeing the squad tells everyone
  within twenty-six metres, and being told extends how far they will come
  for you. Before this, a patient player could stand just outside one
  man's aggro range and take a room apart one at a time while the man
  next to him did nothing at all. One hop, not a flood — a relay chain
  would mean stepping on any single hostile alerts the whole city, and
  `aggroRange` already covers "they heard the shooting". Dormant
  loyalists are never woken by it; that has to stay a decision the player
  makes in as many words.
- **A professional leaves.** Below 35% health a hostile stops trying to
  win the exchange and tries to leave it: it scores a wall between itself
  and the squad above cover it can still shoot from, it stops closing,
  and it keeps firing the whole way. Deliberately not `Unquantized.broken`
  — that is a person panicking and running in a straight line, and it
  should not be what a trained operative does.
- Plus the small one that stops both of the above looking stupid: two
  hostiles no longer walk to the same corner and stand inside each other.

*Still open:* nothing that matters. Fire-and-move by pairs is the obvious
next thing and is deliberately unscheduled — it needs a planner, and the
whole point of this file is that it does not have one.

### 8. No in-mission resource pressure — **closed**
No ammo, no shields, no reason to disengage. Firefights had no economy,
so the correct play was always to keep shooting.

**Shipped** as the **Instance buffer** (`src/core/buffer.js`), which is
this document's own recommendation taken literally: the recharging half
is the interesting half, because it creates a reason to break contact.

The decision that makes it work is that the pool is **split, not
extended**. An agent still has the 120 they always had; 30% of it is now
headroom that comes back and 70% is flesh that does not. Handing the
player thirty more hit points would have made every fight easier, which
is the opposite of adding pressure. What actually changed is the *shape*:
a squad that can disengage has exactly what it had before, and a squad
pinned in the open has a third less.

It recovers only after four and a half seconds without being hit — longer
than any enemy's fire rate, so it cannot refill inside an exchange — and
RESILIENCE sets how fast. That is the second thing this bought: the
channel used to be a slightly smaller number on incoming damage, and it
is now how quickly a squad is ready to go again, which is something the
player feels between fights rather than only inside them.

Ammo deliberately not taken. It is the half the original had that adds
bookkeeping rather than decisions — a magazine count does not create a
reason to reposition, it creates a reason to stand still and wait, and
the fifteen missions are tuned against unlimited fire.

Hostiles do not get one. The fiction is that it is what a field-grade
allocation buys, and the practical reason is that it would double every
time-to-kill on the block.

### 9. No sound — **closed**
Weapons, ambient city, mission stingers. Absent entirely. Disproportionate
effect on feel for the work involved.

**Shipped** in `src/audio/`, and every sound in the game is **synthesised
at runtime**. There are no audio files — there is no build step and no
package manager to fetch them with, and a project whose whole look comes
from clip-space vertex snapping and a 640×360 framebuffer should not be
shipping 48kHz stereo samples. Short, dry, band-limited: a PS1 sound chip
is the reference, not a film mix.

Split the same way everything else here is. `kit.js` is pure — events in,
cues out — so the **mix** is tested in Node like the rest of the
simulation, and `sound.js` only has to make a cue audible. That split is
the point: almost every mistake in game audio is a mixing mistake, and
mixing is numbers.

What the numbers are asked to guarantee, in tests:

- **Per-voice caps.** Four agents fire eight rounds a step; three get
  through. Uncapped, a firefight is white noise — which is not "loud", it
  is *quiet*, because everything cancels and nothing reads.
- **Loudest first, then capped**, so the three that survive are the three
  nearest the player rather than the three pushed first.
- **Sub-linear stacking.** Satellite rain lands five impacts on one frame;
  summed arithmetically that is one device putting 4.5 of headroom into a
  single step.
- **A kiosk and a nine-floor tower do not land the same.** The collapse
  cost model says they are different and the mix has to agree.
- **A gunshot is never the loudest thing in the game.** It is the most
  common by two orders of magnitude; if it is also the loudest, nothing
  else is ever heard.
- **Panning follows the camera, not the world**, because this game lets
  you spin the city.

There is a **room tone** as well: one looping graph for the session,
ridden by heat. What heat opens is the *filter*, far more than the gain —
a bed that only gets louder reads as a volume bug; a bed that gets
brighter reads as a street getting nervous, which is what the heat meter
is actually about. Back-loaded, so enforcement arriving is audible before
it is visible, and silent off the field, because a room tone under a card
somebody is reading is just a hum.

Deliberately not a score. The game has none, and a stinger arriving with
enforcement would tell the player how to feel about something the debrief
is going to be dry about.

`M` mutes, and the setting is stored separately from the campaign — it is
a property of the machine somebody is sitting at, not of the run, so
wiping the record does not turn the audio back on.

### 10. Campaign is 4 of 15 missions
And mission gating still isn't implemented, so the four that exist can be
played in any order — which will actively damage the Act I→II turn.

*Where:* Phase 2. **Gating should land before Act II is written.**

### 11. Camera occlusion is unhandled — **closed**
The original was criticised for skyscrapers hiding the squad. Ours were
supposed to be safe: the camera is constrained to look *down* at the
streets, which was the whole answer for a long time. It stopped being the
answer when towers became destructible and started reaching thirty
metres — at `PITCH_MIN` the lens sits below the roofline, and a block on
the near side takes the squad off screen.

**Shipped.** `occludersBetween()` in `src/core/city.js` answers which
structures stand between two points, and the renderer ghosts them to 16%.

Three decisions worth keeping:

- **Three-dimensional, not a footprint test.** A flat test would fade
  every building the squad happened to be standing behind, which is most
  of them — the camera sits twenty-odd metres up and looks over nearly
  everything. Height is the whole question.
- **Faded, not hidden.** The building is still cover, still shootable,
  still something you might drop on somebody. Removing it would lie about
  the world in the opposite direction. It also stops writing depth while
  ghosted, or it would hide the squad anyway.
- **Eased, not switched.** Out fast, back in gently: losing sight of your
  squad is urgent, getting a wall back is not. A hard toggle pops a
  nine-floor block in and out every time the camera drifts a degree, which
  is more distracting than the occlusion it fixes.

Tested headlessly, because the geometry is pure core; the fade itself is
checked in the browser suite, which is the only place a material's opacity
is observable.

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
  Most of the graphics work has been readability work wearing a costume.
  Blob shadows are the clearest case: they are there because at a 45°
  camera a body standing on the street and a body hovering over it are
  the same picture, and knowing where somebody is standing is the whole
  game. The same test applies to anything added next — if it does not
  help you read the block, it is decoration, and decoration costs frames.
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
- **A machine-verifiable test loop.** 366 checks including an autopilot
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
