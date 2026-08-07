// Hostile decision-making.
//
// We built directional cover and, until this file existed, only the player
// benefited from it — the AI walked into the open and stood there, which
// made the best tactical system in the game half-idle. This is
// `GAP_ANALYSIS.md` gap 7, and it was also a criticism of the 1996
// original ("enemy AI has limited tactics"). Inheriting the setting is
// the point; inheriting the flaw is not.
//
// The model is deliberately small. Hostiles evaluate a handful of nearby
// positions and move to the best one, where "best" is cover against
// whoever is shooting at them, weighed against staying in range. That is
// enough to produce flanking, corner-holding, and repositioning when a
// collapse takes their cover away — without a planner, a behaviour tree,
// or anything that would need its own debugger.

import { dist } from './math.js';
import { coverAgainst, hasLineOfSight, isBlocked, COVER } from './city.js';

/** How far a hostile will step to improve its position. */
export const REPOSITION_RADIUS = 9;

/** Candidate directions, evaluated every time a hostile reconsiders. */
const DIRECTIONS = 8;

/** Seconds between reconsiderations. Cheap, and stops jitter. */
export const RETHINK_INTERVAL = 0.9;

/**
 * How far a contact call carries.
 *
 * The other half of gap 7, and the one that changes how a block plays:
 * before this, hostiles each solved their own problem, so a patient
 * player could stand at thirty-five metres and take a cell apart one at
 * a time while the man beside the one being shot did nothing. A cell is
 * a cell now — one of them seeing you is all of them knowing.
 *
 * Deliberately shorter than `aggroRange`. It is a shout across a street,
 * not a radio net; two groups on opposite sides of the block still fight
 * as two groups.
 */
export const CELL_RADIUS = 26;

/** How much further an alerted hostile will come for you. */
export const ALERT_REACH = 1.6;

/** How long a contact stays live after the last sighting. */
export const ALERT_SECONDS = 8;

/**
 * Below this fraction of health, a hostile stops trying to win the
 * exchange and tries to leave it.
 *
 * Not a morale system — `Unquantized.broken` is that, and it makes people
 * run in a straight line until they are out of sight. This is a
 * professional deciding a position is no longer worth standing in: they
 * fall back to something solid, and they keep shooting the whole way.
 */
export const WITHDRAW_AT = 0.35;

/** How much room two hostiles leave each other when picking cover. */
export const CLAIM_SPACING = 3.4;

/**
 * Pass a contact around a cell.
 *
 * Called once a frame with everyone still fighting. Anybody who can
 * actually see a target marks it; anybody near enough to somebody who
 * can is told. One hop, not a flood — a chain of relays across a whole
 * block would mean stepping on any one of them alerts everything, and
 * `aggroRange` already covers "they heard the shooting".
 */
export function spreadAlert(hostiles, dt, radius = CELL_RADIUS) {
  const callers = [];
  for (const h of hostiles) {
    if (h.alertFor > 0) h.alertFor -= dt;
    if (h.sawTarget) callers.push(h);
  }
  for (const h of hostiles) {
    if (h.dormant || h.dead || h.sawTarget) continue;
    for (const c of callers) {
      if (c === h) continue;
      if (dist(h.x, h.z, c.x, c.z) <= radius) { h.alertFor = ALERT_SECONDS; break; }
    }
  }
  return callers.length;
}

/** How far this hostile is currently willing to come. */
export function reachOf(actor) {
  return actor.aggroRange * (actor.alertFor > 0 ? ALERT_REACH : 1);
}

/** Is this one hurt badly enough to want out of the exchange? */
export function isWithdrawing(actor) {
  return actor.health <= actor.maxHealth * WITHDRAW_AT;
}

/**
 * Score a position: cover against the threat, minus the cost of losing
 * the shot. A hostile that hides somewhere it cannot fire from has not
 * improved anything.
 */
function scorePosition(city, x, z, threat, weaponRange, withdrawing = false) {
  const range = dist(x, z, threat.x, threat.z);
  if (!hasLineOfSight(city, x, z, threat.x, threat.z)) {
    // Total concealment is worth something, but only as a way to break
    // contact — it scores below good cover you can still shoot from.
    // Somebody who has already decided to break contact reads it the
    // other way round: a wall between them and the squad is the best
    // thing on the block.
    return withdrawing ? 1.5 : 0.35;
  }
  const cover = coverAgainst(city, x, z, threat.x, threat.z);
  let score = cover;
  if (withdrawing) {
    // Backwards, deliberately: distance is the objective and the shot is
    // the consolation. Capped so a hurt hostile falls back to the far end
    // of the street rather than sprinting off the edge of the block.
    return score + Math.min(0.9, range / 70);
  }
  // Being inside effective range is worth roughly as much as light cover.
  if (range <= weaponRange) score += 0.4;
  else score -= Math.min(0.5, (range - weaponRange) / 60);
  return score;
}

