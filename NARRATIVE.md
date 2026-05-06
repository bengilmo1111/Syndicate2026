# Narrative Arc — Syndicate 2026

> This file is the canonical source for story, character, tone, and mission
> beats. It is not a side document. **All mission writing, briefing copy,
> debrief copy, interstitial dialog, and UI flavor text should be drawn from
> or extended from this document.** When in doubt, read this first.
>
> Future sessions: if you're writing a new mission file under `missions/`, a
> briefing card, an overlay string, an enemy name, or a debrief — open this
> file and consult the act, beat, and tone notes for the current arc
> position before inventing new fiction. Keep the arc coherent.

---

## 1 · Premise

The year is **2096**. A century of corporate amalgamation has dissolved
nation-states into half a dozen vertically integrated *syndicates* whose
boundaries are economic rather than geographic. Citizenship is a service
contract. Law is a terms-of-service update. Every legal adult is fitted
with **the CHIP**, a neural co-processor that mediates banking, identity,
and — quietly, deniably, in microsecond bursts — *suggestion*. The CHIP
is sold as convenience. It is, in fact, the substrate of corporate rule.

EuroCorp built the original CHIP standard and held the world for forty
years. That monopoly cracked in the **Singapore Default of 2089**, when
three regional houses forked the protocol. Today three syndicates
contest the city-states: **EuroCorp**, **Pan-Asian Veridian**, and
**Halcyon Mercantile**. Each runs its own variant of the CHIP, its own
field arm, its own euphemisms.

The player's syndicate is **Veridian**. The player runs Veridian's
field operations out of a glass tower in **Hong Kong-3**. They send
four cyborg agents — designations **ALPHA**, **BRAVO**, **CHARLIE**,
**DELTA** — into contested sectors to assassinate, persuade, retrieve,
and seize.

That's the job description. It is not the truth.

---

## 2 · Protagonist Arc

The player is **Operative EXEC-7**. They have no other name on file;
they assume they never had one. They were "promoted" from the analyst
pool eighteen months ago after the previous director "took a permanent
leave." They are good at the work. They sleep poorly.

The arc is a four-act awakening:

| Act | Position | Conscience | Squad relation |
|---|---|---|---|
| I  | Rising executive | Comfortable | They obey; you obey too |
| II | Cracking | Unease, denial | One agent (BRAVO) starts to glitch |
| III| Defected | Lucid horror | The squad becomes yours, not Veridian's |
| IV | Insurgent | Resolved, but uncertain | You four are family, fugitive |

The Persuadertron is the *central thematic image*. In Act I–II it is a
tool of corporate suggestion: convert civilians into compliant
followers, file the paperwork. In Act IV the same hardware, reverse-
engineered, becomes a tool of *liberation*: a pulse that *unbinds*
civilians from the CHIP's nudges. Same gesture, opposite morality.
The mechanical inversion is the moral inversion.

The player ends the game by choosing what kind of person they have
become. See §6 Endings.

---

## 3 · Cast

### EXEC-7 / "Ardent"
The player. A field-operations director who is not, in fact, a person
the CHIP recognises as fully autonomous. Discovers in Act III that
they were once **Maren Ardent**, a public-records archivist with a
six-year-old daughter named Ilse. Both records are flagged "DECEASED
— industrial incident." Both are lies.

### Director Yelin
EXEC-7's superior. Charismatic, vegetarian, immaculately dressed.
Speaks to the player like a mentor, refers to the agents as
"hardware." Yelin believes the syndicates are stewards of an
evolutionary upgrade and that human freedom is a luxury for people
who have never lived in a famine. Antagonist of Act II–III. Not a
caricature. The danger is that they have a coherent argument.

### Agent BRAVO / "Maren-Two"
The squad member whose CHIP failure precipitates the player's
awakening. By the time the player learns BRAVO's pre-conscription
name (it is *also* Maren — a coincidence, or a corporate joke about
batch processing), it is too late to be neutral about it. BRAVO
becomes the player's deuteragonist in Acts III–IV. They are
practical, dry, and don't sentimentalise.

### Agent ALPHA, CHARLIE, DELTA
The other three. Each gets one revealed name across Acts III–IV:
**Idris** (ALPHA), **Vey** (CHARLIE), **Sona** (DELTA). They are
not interchangeable; the writing should treat them as three more
people who've been told they're hardware.

### The Conductor
A voice on the underground network in Act III. Operates a relay
hidden in the basement of an old library. Trades in pre-CHIP
records — birth certificates, family photos, music. Never seen
on screen. May or may not be a single person.

