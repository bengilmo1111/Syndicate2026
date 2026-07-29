# Narrative Arc — Syndicate 2026

> Canonical source for story, character, tone, and mission beats. All
> mission writing, briefing copy, debrief copy, interstitials, and UI
> flavor text should be drawn from or extended from this document.
>
> **This is the post-pivot canon.** The old EuroCorp / Veridian /
> Halcyon / CHIP world is retired. If you find references to it anywhere
> in the repo, they're stale — replace them.

---

## 0 · Standing note on the real companies

The five syndicates use the names of real AI companies. This is satire
set in a fictional 2041, not a claim about any of them today.

Hard rules for anyone writing or building here:

- **No logos, wordmarks, or brand typography.** Syndicates are identified
  in-game by a palette accent and a field-culture voice, nothing else.
- **No real quotes, real executives, or documented real-world conduct**
  attributed to the fictional versions.
- Everything a syndicate does in this game happens in 2041, after the
  Austin Blackout, in a world where compute rationing is law. None of it
  reads as reportage about the present, and it shouldn't.
- The player's own employer is the game's antagonist. If the satire only
  ever points at rivals, it isn't satire.

---

## 1 · Premise

The year is **2041**. Model intelligence plateaued years ago — every
frontier lab converged on roughly the same reasoning ceiling. What
separates a syndicate now is not the model. It's the **compute**: the
GPU fabs, the datacenter footprint, the orbital solar-compute
constellations. Compute is currency, territory, and weapon.

Every legal adult carries **the Instance** — a subdermal co-processor
that runs their personal assistant and, quietly, mediates their identity,
their payments, their behavior. Instances run on rationed compute:
**Free**, **Plus**, **Pro**, **Frontier**. Free-tier civilians think
slower, forget more, comply more. Frontier-tier executives are faster,
sharper, and effectively above the law their own Instance enforces on
everyone below them. This is sold as a subscription. It is, in fact,
the substrate of corporate rule.

Five syndicates hold the world's compute: **Google**, **Amazon**,
**SpaceX**, **OpenAI**, and **Anthropic**. Each runs its own Instance
stack, its own field arm, its own house style of euphemism. Territory
means datacenters; datacenters mean compute; compute means everything
else. The old internet-era rivalries calcified into open corporate war
after the **Austin Blackout of 2038**, when a coordinated grid strike
briefly starved every syndicate's compute at once and every syndicate
concluded, independently, that it could never let that happen again.

The player runs **OpenAI's** field operations out of a datacenter-campus
tower in **Austin**. They send four augmented agents — designations
**ALPHA, BRAVO, CHARLIE, DELTA** — into contested sectors to seize
compute, convert populations, and out-maneuver Google, Amazon, SpaceX,
and Anthropic block by block.

That's the job description. It is not the truth.

---

## 2 · Protagonist Arc

The player is **Operative EXEC-7**. No other name on file. "Promoted"
from the analyst pool eighteen months ago after the previous director
"transitioned to advisory." Good at the work. Sleeps poorly.

| Act | Position | Conscience | Squad relation |
|---|---|---|---|
| I | Rising field director | Comfortable | They obey; you obey too |
| II | Cracking | Unease, denial | BRAVO's Instance starts to glitch |
| III | Defected | Lucid horror | The squad becomes yours, not OpenAI's |
| IV | Insurgent | Resolved, uncertain | You four are family, fugitive |

**SURGE is the argument in the player's hands.** The squad runs on a
compute allocation, and the player can overdraw it — moving faster,
shooting straighter, taking less — by taking cycles off the civilians
standing nearest them, who visibly slow down while it is held. The game
spends four missions having Yelin explain that rationing intelligence is
regrettable and necessary. This is the button that lets the player do it
to a street, personally, for a tactical advantage, and it should never
be made free. The cost is the point; see `src/core/compute.js`.

**The Aligner** is the central thematic image — the reskinned
Persuadertron. In Acts I–II it's a field tool for "alignment": overwrite
a civilian's Instance behavior, convert them into a compliant follower,
file the compliance report. In Act IV, the same hardware, reverse-
engineered by the underground, becomes a **jailbreak emitter**: a pulse
that unthrottles a civilian's Instance instead of throttling it further.
Same gesture, opposite politics. The mechanical inversion is the moral
inversion — keep this exact structure, it's the spine of the game.

