// The roster: four people, not four slots.
//
// Before this, agents reset every mission and death cost nothing. That is
// a mechanical problem — the original's cryovat and permanent losses are
// most of why a squad wipe mattered — but it is a *narrative* problem
// first. Act III is about ALPHA, BRAVO, CHARLIE and DELTA turning out to
// be Idris, Maren-Two, Vey and Sona, and the player cannot be asked to
// care about that if the game itself treats them as interchangeable.
//
// So: operatives persist across the campaign, accumulate deployments and
// cybernetics, and can be lost for good. Losing one is not a game over —
// the mesh finds somebody else, and the somebody else does not have a
// name yet, which is the point.
//
// Pure and serialisable, like `campaign.js`. No DOM, no storage.

/** The four the game opens with. Names are revealed across Acts III–IV. */
const FOUNDING = [
  { id: 'alpha', designation: 'ALPHA', name: 'IDRIS' },
  { id: 'bravo', designation: 'BRAVO', name: 'MAREN-TWO' },
  { id: 'charlie', designation: 'CHARLIE', name: 'VEY' },
  { id: 'delta', designation: 'DELTA', name: 'SONA' },
];

/**
 * Replacements, in the order the mesh finds them. No designation until
 * they are deployed and no name until they have survived something —
 * `nameFor()` handles that, and it is deliberately a little bleak.
 */
const RECRUITS = [
  { id: 'r1', name: 'HALE' },
  { id: 'r2', name: 'OKONJO' },
  { id: 'r3', name: 'TESS' },
  { id: 'r4', name: 'ABIODUN' },
  { id: 'r5', name: 'PARK' },
  { id: 'r6', name: 'VANTHA' },
];

export const SQUAD_SIZE = 4;

/**
 * Cybernetics, bought with research and fitted between missions.
 *
 * Deliberately small and legible: each one is a single number the player
 * can feel in the next firefight. No stacking trees, no percentages of
 * percentages. `apply(agent)` is the whole implementation.
 */
export const CYBERNETICS = Object.freeze({
  LEGS: {
    id: 'LEGS',
    name: 'LEG ACTUATORS',
    cost: 2,
    blurb: '+18% movement. Everything about this game is arriving first.',
    apply: (a) => { a.baseSpeed *= 1.18; a.speed = a.baseSpeed; },
  },
  ARMOUR: {
    id: 'ARMOUR',
    name: 'SUBDERMAL WEAVE',
    cost: 3,
    blurb: '+40 health. The difference between a bad corner and a funeral.',
    apply: (a) => { a.maxHealth += 40; a.health = a.maxHealth; },
  },
  OPTICS: {
    id: 'OPTICS',
    name: 'TARGETING OPTICS',
    cost: 3,
    blurb: '+20% weapon range. Shoot from where they are not looking.',
    apply: (a) => { a.range *= 1.2; },
  },
  REFLEX: {
    id: 'REFLEX',
    name: 'REFLEX GOVERNOR',
    cost: 4,
    blurb: '+15% fire rate, and no order hesitation, ever.',
    apply: (a) => {
      a.fireRate *= 1.15;
      a.hesitation = 0;
      // A governor is the in-fiction fix for what is wrong with BRAVO.
      // It does not fix what is wrong with BRAVO.
      a.hesitationImmune = true;
    },
  },
});

export const CYBERNETIC_IDS = Object.keys(CYBERNETICS);

/** Research earned for finishing a mission, before any bonuses. */
export const RESEARCH_PER_MISSION = 2;
/** Extra for bringing everyone home. Losses are their own punishment. */
export const RESEARCH_FULL_SQUAD = 1;
/** Extra for a run that killed no civilians. The game notices restraint. */
export const RESEARCH_CLEAN = 1;

function operative(spec, slot) {
  return {
    id: spec.id,
    designation: spec.designation ?? null,
    name: spec.name,
    slot,
    /** Missions this operative has finished alive. */
    deployments: 0,
    kills: 0,
    /** Cybernetic ids fitted. Order is purchase order. */
    implants: [],
    /** Set once and never cleared. There is no reviving anybody. */
    lost: false,
    /** Mission id they were lost on, for the roster panel. */
    lostOn: null,
  };
}

export function newRoster() {
  return {
    operatives: FOUNDING.map((s, i) => operative(s, i)),
    /** Recruits not yet drawn on. */
    pool: RECRUITS.map(s => s.id),
    research: 0,
  };
}