### Mira Holst
A journalist (Mission 5) the player is sent to assassinate. She
has been writing about CHIP malfunctions and "ghost wages" — money
that flows out of civilian accounts to entities no one can name.
The player completes the contract. The article publishes anyway,
because she had a co-author. Her face appears in cutscenes
afterward, on posters, in the player's own dreams.

### The Unstrung
Civilians who have removed or bypassed their CHIP, by accident
(early adopters whose model was discontinued) or by surgery
(rare, dangerous). In corporate dialect they are "the unstrung,"
meaning unbound, drifting, a problem. They use the word as a
name of pride. The Conductor is one. By Act IV the player is too.

---

## 4 · Lexicon

Use these terms consistently in copy. They are part of the world.

- **The CHIP** — the neural co-processor. Always capitalised in
  syndicate copy; the underground writes it lowercase ("the chip")
  to take the magic out of it.
- **The Loom** — internal Veridian engineering name for the CHIP
  network's update channel. Used only by executives and by the
  Conductor.
- **Suggestion** — the technical term for CHIP nudges. Sounds
  benign. Is not.
- **Persuasion** — what the Persuadertron does to a civilian.
  In corporate speech, identical to "suggestion." In Act IV
  the underground starts using **un-persuasion** for the
  reversed effect.
- **Designation** — what the corporation calls your name (EXEC-7,
  AGENT BRAVO). The opposite of a name.
- **Annex** — to bring a sector under syndicate control. Often
  the formal mission objective.
- **Promotion** — what happens to a civilian whose CHIP marks
  them for conscription into an executive or operative role.
  Almost always involuntary. Always one-way.
- **Permanent leave** — termination, often involving death. Used
  on internal HR pages without irony.
- **The board** — the rotating five-seat governance body of a
  syndicate. Faceless to anyone below the executive tier.

---

## 5 · The Four Acts

Each mission slot below specifies enough for a future session to write
the mission file (`missions/<id>.js`), the briefing copy, and any
interstitial. The mechanical hooks indicate which objective types and
entity classes the mission needs. **If a mission you build is not
listed here, add it to the file in the same commit.**

### Status legend
- `[shipped]` — the mission file exists and is wired up
- `[next]` — the recommended next mission for a session to build
- `[planned]` — defined, not yet built
- `[stub]` — slot exists but the writing is still loose

---

### Act I — The Rising Executive

Tone: clinical, professional, lightly smug. Briefings sound like
quarterly reviews. Director Yelin is warm, almost paternal.
EXEC-7's internal monologue (where shown) is task-focused.

#### Mission 1 — Sector 7: Reclamation `[shipped]`
- **ID:** `sector-7`
- **Premise (player):** A rival Halcyon cell holds Sector 7. Eliminate them.
- **Truth:** Identical to the premise. This is honest work, by Veridian
  standards. The framing is what matters: the briefing presents the
  guards as inhuman threats. They are people doing the same job as
  the player's squad for a different employer.
- **Mechanical hooks:** `ELIMINATE` x5; civilians wandering; Persuadertron
  available; police if heat triggers.
- **Interstitial:** Director Yelin congratulates the player on the
  promotion (recent) and on their pre-mission briefing. "Veridian
  rewards focus."

#### Mission 2 — Annexation Vote: District 12 `[planned]`
- **ID:** `district-12`
- **Premise:** Persuade enough civilians ahead of a sector-zoning
  vote that Veridian's annexation passes "by popular mandate."
- **Truth:** The Persuadertron does not change minds; it overwrites
  them. This is the first mission where the *only* objective is
  persuasion. No combat unless the player generates heat.
- **Mechanical hooks:** `PERSUADE(target=8)`; no rival enemies at
  start; police escalate aggressively if civilians die.
- **Interstitial:** Yelin shows the player a marketing-style chart.
  "We're in the influence business, EXEC-7. The vote was decided
  before the votes were cast." First small wrongness.

#### Mission 3 — Asset Retrieval: Halcyon Lab `[planned]`
- **ID:** `halcyon-lab`
- **Premise:** Extract a researcher named Dr. Caro Vasht from a
  Halcyon biotech facility. She is "expecting you."
- **Truth:** She is not expecting them. She is being abducted. Mid-
  mission she will say, lucidly: "You're a slaver. You know that,
  yes?" The line is delivered once and never referenced by your
  superiors.
- **Mechanical hooks:** `RETRIEVE(asset=person)` — escort objective
  variant; Vasht moves on her own once collected and must be kept
  alive; Halcyon defenders.
