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

/**
 * The four syndicates that are not you.
 *
 * Every sector you have not taken belongs to one of them. That is the
 * premise — five syndicates hold the world's compute and the map is the
 * argument between them — and until now the strategic layer was the
 * player against a mood meter, which is not the same game.
 */
export const RIVALS = Object.freeze({
  amazon: {
    id: 'amazon', name: 'AMAZON', doctrine: 'BROAD',
    note: 'Leans on everything you hold at once. There is no sector you can ignore.',
  },
  google: {
    id: 'google', name: 'GOOGLE', doctrine: 'RICHEST',
    note: 'Goes for whatever pays you most. Your best sector is the one at risk.',
  },
  spacex: {
    id: 'spacex', name: 'SPACEX', doctrine: 'FLAT',
    note: 'Pushes from orbit and does not care how content the street is.',
  },
  anthropic: {
    id: 'anthropic', name: 'ANTHROPIC', doctrine: 'UNREST',
    note: 'Takes no ground. Talks to your sectors, and they get harder to hold.',
  },
});

export const RIVAL_IDS = Object.keys(RIVALS);

/** Contest points at which a rival takes a sector off you. */
export const SEIZE_AT = 100;
/**
 * How hard a rival leans on a sector per deployment, before anything else.
 * Small — the whole point is that pressure only becomes dangerous where
 * the sector is already unhappy.
 */
export const BASE_PRESSURE = 20;
/** Extra pressure per sector the leading rival already holds. */
export const PRESSURE_PER_SECTOR = 0.6;
/**
 * What every rival is worth before the Austin map is counted at all.
 *
 * Austin is one city and Amazon is not only in Austin. Without this the
 * rivals evaporate the moment the player takes the last sector, and the
 * strategic layer quietly reverts to the player against a mood meter for
 * exactly the run most people will have. With it, holding the whole map
 * is possible and still costs attention: a content sector is nearly
 * immune, a straining one gets taken off you by somebody with a logo.
 */
export const OFFMAP_STRENGTH = 3;
/** Contest bled off per deployment by a sector that is content. */
export const CONTEST_DECAY = 4;

/**
 * Per-doctrine weights.
 *
 * `GAP_ANALYSIS.md` §4 is explicit that four factions which play
 * identically is a flaw to inherit deliberately or not at all — the
 * original's were "largely cosmetic". So each of these has to change what
 * the *player* does about it, not just what the debrief says:
 *
 * - BROAD   (Amazon)    pushes every sector you hold at once, so there is
 *                       nowhere safe to leave unattended.
 * - RICHEST (Google)    pushes only your highest-paying sector, so the
 *                       thing you most want to squeeze is the thing you
 *                       most have to ease off.
 * - FLAT    (SpaceX)    ignores half the unrest scaling, so calming a
 *                       sector down is not a complete answer to them.
 * - UNREST  (Anthropic) takes no ground at all and raises unrest instead,
 *                       which pushes sectors toward revolt rather than
 *                       seizure. The counter is the ration, not the gun.
 *
 * All four are divided down from the single-rival numbers because four of
 * them now push every deployment instead of one.
 */