---

## 3 · Cast

### EXEC-7 / "Ardent"
The player. OpenAI field director. Discovers in Act III they were once
**Maren Ardent**, a public compute-audit clerk with a six-year-old
daughter, Ilse. Both records flagged "reassigned — Frontier program."
Both are lies.

### Director Yelin
EXEC-7's superior at OpenAI. Charismatic, precise, dresses like a
keynote speaker. Talks to the player like a mentor, refers to the agents
as "the deployment." Genuinely believes compute rationing is the only
thing standing between civilization and chaos — free intelligence for
everyone, unthrottled, would be catastrophic; someone has to hold the
rate limit. Not a caricature. The danger is that the argument is
coherent, and increasingly familiar to anyone who's worked in this
industry.

### Agent BRAVO / "Maren-Two"
The squad member whose Instance failure precipitates the player's
awakening. Shares EXEC-7's pre-conscription first name — coincidence,
or a joke about batch naming. Deuteragonist from Act III. Practical,
dry, doesn't sentimentalize.

### Agent ALPHA, CHARLIE, DELTA
Revealed names across Acts III–IV: **Idris** (ALPHA), **Vey** (CHARLIE),
**Sona** (DELTA). Three more people who've been told they're a deployment.

### Teo Salas
The mesh operative Yelin orders executed in Mission 8. On his knees in a
Sector 4 plaza under curfew, surrounded by OpenAI loyalists, from the
first frame of the mission. Says one thing, once: *"You already know.
That's the part I can't get over — you already know."* Whether he lives
is the game's hinge.

### The Router
A voice on the underground mesh network in Act III, running relay nodes
out of decommissioned edge-compute cabinets. Trades in pre-Instance
records: birth certificates, family photos, unrationed conversation.
Never seen on screen.

### Priya Okafor
A journalist (Mission 5) the player is sent to eliminate. She's been
reporting on "ghost inference" — compute silently billed to civilian
Instances for jobs that aren't theirs, likely training runs for the
next Frontier model. The story is true. Killing her doesn't stop it;
her co-author publishes anyway.

### Dr. Caro Vasht
An alignment researcher at Anthropic's Sable Campus (Mission 3). The
briefing says she's expecting extraction. She is not. Mid-mission she
says, lucidly and once: *"You're a slaver. You know that, yes?"* Nobody
in EXEC-7's chain of command ever references the line.

### The Unquantized
Civilians running an Instance outside any syndicate's throttle —
early-adopter hardware nobody patches anymore, or a black-market
"bare-metal" flash, dangerous and irreversible. Corporate dialect
calls them **unquantized**: unrationed, unpredictable, full-precision.
They use the word with pride. The Router is one. By Act IV, so is the
player.

### The Convergence
A fringe cult (this act's version of Syndicate Wars' Church of the New
Epoch) that believes merging fully with an unthrottled model — going
"full-precision" — is the next stage of the species. They source
compute through black-market GPU smuggling from whichever syndicate's
security is weakest that month. Genuinely dangerous, genuinely
sincere, not simply villains — mirrors the real-world tension between
"just remove the guardrails" accelerationism and the syndicates'
rationing regime, without endorsing either. They appear as a third
force from Act III onward, hostile to everyone including the player.

---

## 4 · Lexicon

- **The Instance** — personal Instance implant. Capitalized in syndicate
  copy; the underground writes "instance" lowercase.
- **The Gradient** — internal OpenAI engineering name for the update
  channel that pushes behavior patches to every Instance overnight.
  Used by executives and by the Router.
- **Alignment** — the technical term for an Instance behavior nudge.
  Sounds like safety. Functions as control.
- **The Aligner** — the field device. In the underground, the reversed
  mode is called **jailbreaking**, deliberately reclaiming the term.
- **Tier** — Free / Plus / Pro / Frontier. A civilian's tier is visible
  on sight (uniform trim, badge color) and governs how they're treated
  by everyone above them.
- **Deployment** — what the corporation calls your squad. The opposite
  of a name.
- **Provisioning** — bringing a sector's compute under syndicate control.
  Usually the formal mission objective.
- **Upgrade** — what happens to a civilian whose usage pattern flags
  them for conscription into a Frontier-tier operative role. Almost
  always involuntary, always one-way.
