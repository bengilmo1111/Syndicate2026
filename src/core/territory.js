// The strategic layer: what you hold, how hard you squeeze it, and what
// that costs you.
//
// The gap analysis is precise about why this is worth building and what
// shape to steal. The original's tax mechanic — raise tax, fund research,
// raise rebellion risk — is *the same argument as SURGE*, one scale up.
// SURGE takes cycles off the civilians standing nearest the squad for a
// tactical advantage and climbs heat the whole time. This takes cycles
// off a whole sector for a strategic advantage and climbs unrest the
// whole time. Same sentence, different font size.
//
// That is the reason this layer exists at all. A world map that were only
// an income spreadsheet would be padding; a world map that makes the
// player keep answering the game's central question, in a spreadsheet
// idiom, is the strategic half of the thing.
//
// Pure and serialisable, like `campaign.js` and `roster.js`. No DOM.

/**
 * Throttle tiers, from the ration the sector is held at.
 *
 * The names are the Instance tiers from NARRATIVE §1 read as a *ceiling*:
 * FRONTIER means nobody in the sector is capped and you take almost
 * nothing off them; FREE means everyone is capped to the floor and you
 * take nearly all of it.
 */
export const THROTTLE = Object.freeze({
  FRONTIER: {
    id: 'FRONTIER', name: 'FRONTIER', label: 'UNCAPPED',
    yield: 0.03, unrest: -4,
    note: 'You take almost nothing. The sector quietly gets better at things.',
  },
  PRO: {
    id: 'PRO', name: 'PRO', label: 'LIGHT',
    yield: 0.11, unrest: -0.8,
    note: 'A ration nobody writes to their representative about.',
  },
  PLUS: {
    id: 'PLUS', name: 'PLUS', label: 'STANDARD',
    yield: 0.22, unrest: 4.5,
    note: 'The rate the Board costed. Most of Austin lives here.',
  },
  FREE: {
    id: 'FREE', name: 'FREE', label: 'HARD',
    yield: 0.4, unrest: 11,
    note: 'Everyone at the floor. It pays for itself and it does not hold.',
  },
});

/**
 * `yield` above is a *multiplier* on a sector's rating, not a rate the
 * player reads. It is small on purpose: the sector ratings below are
 * meant to say how valuable a sector is relative to the others, and this
 * number is where the whole map's contribution to the economy is tuned.
 * Fully kitting the squad costs 144 research and a campaign must not pay
 * that, or the cryovat stops being a question about who matters.
 */

/** Ordered loosest → tightest, which is the order the UI steps through. */
export const THROTTLE_ORDER = ['FRONTIER', 'PRO', 'PLUS', 'FREE'];

/** Unrest at which a sector stops being yours. */
export const REVOLT_AT = 100;
/** Unrest above this is worth a warning before it becomes a loss. */
export const UNREST_WARNING = 70;
/** Where a sector's unrest sits when you take it. Nobody is pleased. */
export const UNREST_ON_CLAIM = 22;

/**
 * The sectors of Austin, and what each is worth.
 *
 * `yield` is research per closed deployment at PLUS. Tied to the mission
 * that takes it, so holding the map is the campaign's own shape rather
 * than a separate board bolted on beside it.
 *
 * Tuned against the campaign's actual length. Holding everything at PLUS
 * roughly doubles what a deployment pays by the back half — enough that
 * the map matters, not so much that the cryovat stops being a choice —
 * and a sector claimed in Act I is visibly straining by Act IV. Squeeze
 * one to FREE and it hands itself back in about eight deployments, which
 * is inside a single playthrough on purpose.
 */
export const SECTORS = Object.freeze([
  { id: 'sector-7', name: 'SECTOR 7', detail: 'Edge-Compute Row', yield: 3, from: 'sector-7' },
  { id: 'district-12', name: 'DISTRICT 12', detail: 'Residential Metering', yield: 4, from: 'district-12' },
  { id: 'sable', name: 'SABLE CAMPUS', detail: 'Anthropic Research', yield: 2, from: 'sable-campus' },
  { id: 'sub-19', name: 'SUB-SECTOR 19', detail: 'Decommissioned Overpass', yield: 1, from: 'the-bracket' },
  { id: 'riverside', name: 'RIVERSIDE', detail: 'Press Row', yield: 2, from: 'okafor-contract' },
  { id: 'node-7', name: 'NODE 7', detail: 'Welfare Provisioning', yield: 3, from: 'welfare-node-7' },
  { id: 'sector-4', name: 'SECTOR 4', detail: 'Curfew Enforcement', yield: 3, from: 'the-refusal' },
  { id: 'relay-4', name: 'RELAY 4', detail: 'Gradient Distribution', yield: 5, from: 'gradient-relay-4' },
  { id: 'uplink-9', name: 'UPLINK 9', detail: 'Gradient Ingress', yield: 4, from: 'reverse-the-gradient' },
  { id: 'campus', name: 'OPENAI CAMPUS', detail: 'Board Level', yield: 6, from: 'the-tower' },
]);