export const DOCTRINE = Object.freeze({
  BROAD: { share: 0.5, targets: 'all', floor: 0 },
  RICHEST: { share: 1.1, targets: 'richest', floor: 0 },
  // SpaceX's floor is deliberately tuned to sit *just under* what a
  // content sector shrugs off. A quiet sector stays effectively immune —
  // that invariant is load-bearing, or rationing lightly stops being a
  // complete defence and the map becomes a treadmill. What SpaceX does is
  // eat the whole margin, so a calm sector under their attention has no
  // buffer left and the first bad ration tips it.
  FLAT: { share: 0.3, targets: 'weakest', floor: 0.45 },
  UNREST: { share: 0, targets: 'all', floor: 0, unrestPerDeployment: 2.1 },
});

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
  { id: 'sector-7', name: 'SECTOR 7', detail: 'Edge-Compute Row', yield: 3, from: 'sector-7', rival: 'amazon' },
  { id: 'district-12', name: 'DISTRICT 12', detail: 'Residential Metering', yield: 4, from: 'district-12', rival: 'google' },
  { id: 'sable', name: 'SABLE CAMPUS', detail: 'Anthropic Research', yield: 2, from: 'sable-campus', rival: 'anthropic' },
  { id: 'sub-19', name: 'SUB-SECTOR 19', detail: 'Decommissioned Overpass', yield: 1, from: 'the-bracket', rival: 'amazon' },
  { id: 'riverside', name: 'RIVERSIDE', detail: 'Press Row', yield: 2, from: 'okafor-contract', rival: 'google' },
  { id: 'node-7', name: 'NODE 7', detail: 'Welfare Provisioning', yield: 3, from: 'welfare-node-7', rival: 'spacex' },
  { id: 'sector-4', name: 'SECTOR 4', detail: 'Curfew Enforcement', yield: 3, from: 'the-refusal', rival: 'spacex' },
  { id: 'relay-4', name: 'RELAY 4', detail: 'Gradient Distribution', yield: 5, from: 'gradient-relay-4', rival: 'google' },
  { id: 'uplink-9', name: 'UPLINK 9', detail: 'Gradient Ingress', yield: 4, from: 'reverse-the-gradient', rival: 'anthropic' },
  { id: 'campus', name: 'OPENAI CAMPUS', detail: 'Board Level', yield: 6, from: 'the-tower', rival: 'amazon' },
]);

const BY_MISSION = new Map(SECTORS.map(s => [s.from, s]));
const BY_ID = new Map(SECTORS.map(s => [s.id, s]));