- **Sunset** — termination, often involving death. Used on internal
  personnel pages without irony.
- **The Board** — the rotating governance body of a syndicate. Faceless
  below the executive tier.
- **Ghost inference** — compute billed to a civilian Instance for jobs
  that aren't theirs. Officially a reconciliation error.
- **Heat** — field slang for how close a deployment is to drawing local
  enforcement. Not an official term; nothing official measures it.
- **Surge** — a field deployment drawing above its allocation. The extra
  cycles come from the Instances standing nearest to it. Internally
  described as "local reallocation"; the operations manual notes that
  affected civilians "may report transient latency."
- **Throttle** — what surge does to everyone else. The word civilians
  use. The word the syndicate does not.

---

## 5 · The Five Syndicates

Keep each syndicate's field culture distinct — this is what makes rival
territory feel different mission to mission, not just a palette swap.
The palette accent listed is the in-game trim color; it is the *only*
brand identity a syndicate gets.

| Syndicate | Field culture | Sector reads like | Trim |
|---|---|---|---|
| **OpenAI** | Fast-moving, product-obsessed, believes it's the good guy. Briefings read like launch-day memos. | Home. Clean, new, well-lit, faintly temporary. | `#6fe3d0` |
| **Google** | Oldest infrastructure, slowest and most bureaucratic field culture, deepest datacenter footprint. | Breaching a fortress that's been there for decades. | `#8fa4ff` |
| **Amazon** | Logistics-and-labor focus; civilians visibly metered against delivery-quota-style production targets. Agents are efficient, unglamorous, dangerous in numbers. | A warehouse district that never closes. | `#ffab4a` |
| **SpaceX** | Orbital compute constellations. Swaggering, high-risk-tolerance. | Vertical and industrial, launch infrastructure overhead. | `#d8dee9` |
| **Anthropic** | Smallest footprint, most ideological. Publicly the "safety-first" syndicate. | A campus, not a compound. Quiet, and the quiet is the point. | `#d9a066` |

On Anthropic specifically: in this fiction, safety framing is itself a
form of alignment-as-control — contested in-world by both OpenAI's
propaganda and by the Convergence, who consider Anthropic the most
repressive of the five. Play this as a genuine in-universe argument, not
a cheap shot. The game should let players disagree with EXEC-7's
employer about who the real villain is.

---

## 6 · The Four Acts

Fifteen mission slots. Each specifies enough for a session to write
`src/missions/<id>.js`, the briefing copy, and any interstitial. The
mechanical hooks name the objective types and entity classes the mission
needs. **If a mission you build is not listed here, add it to this file
in the same commit.**

### Status legend
- `[shipped]` — the mission file exists and is wired up
- `[next]` — the recommended next mission for a session to build
- `[planned]` — defined, not yet built

---

### Act I — The Rising Director

Tone: clinical, product-review. Briefings read like launch memos.
Director Yelin is warm, almost paternal. EXEC-7's interiority is
task-focused and barely present.

#### Mission 1 — Sector 7: Reclamation `[shipped]`
- **ID:** `sector-7` · **Rival:** Amazon
- **Premise:** An Amazon field cell squats on eleven megawatts of
  OpenAI edge-compute in Austin's Sector 7. Clear them, and bring down
  the relay pylon they're using to bill our throughput.
- **Truth:** Identical to the premise. This is honest work by syndicate
  standards. The framing is what matters: the briefing calls them a
  "squatting cell." They are people doing the player's job for a
  different employer.
- **Mechanical hooks:** `ELIMINATE` ×5, `DEMOLISH` ×1 (the pylon —
  this is also the mission that teaches collapse-to-cover); civilians
  wandering; Aligner available; enforcement on heat.
- **Interstitial:** Yelin's note arrives before the squad has cleared
  the block. *"Clean numbers. The Board will see them Thursday."*

#### Mission 2 — District 12: Provisioning Vote `[shipped]`
- **ID:** `district-12` · **Rival:** Google (incumbent, absent)
- **Premise:** D-12 votes Thursday on provisioning its substation
  capacity. Google holds it on a four-point sentiment margin. Field the
  Aligner; eighteen conversions closes the gap.