const BY_MISSION = new Map(SECTORS.map(s => [s.from, s]));
const BY_ID = new Map(SECTORS.map(s => [s.id, s]));

export function sectorFor(missionId) {
  return BY_MISSION.get(missionId) ?? null;
}

export function sectorById(id) {
  return BY_ID.get(id) ?? null;
}

export function newTerritory() {
  const held = {};
  for (const s of SECTORS) {
    held[s.id] = { held: false, throttle: 'PLUS', unrest: 0, lostTo: null };
  }
  return held;
}

export function migrateTerritory(raw) {
  const fresh = newTerritory();
  if (!raw || typeof raw !== 'object') return fresh;
  for (const s of SECTORS) {
    const r = raw[s.id];
    if (!r || typeof r !== 'object') continue;
    fresh[s.id] = {
      held: !!r.held,
      // A throttle id we retired must not survive as a dangling string —
      // it would read as PLUS in the UI and yield nothing in the maths.
      throttle: THROTTLE[r.throttle] ? r.throttle : 'PLUS',
      unrest: Number.isFinite(r.unrest) ? Math.max(0, Math.min(REVOLT_AT, r.unrest)) : 0,
      lostTo: typeof r.lostTo === 'string' ? r.lostTo : null,
    };
  }
  return fresh;
}

export function heldSectors(territory) {
  return SECTORS.filter(s => territory[s.id]?.held);
}

/** Take a sector. Idempotent — re-running a mission does not re-anger it. */
export function claim(territory, missionId) {
  const sector = sectorFor(missionId);
  if (!sector) return null;
  const t = territory[sector.id];
  if (t.held) return null;
  t.held = true;
  t.unrest = UNREST_ON_CLAIM;
  t.lostTo = null;
  return sector;
}

export function setThrottle(territory, sectorId, throttleId) {
  const t = territory[sectorId];
  if (!t || !t.held || !THROTTLE[throttleId]) return false;
  t.throttle = throttleId;
  return true;
}

export function cycleThrottle(territory, sectorId) {
  const t = territory[sectorId];
  if (!t || !t.held) return null;
  const i = THROTTLE_ORDER.indexOf(t.throttle);
  t.throttle = THROTTLE_ORDER[(i + 1) % THROTTLE_ORDER.length];
  return t.throttle;
}

/** Compute a single sector pays per closed deployment, at its current ration. */
export function yieldOf(sector, state) {
  if (!state?.held) return 0;
  return sector.yield * THROTTLE[state.throttle].yield;
}

/** Everything the map pays, rounded down — you cannot bank a third of a unit. */
export function income(territory) {
  let total = 0;
  for (const s of SECTORS) total += yieldOf(s, territory[s.id]);
  return Math.floor(total);
}

/**
 * Close out a deployment at the strategic scale.
 *
 * Pays the income, moves unrest by the ration each sector is held at, and
 * hands back any sector that went over. Returns what happened so the
 * debrief can say it in words rather than leaving the player to notice a
 * number changed.
 */
export function settle(territory, { missionId = null } = {}) {
  const claimed = missionId ? claim(territory, missionId) : null;

  // A sector taken *during* this deployment neither pays for it nor gets
  // angrier about it. You took it this mission; it starts where claiming
  // leaves it, and the meter runs from the next one.
  const fresh = claimed?.id ?? null;
  let paid = 0;
  for (const s of SECTORS) {
    if (s.id !== fresh) paid += yieldOf(s, territory[s.id]);
  }
  paid = Math.floor(paid);

  const revolted = [];
  const straining = [];

  for (const s of SECTORS) {
    const t = territory[s.id];
    if (!t.held || s.id === fresh) continue;
    t.unrest = Math.max(0, t.unrest + THROTTLE[t.throttle].unrest);
    if (t.unrest >= REVOLT_AT) {
      t.held = false;
      t.unrest = 0;
      t.lostTo = 'revolt';
      revolted.push(s);
    } else if (t.unrest >= UNREST_WARNING) {
      straining.push(s);
    }
  }

  return { claimed, paid, revolted, straining };
}

/** How a sector is doing, in the player's language. */
export function statusOf(state) {
  if (!state?.held) return state?.lostTo === 'revolt' ? 'REVOLTED' : 'UNHELD';
  if (state.unrest >= UNREST_WARNING) return 'STRAINING';
  if (state.unrest >= UNREST_WARNING / 2) return 'RESTLESS';
  return 'QUIET';
}