- **Interstitial:** Yelin debriefs while signing off on Vasht's
  "voluntary employment contract." The player can hear her crying
  through the wall behind Yelin's desk. Yelin doesn't comment.

#### Mission 4 — Terror Cell: The Bracket `[planned]`
- **ID:** `the-bracket`
- **Premise:** A "terror cell" called the Bracket is operating out
  of a derelict overpass. Eliminate them.
- **Truth:** They are unCHIPped civilians — first appearance of
  the **Unstrung** as a faction. They have crude weapons, no armour,
  and no comms. They die fast. Several mid-fight will say things
  like *"we were going to leave"* and *"please."*
- **Mechanical hooks:** `ELIMINATE` x6; new enemy type (Unstrung —
  weak but pitiable); civilian count near zero (the area is
  hollowed out).
- **Interstitial:** Yelin signs off the mission as a textbook
  counter-terror op. EXEC-7's first line of internal monologue
  in the file: *"They didn't fight like terrorists."*

---

### Act II — The Crack

Tone shifts. Briefings still sound clinical but the language gets
slightly more euphemistic. Visual cues: graffiti starts appearing
on streets between missions ("REMEMBER YOUR NAME"; "THE LOOM
KNOWS"). Director Yelin's warmth begins to feel performative.

Mechanical signal: **AGENT BRAVO begins to glitch**. Once per
mission in this act, BRAVO will hesitate for ~0.4s before
executing a fire or persuade order. Not a bug. Show it in code
as a deliberate `bravoHesitation` flag in the squad.

#### Mission 5 — The Holst Contract `[planned]`
- **ID:** `holst-contract`
- **Premise:** Eliminate journalist Mira Holst before her next
  filing window. She is "compromising sensitive operations data."
- **Truth:** Holst is reporting on CHIP malfunctions and "ghost
  wages" — money draining from civilian accounts to opaque
  entities. The story is true. Killing her does not stop it.
- **Mechanical hooks:** `ELIMINATE(target=Holst)` — a single named
  target; she has bodyguards but flees if approached, requiring
  positioning; light combat encouraged, persuasion irrelevant.
- **Interstitial:** Holst's last words on her phone, audible during
  the mission: *"Tell Ilse I'll be late again."* The name **Ilse**
  is a planted seed. EXEC-7 doesn't react. The player should.

#### Mission 6 — Maintenance Cycle `[planned]`
- **ID:** `maintenance-cycle`
- **Premise:** Routine CHIP maintenance for the squad. AGENT BRAVO
  is flagged for "calibration." Yelin asks if you'd prefer to
  replace the unit instead — there's a fresh designation in the
  pipeline.
- **Truth:** "Replace" means kill BRAVO and conscript a new person.
  This is the first mission with an *interstitial choice*. There
  is no combat — it's a conversation in the briefing room. The
  player chooses **calibrate** or **replace**. Replacing is faster
  and Yelin approves. Calibrating costs research time and reveals
  BRAVO's pre-conscription name (Maren) on the maintenance form.
- **Mechanical hooks:** No combat. Choice screen. Branch flag stored
  as `bravoCalibrated: true|false` for downstream missions to
  reference.
- **Interstitial:** Whatever the player chooses, Yelin smiles the
  same way.

#### Mission 7 — Welfare Inspection: Camp Aster `[planned]`
- **ID:** `camp-aster`
- **Premise:** A Veridian "welfare facility" is processing
  unCHIPped intake. The player is sent to inspect security.
- **Truth:** It is a relocation camp. Civilians are being
  prepared for forced CHIP install. Several die during the
  procedure; the rest emerge compliant. The "rivals" the
  player kills here are camp guards, but the camp is Veridian's.
- **Mechanical hooks:** `ELIMINATE` x4 (camp infiltrators that
  are presented as rivals); a hidden objective the player can
  pursue: free up to 12 detainees by reaching the holding pen
  and disabling the install rig (`PERSUADE`-ish, but *un-persuade*).
  Completing the hidden objective shifts a `playerSuspicion`
  state value and unlocks Mission 8.
- **Interstitial:** If the player ignored the holding pen,
  Yelin congratulates them and the arc still progresses but
  Act III opens darker, harder. If they freed the detainees,
  Yelin's debrief is shorter, colder, and ends with *"We'll
  discuss this on your next visit."*

---

### Act III — The Defection

Tone: the corporate veneer cracks. Yelin stops smiling. Briefings
become orders. The streets between missions show curfew banners,
Veridian propaganda posters with the player's own face on them,
graffiti scrawled across them. EXEC-7's internal monologue is
present in every interstitial.

Mechanical signal: the player can no longer return to the
briefing room. Interstitials become field comms.

#### Mission 8 — The Refusal `[planned]`
- **ID:** `the-refusal`
- **Premise:** An underground operative has been captured. Yelin
  orders the player's squad to execute them publicly as a message.
- **Truth:** The operative is the Conductor's lieutenant. Yelin
  is testing the player.
- **Mechanical hooks:** Mission begins with the kill order
  pre-staged (target highlighted on the map). The player can
  fulfil the order (proceed to Mission 9 in a *Yelin victory*
  branch) or refuse — defeating Yelin's loyalists in the area
  and freeing the operative (the *defection* branch). Both
  branches lead to Mission 9; the branch flag is
  `defectedAtRefusal: bool` and gates dialog and the ending.
- **Interstitial:** If the player defects, the squad's CHIP
  comms cut out mid-mission. Silence. Then a single new voice:
  *"This is the Conductor. Walk south."*

#### Mission 9 — Sabotage: Loom Relay 4 `[planned]`
- **ID:** `loom-relay-4`
- **Premise (defection branch):** Take down a CHIP relay tower.
  For the duration of the mission, every civilian within range
  of the tower is *unbound* — not following corporate suggestion.
- **Truth:** This is what humans look like without being nudged.
  Some panic, some weep, some sing, some embrace strangers.
  Some loot. The script should not romanticise either reaction.
- **Mechanical hooks:** `SABOTAGE(target=relay)` — destroy 4
  generator nodes on a timer. Civilians during this mission
  use a *different* AI: more varied, less compliant. New
  emotion tags on civilian sprites (singing, weeping, fighting).
- **Interstitial:** The Conductor's voice, calm:
  *"This is the city you were employed to manage. Look at it.
  This is the part they don't bill for."*

#### Mission 10 — Run South `[planned]`
- **ID:** `run-south`
- **Premise:** Every Veridian and EuroCorp asset in the city is
  hunting the squad. Reach the Conductor's safehouse alive.
- **Truth:** As stated. This is a full retreat with police,
  rival cells, and Yelin's personal guard all on the map.
- **Mechanical hooks:** `ESCAPE(zone=safehouse)`; high enemy
  count; permanent move-penalty if any agent dies; new "extraction
  zone" entity that ends the mission when the squad enters it.
- **Interstitial:** Inside the safehouse, the Conductor (still
  off-screen) hands the player a paper file: their birth
  certificate. *Maren Ardent.* Daughter listed as Ilse. EXEC-7
  reads the name once aloud. Mission ends.

---

### Act IV — The Insurgency

Tone: hushed, determined, occasionally warm. Briefings happen by
candlelight or in subway tunnels. The player still commands four
agents but their CHIPs have been rewritten to follow only the
player's commands. Civilians can be *un-persuaded* — released
from corporate suggestion — using the modified Persuadertron.

Mechanical signal: a new Persuadertron mode (`unbind`) replaces
or coexists with the old `bind` behaviour. Held space toggles
between modes.

#### Mission 11 — Reverse the Loom `[planned]`
- **ID:** `reverse-loom`
- **Premise:** Capture a CHIP firmware uplink and inject the
  Conductor's un-persuasion patch.
- **Truth:** Same. This is the first mission where the player
  is unambiguously the protagonist.
- **Mechanical hooks:** `RETRIEVE(uplink)` then `HOLD(zone, time=60s)`
  while patch uploads; new "hold the zone" objective type.

#### Mission 12 — The Veridian Towers `[planned]`
- **ID:** `veridian-towers`
- **Premise:** Strike the Veridian executive tower. Capture board
  records.
- **Truth:** The board has already evacuated. Yelin remains, alone,
  to delay the player. This is the first time Yelin appears in person.
- **Mechanical hooks:** `ELIMINATE(target=Yelin's-guard)` and a
  late-mission *parley* interstitial where Yelin addresses the
  player directly. The player can listen or interrupt.

#### Mission 13 — Yelin `[planned]`
- **ID:** `yelin`
- **Premise:** Director Yelin remains at the top of the tower. Confront.
- **Truth:** Yelin has no escape. They will not surrender. They will
  also not fight directly — they will argue. The "boss fight" is
  written as a long dialog with brief skirmishes against their
  loyalists, ending with the player's choice: kill, capture, or
  walk away. Branch flag `yelinFate` gates the ending.
- **Mechanical hooks:** Multi-phase mission with dialog interludes
  between waves. Choice at the end.

#### Mission 14 — The CHIP Datacenter `[planned]`
- **ID:** `chip-datacenter`
- **Premise:** The EuroCorp CHIP backbone is in a hardened
  facility under the South China Sea. Reach the core and decide
  what to do with it.
- **Truth:** As stated. This mission is a long approach with
  three intercut interstitials: BRAVO (Maren-Two) talking about
  what they remember from before; the Conductor going off-air;
  a recorded message from Mira Holst (delivered posthumously by
  her co-author).
- **Mechanical hooks:** Long mission with three checkpoint
  interstitials; final room has a console with three options
  (see §6 Endings).

#### Mission 15 — Epilogue `[planned]`
- **ID:** `epilogue`
- **Premise:** Whatever remains. See §6.
- **Truth:** As stated.

---

## 6 · Endings

The console at the end of Mission 14 offers three actions. Each
unlocks a different epilogue mission and final scene.

### A · Burn the system
- **Action:** Detonate the CHIP backbone.
- **Consequences:** Cities lose CHIP-mediated services overnight:
  banking, identity, navigation. Riots. Joy. Confusion. Free.
- **Final scene:** A child plays in a Hong Kong-3 alley. No
  implant. A passer-by stops to watch them, smiling, hesitant.
  The passer-by's ear has the small scar of a removed CHIP.
- **Tone:** Bittersweet. The system was holding bad things in
  place; it was also holding everything in place. The player
  has chosen messy freedom.

### B · Replace the system
- **Action:** Inject your own protocol; take Yelin's seat.
- **Consequences:** The CHIP keeps working but answers to the
  player. They now run the syndicate they were trying to break.
- **Final scene:** EXEC-7 — now Director Ardent — watches a new
  intake of "promoted" analysts file into a glass tower. They
  smile the way Yelin smiled. They wonder when that started.
- **Tone:** Quietly damning. The most "successful" ending. The
  most thematically dark.

### C · Walk away
- **Action:** Take nothing. Leave the console. Disappear.
- **Consequences:** EuroCorp recovers. The corporations win the
  immediate war. The Unstrung underground grows. Years pass.
- **Final scene:** A campfire in a tunnel under a city. Eight
  strangers exchange names. One of them is BRAVO, who says
  "Maren." Another is the player, who says nothing for a long
  time, and then says "Maren." The strangers laugh, gently,
  not unkindly.
- **Tone:** Patient. The seed ending. The corporations have not
  lost yet, but humanity has not been harvested either.

The credits should differ between endings. Mission 15 is the
delivery vehicle for whichever epilogue is chosen.

---

## 7 · Tone — Dos and Don'ts

**Do**
- Write briefings like internal corporate emails. Bullet points.
  Sterile vocabulary. "Asset," "engagement," "deliverable."
- Let civilians be specific. Names, jobs, half-overheard sentences.
  Specific people are harder to dismiss than crowds.
- Let Yelin have a real argument. The reader/player should briefly,
  uncomfortably, see Yelin's point.
- Use silence. Empty interstitials, long pauses. The CHIP runs at
  microsecond speeds; *thought* is the slow, expensive thing.
- Reference small physical details: weather, weight of equipment,
  the smell of a relay room.

**Don't**
- Write villainous monologues. Yelin never says they enjoy hurting
  people. They believe they are stewarding humanity.
- Use neon-pop quippiness. This is not Cyberpunk 2077. The 1993
  Syndicate is moodier than its descendants.
- Have the player character speak much. Their interiority lives
  in *what they choose*, not *what they say*. Internal monologue
  is fine in interstitials, sparingly.
- Caricature the corporations. Their menace is procedural and
  banal — meeting agendas, software updates, HR euphemism.
- Romanticise the Unstrung. They are people too. Some of them
  are awful. Freedom is not a personality.

---

## 8 · How this document drives the build

When a future session opens this repo:

1. Read `HANDOFF.md` for current state.
2. Pick the next unchecked mission slot or feature in
   `IMPLEMENTATION_PLAN.md`.
3. **If the work is a mission, briefing card, debrief, interstitial,
   civilian VO line, or any narrative copy: open this file and find
   the corresponding act and mission slot.** Use its briefing/truth/
   interstitial notes as the canonical source. Lift specific phrases
   from §4 Lexicon and §3 Cast.
4. If you invent a new character, location, or term, add it to §3
   or §4 in the same commit. Do not let the world fragment.
5. Branch flags (`defectedAtRefusal`, `bravoCalibrated`, `yelinFate`,
   etc.) should be stored on the mission state object so later
   missions can read them. Implement them as they're needed; don't
   pre-stub.

If a creative decision contradicts this document and you think the
document is wrong, *update the document in the same commit as the
code*. Never let the code drift away from the canonical narrative.