/**
 * Pick somewhere better to stand, or null if the current spot is fine.
 *
 * Returns a point, not a path — the caller walks toward it and the normal
 * collision slide handles the rest. Over a 9m step that is honest enough,
 * and it keeps this out of the pathfinder's way.
 */
export function findCover(city, actor, threat, opts = {}) {
  const {
    radius = REPOSITION_RADIUS,
    weaponRange = actor.range ?? 26,
    improveBy = 0.2,
    withdrawing = false,
    // Where everyone else on this side is already going. Two hostiles
    // scoring the same corner independently both walk to it and stand in
    // each other, which reads as one of them being stuck rather than as
    // two people making the same reasonable decision.
    taken = [],
  } = opts;

  const current = scorePosition(city, actor.x, actor.z, threat, weaponRange, withdrawing);
  // Already tucked in somewhere good — don't fidget. Somebody breaking
  // contact keeps looking: hard cover they can still be shot around is
  // not what they are after.
  if (!withdrawing && current >= COVER.HARD) return null;

  let best = null;
  let bestScore = current + improveBy;
  const clearance = actor.radius + 0.35;

  const consider = (x, z) => {
    if (Math.abs(x) > city.halfW - 2 || Math.abs(z) > city.halfD - 2) return;
    if (isBlocked(city, x, z, clearance)) return;
    if (dist(actor.x, actor.z, x, z) > radius * 1.6) return;
    for (const t of taken) {
      if (t && dist(x, z, t.x, t.z) < CLAIM_SPACING) return;
    }
    const score = scorePosition(city, x, z, threat, weaponRange, withdrawing);
    if (score > bestScore) {
      bestScore = score;
      best = { x, z, score };
    }
  };

  // Positions hugging the structures nearby.
  //
  // A blind ring around the actor almost never lands in the narrow band
  // where cover exists, so ask the geometry directly. Sample *along* each
  // facade rather than at its midpoint: the spot that has both cover and a
  // shot is usually near a corner, and midpoints miss it entirely.
  const stand = clearance + 0.25;
  const ALONG = [-0.55, -0.3, 0, 0.3, 0.55];
  for (const s of city.structures) {
    if (dist(actor.x, actor.z, s.x, s.z) > radius + Math.max(s.w, s.d)) continue;
    const hw = s.w / 2;
    const hd = s.d / 2;
    for (const t of ALONG) {
      consider(s.x + t * s.w, s.z + hd + stand);
      consider(s.x + t * s.w, s.z - hd - stand);
      consider(s.x + hw + stand, s.z + t * s.d);
      consider(s.x - hw - stand, s.z + t * s.d);
    }
  }

  // Plus a coarse ring, which is what finds rubble to crouch behind and
  // gives a fallback when there is no structure worth hugging.
  for (let i = 0; i < DIRECTIONS; i++) {
    // Offset each actor's ring so hostiles don't all pick the same spoke.
    const angle = (i / DIRECTIONS) * Math.PI * 2 + actor.id * 0.7;
    for (const reach of [radius * 0.55, radius]) {
      consider(actor.x + Math.sin(angle) * reach, actor.z + Math.cos(angle) * reach);
    }
  }

  return best;
}

/**
 * Suppression: rounds passing close by degrade accuracy and push the
 * target to reconsider its position. It is what makes volume of fire
 * worth something on its own, and it is the reason the minigun exists.
 */
export function applySuppression(actor, amount = 1) {
  actor.suppression = Math.min(3, (actor.suppression ?? 0) + amount);
  actor.rethinkIn = 0; // being shot at is a good reason to think again
}

export function decaySuppression(actor, dt) {
  if (!actor.suppression) return;
  actor.suppression = Math.max(0, actor.suppression - dt * 0.8);
}

/** Spread multiplier from being shot at. Suppressed shooters miss more. */
export function suppressionSpread(actor) {
  return 1 + (actor.suppression ?? 0) * 0.9;
}