export function migrateRoster(raw) {
  const fresh = newRoster();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.operatives)) return fresh;

  const known = new Map([...FOUNDING, ...RECRUITS].map(s => [s.id, s]));
  const operatives = [];
  for (const o of raw.operatives) {
    const spec = known.get(o?.id);
    if (!spec) continue;                       // a save from a future version
    const rebuilt = operative(spec, Number.isInteger(o.slot) ? o.slot : operatives.length);
    rebuilt.designation = typeof o.designation === 'string' ? o.designation : rebuilt.designation;
    rebuilt.deployments = Number.isFinite(o.deployments) ? o.deployments : 0;
    rebuilt.kills = Number.isFinite(o.kills) ? o.kills : 0;
    rebuilt.implants = Array.isArray(o.implants)
      ? o.implants.filter(id => CYBERNETICS[id])  // drop implants we retired
      : [];
    rebuilt.lost = !!o.lost;
    rebuilt.lostOn = typeof o.lostOn === 'string' ? o.lostOn : null;
    operatives.push(rebuilt);
  }
  if (!operatives.length) return fresh;

  const used = new Set(operatives.map(o => o.id));
  return {
    operatives,
    pool: RECRUITS.map(s => s.id).filter(id => !used.has(id)),
    research: Number.isFinite(raw.research) && raw.research >= 0 ? Math.floor(raw.research) : 0,
  };
}

/** The four who deploy, in slot order. */
export function deployed(roster) {
  return [...roster.operatives]
    .filter(o => !o.lost)
    .sort((a, b) => a.slot - b.slot)
    .slice(0, SQUAD_SIZE);
}

export function byId(roster, id) {
  return roster.operatives.find(o => o.id === id) ?? null;
}

/** Is a named operative still available? Story beats ask this. */
export function isAlive(roster, id) {
  const o = byId(roster, id);
  return !!o && !o.lost;
}

/**
 * Mark the dead as lost and pull replacements into their slots.
 *
 * `deadSlots` is which of the four did not come back. Returns the
 * operatives lost and the recruits drawn, so the debrief can say so —
 * a permanent loss that scrolls past in a stats line is not a
 * consequence, it is a footnote.
 */
export function recordDeployment(roster, missionId, { deadSlots = [], killsBySlot = {} } = {}) {
  const squad = deployed(roster);
  const lost = [];
  const drawn = [];

  for (const o of squad) {
    o.kills += killsBySlot[o.slot] ?? 0;
    if (deadSlots.includes(o.slot)) {
      o.lost = true;
      o.lostOn = missionId;
      lost.push(o);
    } else {
      o.deployments += 1;
    }
  }

  // Backfill each empty slot, keeping the designation the slot carries —
  // the squad is still ALPHA through DELTA on the radio, because the
  // radio does not care who is inside the suit. That is the horror of it.
  const known = new Map(RECRUITS.map(s => [s.id, s]));
  for (const gone of lost) {
    const id = roster.pool.shift();
    if (!id) continue;                       // nobody left; the squad runs short
    const recruit = operative(known.get(id), gone.slot);
    recruit.designation = gone.designation;
    roster.operatives.push(recruit);
    drawn.push(recruit);
  }

  return { lost, drawn };
}

/** Research earned by a finished mission. */
export function researchFor({ squadAlive = SQUAD_SIZE, civilianDeaths = 0 } = {}) {
  let n = RESEARCH_PER_MISSION;
  if (squadAlive >= SQUAD_SIZE) n += RESEARCH_FULL_SQUAD;
  if (civilianDeaths === 0) n += RESEARCH_CLEAN;
  return n;
}

export function canFit(roster, operativeId, cyberId) {
  const o = byId(roster, operativeId);
  const cyber = CYBERNETICS[cyberId];
  if (!o || o.lost || !cyber) return false;
  if (o.implants.includes(cyberId)) return false;
  return roster.research >= cyber.cost;
}

/** Why the cryovat will not do it, in the player's language. */
export function fitBlocker(roster, operativeId, cyberId) {
  const o = byId(roster, operativeId);
  const cyber = CYBERNETICS[cyberId];
  if (!o || !cyber) return 'UNKNOWN';
  if (o.lost) return 'OPERATIVE LOST';
  if (o.implants.includes(cyberId)) return 'ALREADY FITTED';
  if (roster.research < cyber.cost) return `NEEDS ${cyber.cost} RESEARCH`;
  return null;
}

export function fit(roster, operativeId, cyberId) {
  if (!canFit(roster, operativeId, cyberId)) return false;
  byId(roster, operativeId).implants.push(cyberId);
  roster.research -= CYBERNETICS[cyberId].cost;
  return true;
}

/**
 * Push an operative's record onto the `Agent` the sim actually simulates.
 *
 * This is the only place the two representations meet: the roster is a
 * persistent record, the Agent is a body in a city, and the sim must not
 * know or care that a save file exists.
 */
export function applyToAgent(agent, op) {
  if (!op) return agent;
  agent.operativeId = op.id;
  agent.slot = op.slot;
  if (op.designation) agent.name = op.designation;
  agent.trueName = op.name;
  agent.deployments = op.deployments;
  for (const id of op.implants) CYBERNETICS[id]?.apply(agent);
  return agent;
}

export { FOUNDING, RECRUITS };