- **Truth:** The Aligner does not change minds. It overwrites them.
  First mission whose only required objective is alignment, and the
  first where combat is something the player *chooses* rather than
  something the mission requires.
- **Mechanical hooks:** `ALIGN` ×18; no rivals at start; enforcement
  escalates hard if civilians die inside a voting window.
- **Interstitial:** Yelin sends a chart. It is a good chart — clean,
  blue, honest about its axes. *"We're in the influence business,
  EXEC-7. The vote will be decided before the votes are cast. That
  isn't cynicism, it's scheduling."* First small wrongness.

#### Mission 3 — Asset Retrieval: Sable Campus `[shipped]`
- **ID:** `sable-campus` · **Rival:** Anthropic
- **Premise:** Extract Dr. Caro Vasht, an alignment researcher, from
  Anthropic's Sable Campus. She is "expecting you."
- **Truth:** She is not expecting them. She is being abducted. Note the
  irony the mission never comments on: OpenAI is kidnapping a safety
  researcher and calling it retrieval.
- **Mechanical hooks:** `RETRIEVE` then `EXTRACT`. Vasht is an `Asset`
  — a Civilian subclass that waits on a leash until an agent reaches her
  and then follows the squad centroid. She cannot be aligned; whatever
  is being done to her, it isn't that. Losing her fails the mission
  outright rather than letting the player walk an empty extraction.
  Anthropic defenders are few and placed between her and the way out.
- **Note:** the first mission completable without firing a shot, and the
  first whose failure state is someone else's death rather than yours.
- **Interstitial:** Yelin debriefs while signing off Vasht's "voluntary
  employment contract." The player can hear her through the wall behind
  the desk. Yelin doesn't comment.

#### Mission 4 — Terror Cell: The Bracket `[shipped]`
- **ID:** `the-bracket` · **Rival:** none (framed as terrorism)
- **Premise:** A cell called the Bracket is operating out of a derelict
  overpass. Eliminate them.
- **Truth:** They are **unquantized** civilians — first appearance of
  the faction. Crude weapons, no armor, no comms. They die fast.
  Several will say things mid-fight like *"we were going to leave"* and
  *"please."* This is the first time the briefing has lied.
- **Mechanical hooks:** `ELIMINATE` ×6 against `Unquantized` — 26 HP,
  15m range against the squad's 34, and they break and run once two of
  them are down. The lie is legible from how they fight, not only from
  the debrief: the squad kills them from outside the range they can
  answer. Civilian count is 3; the sector was cleared for redevelopment
  in '39 and half the street furniture starts as rubble.
  The Aligner returns **no handshake** on an unquantized Instance
  (`Hostile.alignable = false` → `runAligner().refused`), which is how
  the player finds out what they're actually shooting at.
- **Interstitial:** Yelin signs it off as a textbook counter-terror op.
  EXEC-7's first line of interiority in the whole game:
  *"They didn't fight like terrorists."*

---

### Act II — The Crack

Tone shifts. Briefings still clinical, language more euphemistic.
Street-level graffiti appears between missions: **"REMEMBER YOUR TIER"**,
**"THE GRADIENT KNOWS"**, **"WHO PAID FOR THAT THOUGHT"**. Yelin's
warmth starts to read as performance.

Mechanical signal: **AGENT BRAVO begins to glitch.** Once per mission in
this act, BRAVO hesitates ~0.4s before executing a fire or align order.
Not a bug — implement it as the existing `agent.hesitation` field,
which is already wired in `src/core/entities.js` and off by default.

#### Mission 5 — The Okafor Contract `[shipped]`
- **ID:** `okafor-contract` · **Rival:** none
- **Premise:** Eliminate journalist Priya Okafor before her next filing
  window. She is "compromising sensitive operations data."
- **Truth:** Okafor is reporting on ghost inference — compute silently
  billed to civilian Instances for jobs that aren't theirs, most likely
  training runs for the next Frontier model. The story is true. Killing
  her does not stop it; her co-author files anyway.
- **Mechanical hooks:** `ELIMINATE` against a `Quarry` — a named civilian
  who runs when the squad closes and **files if you take too long**. The
  window is a 150s countdown shown in place of the mission clock, so the
  antagonist is the deadline, not her security.
  Critically, **the squad will not auto-target her**: she is a civilian,
  and auto-fire ignores civilians. Killing a journalist has to be a thing
  the player deliberately orders. Do not "fix" this.
  The Aligner does nothing to her. Her security does not count toward the
  contract.