export function sectorById(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * Mission ids for the deployments the map generates.
 *
 * A sector is taken by an authored mission once. Getting it *back* is a
 * different deployment against different people, and it needs its own id
 * so the campaign can tell the two apart — a retake is not a replay, and
 * it must not read as one on the record. The convention lives here rather
 * than in `retake.js` because it is a fact about sectors, and putting it
 * there would make the two modules import each other.
 */
export const RETAKE_PREFIX = 'retake:';

export function retakeId(sectorId) {
  return `${RETAKE_PREFIX}${sectorId}`;
}

export function isRetakeId(id) {
  return typeof id === 'string' && id.startsWith(RETAKE_PREFIX);
}

export function sectorOfRetake(id) {
  return isRetakeId(id) ? sectorById(id.slice(RETAKE_PREFIX.length)) : null;
}

/**
 * Which sector a mission id takes. Retakes resolve here too, which is what
 * makes `claim()` and `settle()` work for them without knowing they exist.
 */
export function sectorFor(missionId) {
  return sectorOfRetake(missionId) ?? BY_MISSION.get(missionId) ?? null;
}

export function newTerritory() {
  const held = {};
  for (const s of SECTORS) {
    held[s.id] = {
      held: false,
      throttle: 'PLUS',
      unrest: 0,
      lostTo: null,
      /** Who has it while you do not. You start with none of the map. */
      owner: s.rival,
      /** How far along a rival's push on this sector is, 0–100. */
      contest: 0,
      /** Which rival is pushing, for the panel and the debrief. */
      contestedBy: null,
    };
  }
  return held;
}

export function migrateTerritory(raw) {
  const fresh = newTerritory();
  if (!raw || typeof raw !== 'object') return fresh;
  for (const s of SECTORS) {
    const r = raw[s.id];
    if (!r || typeof r !== 'object') continue;
    const lostTo = typeof r.lostTo === 'string' ? r.lostTo : null;
    // A sector that has just revolted is *deliberately* ownerless: nobody
    // gets it, and its own syndicate walks back in on the next deployment.
    // Without this, the owner fallback below hands it straight to that
    // syndicate on load, and any player who saves between deployments —
    // which is every player, the save is written on every debrief — never
    // sees the beat at all.
    const revolted = lostTo === 'revolt' && !r.owner;
    fresh[s.id] = {
      held: !!r.held,
      // A throttle id we retired must not survive as a dangling string —
      // it would read as PLUS in the UI and yield nothing in the maths.
      throttle: THROTTLE[r.throttle] ? r.throttle : 'PLUS',
      unrest: Number.isFinite(r.unrest) ? Math.max(0, Math.min(REVOLT_AT, r.unrest)) : 0,
      lostTo,
      // Same rule for an owner: a syndicate we never heard of falls back
      // to the sector's own rival rather than leaving the map ownerless.
      owner: (r.held || revolted) ? null : (RIVALS[r.owner] ? r.owner : s.rival),
      contest: Number.isFinite(r.contest) ? Math.max(0, Math.min(SEIZE_AT, r.contest)) : 0,
      contestedBy: RIVALS[r.contestedBy] ? r.contestedBy : null,
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
  // Taking it resets the push. Whoever was leaning on it has been made to
  // stop — that is what the deployment was.
  t.owner = null;
  t.contest = 0;
  t.contestedBy = null;
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

/** How many sectors each rival is sitting on. */
export function rivalStrength(territory) {
  const out = {};
  for (const id of RIVAL_IDS) out[id] = 0;
  for (const s of SECTORS) {
    const owner = territory[s.id]?.owner;
    if (owner && out[owner] !== undefined) out[owner] += 1;
  }
  return out;
}

/** Whoever is currently winning the argument that is not you. */
export function leadingRival(territory) {
  const strength = rivalStrength(territory);
  let best = null;
  for (const id of RIVAL_IDS) {
    if (!best || strength[id] > strength[best]) best = id;
  }
  // Never null: somebody is always the biggest of the four, and all four
  // exist whether or not they currently hold a block of Austin.
  return best;
}

/**
 * How much of Austin you need before a rival bothers picking a favourite.
 *
 * Below this the concentrated doctrines sit out entirely. Otherwise every
 * one of them converges on your single opening sector — "richest" and
 * "weakest" are the same block when you only hold one — and the early
 * game becomes four syndicates piling onto the only thing you own, which
 * makes easing the ration off stop working exactly when a new player is
 * learning that it should.
 */
export const PORTFOLIO_MIN = 3;

/** Whichever sector a doctrine has decided to lean on, or null for all. */
function doctrineTarget(territory, doctrine) {
  const held = heldSectors(territory);
  if (!held.length) return null;
  if (doctrine.targets === 'all') return null;
  if (held.length < PORTFOLIO_MIN) return NOBODY;
  if (doctrine.targets === 'richest') {
    return held.reduce((best, s) =>
      (yieldOf(s, territory[s.id]) > yieldOf(best, territory[best.id]) ? s : best));
  }
  // 'weakest': whatever is closest to coming off you already.
  return held.reduce((best, s) =>
    (territory[s.id].unrest > territory[best.id].unrest ? s : best));
}

/**
 * How hard one rival leans on one of your sectors this deployment.
 *
 * Scaled by the sector's own unrest, which is the whole design: rivals do
 * not conjure an opening, they walk into one you made. A quiet sector is
 * effectively immune and a straining one is halfway gone already, so
 * squeezing is not one risk with two names — it is the *same* risk,
 * arriving by whichever door gets there first.
 *
 * `floor` is the one exception, and it belongs to exactly one syndicate:
 * SpaceX pushes from orbit and is only half-interested in how the street
 * feels, which is why calming a sector down is not a complete answer to
 * them.
 */
/** Sentinel for "this doctrine is not engaging at all right now". */
const NOBODY = Object.freeze({ id: '__none__' });

export function pressureFrom(territory, rivalId, sectorId) {
  const t = territory[sectorId];
  if (!t?.held) return 0;
  const rival = RIVALS[rivalId];
  if (!rival) return 0;
  const doctrine = DOCTRINE[rival.doctrine];
  if (!doctrine.share) return 0;

  const target = doctrineTarget(territory, doctrine);
  if (target && target.id !== sectorId) return 0;

  const strength = rivalStrength(territory)[rivalId] + OFFMAP_STRENGTH;
  const opening = doctrine.floor + (1 - doctrine.floor) * (t.unrest / REVOLT_AT);
  return (BASE_PRESSURE + strength * PRESSURE_PER_SECTOR) * opening * doctrine.share;
}

/** Everything pushing on a sector, and whoever is pushing hardest. */
export function pressureOn(territory, sectorId) {
  let total = 0;
  for (const id of RIVAL_IDS) total += pressureFrom(territory, id, sectorId);
  return total;
}

export function hardestPusher(territory, sectorId) {
  let best = null;
  let bestPush = 0;
  for (const id of RIVAL_IDS) {
    const push = pressureFrom(territory, id, sectorId);
    if (push > bestPush) { bestPush = push; best = id; }
  }
  return best;
}

/** Extra unrest applied by doctrines that work on people, not ground. */
export function agitationOn(territory, sectorId) {
  if (!territory[sectorId]?.held) return 0;
  let total = 0;
  for (const id of RIVAL_IDS) {
    const doctrine = DOCTRINE[RIVALS[id].doctrine];
    if (!doctrine.unrestPerDeployment) continue;
    const strength = rivalStrength(territory)[id] + OFFMAP_STRENGTH;
    // Scaled to a *nudge*, not a second ration. Anthropic making every
    // sector 50% harder to hold would drown the other three doctrines —
    // everything would revolt before anyone could take ground, and the
    // seizure route would stop existing.
    total += doctrine.unrestPerDeployment * (strength / (SECTORS.length + OFFMAP_STRENGTH));
  }
  return total;
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
  const seized = [];
  const contested = [];
  const moved = [];
  const agitated = [];

  // A sector nobody holds does not stay nobody's. Its native syndicate
  // walks back in, which is what keeps the rivals in the game after the
  // player has taken the whole map — otherwise they fade out exactly when
  // the strategic layer gets interesting, and the map goes back to being
  // the player against a mood meter.
  for (const s of SECTORS) {
    const t = territory[s.id];
    if (t.held || t.owner || s.id === fresh) continue;
    t.owner = s.rival;
    t.lostTo = null;
    moved.push({ sector: s, rival: RIVALS[s.rival] });
  }

  for (const s of SECTORS) {
    const t = territory[s.id];
    if (!t.held || s.id === fresh) continue;

    // Anthropic takes no ground. It talks to your sectors, and they get
    // harder to hold — which pushes them toward revolt rather than
    // seizure, so the counter is the ration and not the gun.
    const agitation = agitationOn(territory, s.id);
    if (agitation > 0) agitated.push(s);
    t.unrest = Math.max(0, t.unrest + THROTTLE[t.throttle].unrest + agitation);

    if (t.unrest >= REVOLT_AT) {
      // The people threw you out. Nobody else gets it — a sector that has
      // just done this is in no mood to be administered by Amazon either.
      t.held = false;
      t.unrest = 0;
      t.contest = 0;
      t.contestedBy = null;
      t.owner = null;
      t.lostTo = 'revolt';
      revolted.push(s);
      continue;
    }

    // Rival pressure, through the opening your own ration made, net of
    // what a sector shrugs off on its own.
    const net = pressureOn(territory, s.id) - CONTEST_DECAY;
    t.contest = Math.max(0, Math.min(SEIZE_AT, t.contest + net));
    if (t.contest === 0) t.contestedBy = null;
    else if (net > 0) t.contestedBy = hardestPusher(territory, s.id);

    if (t.contest >= SEIZE_AT) {
      t.held = false;
      t.unrest = 0;
      t.contest = 0;
      t.owner = t.contestedBy;
      t.lostTo = t.contestedBy;
      t.contestedBy = null;
      seized.push({ sector: s, rival: RIVALS[t.owner] });
      continue;
    }

    if (t.unrest >= UNREST_WARNING) straining.push(s);
    if (t.contest >= SEIZE_AT * 0.5) contested.push({ sector: s, rival: RIVALS[t.contestedBy] });
  }

  return { claimed, paid, revolted, straining, seized, contested, moved, agitated };
}

/** How a sector is doing, in the player's language. */
export function statusOf(state) {
  if (!state?.held) {
    if (state?.lostTo === 'revolt') return 'REVOLTED';
    return RIVALS[state?.owner]?.name ?? 'UNHELD';
  }
  // Contest is reported ahead of unrest, because it is the one the player
  // can do something about by deploying rather than by waiting.
  if (state.contest >= SEIZE_AT * 0.5) return 'CONTESTED';
  if (state.unrest >= UNREST_WARNING) return 'STRAINING';
  if (state.unrest >= UNREST_WARNING / 2) return 'RESTLESS';
  return 'QUIET';
}