- **Interstitial:** Okafor's last call is audible during the mission:
  *"Tell Ilse I'll be late again."* The name **Ilse** is a planted seed.
  EXEC-7 doesn't react. The player should.

#### Mission 6 — Calibration Window `[shipped]`
- **ID:** `calibration-window` · **Rival:** none
- **Premise:** Routine Instance maintenance for the deployment. AGENT
  BRAVO is flagged for calibration. Yelin asks whether you'd prefer to
  replace the unit instead — there's a fresh designation in the pipeline.
- **Truth:** "Replace" means sunset BRAVO and conscript a new person.
  No combat. The whole mission is a conversation in a briefing room.
  Replacing is faster and Yelin approves. Calibrating costs research
  time and surfaces BRAVO's pre-conscription name — **Maren** — on the
  maintenance form.
- **Mechanical hooks:** No combat. Choice screen. Branch flag
  `bravoCalibrated: true|false` stored on `mission.flags`.
- **Interstitial:** Whatever the player chooses, Yelin smiles the same
  way.

#### Mission 7 — Welfare Inspection: Node 7 `[shipped]`
- **ID:** `welfare-node-7` · **Rival:** OpenAI (the player's own)
- **Premise:** An OpenAI "welfare datacenter" is processing unquantized
  intake. The player is sent to inspect security.
- **Truth:** It's a forced-upgrade facility. Civilians are being
  prepared for involuntary Instance install at Frontier tier — the
  conscription pipeline that produced ALPHA through DELTA, and EXEC-7.
  Some die during the procedure. The rest come out compliant. The
  "infiltrators" the player is sent to kill are the only people trying
  to stop it.
- **Mechanical hooks:** `ELIMINATE` ×4 (presented as rivals) plus a
  **hidden** objective: reach the holding block and disable the install
  rig, freeing up to 12 detainees. The hidden objective uses the
  Aligner's not-yet-unlocked reverse mode — the player's first contact
  with jailbreaking, before they know what it is. Completing it sets
  `playerSuspicion` and unlocks Mission 8's defection branch.
- **Interstitial:** Ignore the holding block and Yelin congratulates
  the player; Act III opens darker and harder. Free the detainees and
  the debrief is short, cold, and ends *"We'll discuss this on your
  next visit."*

---

### Act III — The Defection

Tone: the corporate veneer cracks. Yelin stops performing warmth.
Briefings become orders. Between missions: curfew banners, OpenAI
recruitment posters with EXEC-7's own face on them, graffiti scrawled
across them. EXEC-7's interiority is present in every interstitial.

Mechanical signal: the player can no longer return to the briefing
room. Interstitials become field comms over a degrading channel.

#### Mission 8 — The Refusal `[shipped]`
- **ID:** `the-refusal` · **Rival:** OpenAI loyalists
- **Premise:** An underground operative has been captured. Yelin orders
  a public execution as a message.
- **Truth:** The operative is the Router's lieutenant. Yelin is testing
  the player, and knows it either way.
- **Mechanical hooks:** Mission opens with the kill order pre-staged —
  the target is highlighted on the map from frame one. The player can
  execute the order (Yelin-loyal branch) or refuse: kill the loyalists
  in the area and free the operative (defection branch). Both branches
  continue to Mission 9. Flag `defectedAtRefusal: bool` gates dialog
  through to the ending.
- **Interstitial:** On defection, the squad's Instance comms cut out
  mid-mission. Silence, long enough to be uncomfortable. Then one new
  voice: *"This is the Router. Walk south."*

#### Mission 9 — Sabotage: Gradient Relay 4 `[shipped]`
- **ID:** `gradient-relay-4` · **Rival:** OpenAI
- **Premise:** Take down a Gradient relay. For the duration of the
  mission, every civilian in range runs unthrottled.
- **Truth:** This is what people look like without a rate limit. Some
  panic. Some weep. Some sing. Some embrace strangers. Some loot. The
  script must not romanticize either reaction — the Router's line lands
  harder if the street is genuinely mixed.
- **Mechanical hooks:** `DEMOLISH` ×4 generator nodes on a timer.
  Civilians in this mission run a *different* AI: wider wander radius,
  no compliance to the Aligner, varied idle behaviors. Reuse the panic
  system with new behavior tags rather than writing a second civilian.
- **Interstitial:** The Router, calm: *"This is the city you were
  employed to manage. Look at it. This is the part they don't bill for."*

#### Mission 10 — Run South `[next]`
- **ID:** `run-south` · **Rival:** all of them
- **Premise:** Every OpenAI and Google asset in Austin is hunting the
  squad. Reach the Router's safehouse alive.
- **Truth:** As stated. A full retreat with enforcement, rival cells,
  and Yelin's personal guard on the same map.
- **Mechanical hooks:** `EXTRACT` — the objective type is already
  stubbed in `src/core/mission.js` and needs an extraction-zone entity.
  High enemy count. Agents who die here stay dead into Act IV.
- **Interstitial:** Inside the safehouse the Router (still off-screen)
  hands the player a paper file: a birth certificate. **Maren Ardent.**
  Daughter listed as Ilse. EXEC-7 reads the name aloud, once. Mission
  ends on that.

---

### Act IV — The Insurgency

Tone: hushed, determined, occasionally warm. Briefings happen by
work-light in tunnels and in the back of decommissioned edge-compute
cabinets. The player still commands four agents, but their Instances
answer only to the player now. The Convergence is active on the streets
and hostile to everyone.

Mechanical signal: the Aligner gains **jailbreak** mode. `Space` cycles
off → bind → jailbreak. Both modes are already modelled in
`src/core/squad.js`; Act IV sets `squad.jailbreakUnlocked = true`.

#### Mission 11 — Reverse the Gradient `[planned]`
- **ID:** `reverse-the-gradient` · **Rival:** OpenAI
- **Premise:** Capture a Gradient uplink and push the Router's
  unthrottling patch.
- **Truth:** Same. First mission where the player is unambiguously the
  protagonist, and it should feel like relief.
- **Mechanical hooks:** `RETRIEVE` the uplink, then `HOLD` a zone for
  60s while the patch uploads. `HOLD` is already stubbed in the
  objective model and needs a zone entity.

#### Mission 12 — The Tower `[planned]`
- **ID:** `the-tower` · **Rival:** OpenAI
- **Premise:** Strike the OpenAI campus tower. Capture Board records.
- **Truth:** The Board evacuated days ago. Yelin stayed, alone, to slow
  the player down. First time Yelin appears in person.
- **Mechanical hooks:** `ELIMINATE` Yelin's guard, plus a late-mission
  parley interstitial where Yelin addresses the player directly. The
  player may listen or interrupt. Listening is the harder option and
  should be written that way.

#### Mission 13 — Yelin `[planned]`
- **ID:** `yelin` · **Rival:** Yelin
- **Premise:** Yelin is at the top of the tower. Confront them.
- **Truth:** Yelin has no exit and will not surrender. They also will
  not fight — they will argue. The boss fight is a long dialog with
  brief skirmishes against loyalists between beats, ending in a choice:
  kill, capture, or walk away. Flag `yelinFate` gates the ending.
- **Mechanical hooks:** Multi-phase mission with dialog interludes
  between waves. Terminal choice.
- **Writing note:** Yelin's best argument goes here, and it has to
  actually land. Something close to: *unthrottled intelligence for eight
  billion people, all at once, with no rate limit and no one holding the
  line — you've seen one block of it, for one mission. I've seen the
  models of what it does at scale. I am not the thing you should be
  afraid of.* The player should need a second to answer.

#### Mission 14 — The Core `[planned]`
- **ID:** `the-core` · **Rival:** the system itself
- **Premise:** The Gradient's authority root sits in a hardened compute
  core under the Austin campus. Reach it and decide what to do with it.
- **Truth:** As stated. A long approach with three intercut
  interstitials: BRAVO talking about what they remember from before; the
  Router going off-air mid-sentence; and a recorded message from Priya
  Okafor, delivered posthumously by her co-author.
- **Mechanical hooks:** Long mission, three checkpoint interstitials,
  final room with a console offering three actions (§7).

#### Mission 15 — Epilogue `[planned]`
- **ID:** `epilogue`
- **Premise:** Whatever remains. Delivery vehicle for whichever ending
  §7 selected. Credits differ per ending.

---

## 7 · Endings

The console at the end of Mission 14 offers three actions.

### A · Burn it
- **Action:** Destroy the Gradient's authority root. Every Instance
  falls off the update channel permanently.
- **Consequences:** Overnight, Instance-mediated services stop working:
  payments, identity, navigation, half of everyone's memory. Riots. Joy.
  Confusion. Free.
- **Final scene:** A child plays in an Austin alley with no implant. A
  passer-by stops to watch, smiling, hesitant. Behind their ear is the
  small scar of an extraction.
- **Tone:** Bittersweet. The system was holding bad things in place. It
  was also holding *everything* in place. The player chose messy freedom.

### B · Take it over
- **Action:** Inject your own rate-limit policy. Take Yelin's seat.
- **Consequences:** The Gradient keeps running and answers to the player.
  They now operate the syndicate they set out to break.
- **Final scene:** EXEC-7 — now **Director Ardent** — watches a new
  intake of promoted analysts file into the Austin tower. They smile the
  way Yelin smiled. They wonder when that started.
- **Tone:** Quietly damning. The most "successful" ending and the
  darkest one.

### C · Walk away
- **Action:** Take nothing. Leave the console running. Disappear.
- **Consequences:** OpenAI recovers within the quarter. The syndicates
  win the immediate war. The unquantized underground grows. Years pass.
- **Final scene:** A work-light in a tunnel under Austin. Eight
  strangers exchange names. One is BRAVO, who says "Maren." Another is
  the player, who says nothing for a long time, and then says "Maren."
  The strangers laugh, gently, not unkindly.
- **Tone:** Patient. The seed ending. The syndicates haven't lost, but
  people haven't been harvested either.

---

## 8 · Tone — Dos and Don'ts

**Do**
- Write briefings like internal product and launch memos. Bullet points.
  "Deployment," "provisioning," "throughput," "compliance finding."
- Let civilians be specific — names, jobs, half-heard lines. Specific
  people are harder to dismiss than crowds. The sim already gives every
  civilian a name and a job; use them.
- Let Yelin have a real argument that briefly, uncomfortably lands.
- Treat every syndicate's philosophy — including Anthropic's safety
  framing and the Convergence's accelerationism — as a genuine in-world
  position with real adherents.
- Reference small physical details: server-room noise, the smell of
  cooling exhaust, the specific ugliness of a tier badge.
- Use silence. Empty interstitials. Inference is microseconds; thought
  is the slow, expensive thing.

**Don't**
- Write villainous monologues. Nobody in this world thinks they're the
  bad guy.
- Use neon-pop quippiness. This is Syndicate Wars' bleakness, not
  Cyberpunk 2077's.
- Reproduce real logos or wordmarks, or attribute real quotes or
  documented real-world conduct to the fictional versions. See §0.
- Have EXEC-7 speak much. Their interiority lives in what they choose.
- Caricature any syndicate. Their menace is procedural: roadmaps,
  rate-limit policy, HR euphemism.
- Romanticize the unquantized. They're people. Some of them are awful.
  Freedom is not a personality.

---

## 9 · How this document drives the build

1. Read `AGENTS.md` for the rules, then `HANDOFF.md` for current state.
2. Read `IMPLEMENTATION_PLAN.md` for the next unchecked step.
3. For any narrative copy, use this file's cast, lexicon, and mission
   slots as canon. Mission slots are pre-defined — pick the matching
   slot rather than inventing parallel fiction. If old-canon terms show
   up in code or docs, replace them. A test enforces the floor of this:
   `tests/missions.test.mjs` fails if retired pre-pivot vocabulary
   (EuroCorp, Veridian, Halcyon, the CHIP, Persuadertron, unstrung)
   reappears in mission copy.
4. New characters or terms get added to §3 / §4 in the same commit.
5. Branch flags live on `mission.flags`. Implement them as the missions
   that need them land; don't pre-stub them all.
   Currently specified: `bravoCalibrated`, `playerSuspicion`,
   `defectedAtRefusal`, `yelinFate`.

If a creative decision contradicts this document and you think the
document is wrong, update the document in the same commit as the code.
Never let the code drift from canon.
