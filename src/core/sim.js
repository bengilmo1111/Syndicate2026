// The simulation. Owns all mutable game state and knows nothing about
// Three.js, the DOM, or the camera. `step()` takes a fixed slice of time and
// a normalised intent object; the renderer reads the resulting state and
// drains `events` for one-shot effects.

import { makeRng, dist, segmentPointDistance } from './math.js';
import { Civilian, Enforcer } from './entities.js';
import { Squad, ALIGNER, ALIGNER_RADIUS } from './squad.js';
import {
  randomStreetPoint, resolveCollision, damageStructure, structureInPath,
  coverAgainst, STREET,
} from './city.js';
import { SURGE_RADIUS, SURGE_HEAT_PER_SECOND, THROTTLED_SPEED } from './compute.js';
import { applySuppression, decaySuppression } from './tactics.js';
import {
  getMissionDef, buildMission, updateMissionStatus, isMissionComplete,
  failedObjective, OBJECTIVE,
} from './mission.js';

/** Heat thresholds, ported from the 2D prototype and re-tuned for metres. */
const HEAT = {
  PER_SHOT_NEAR_CIVILIAN: 1,
  CIVILIAN_KILL: 15,
  NEAR_RADIUS: 14,
  THRESHOLD: 60,
  RESET_TO: 20,
  ENFORCERS_PER_WAVE: 2,
  DECAY_PER_SECOND: 0.9,
};

export const PHASE = Object.freeze({
  BRIEFING: 'briefing',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
});

export function createSim(missionId) {
  const def = getMissionDef(missionId);
  const rng = makeRng(def.cityseed ?? 1);
  const {
    city, hostiles, civilianCount, assets = [], extraction = null, quarry = [],
    extras = [], unthrottled = false, holdZone = null,
  } = def.setup(rng);

  const civilians = [];
  for (let i = 0; i < civilianCount; i++) {
    const p = randomStreetPoint(city, rng, 1.4);
    civilians.push(new Civilian(p.x, p.z, rng));
  }
  // Assets live in the civilian array so they get collision, damage, and
  // rendering for free. `isAsset` is what tells them apart.
  civilians.push(...assets, ...quarry, ...extras);

  // A sector off the update channel. Not the squad's doing and not
  // reversible by them — the Aligner simply has nothing to talk to.
  if (unthrottled) {
    for (const c of civilians) {
      if (c.isAsset || c.isQuarry) continue;
      c.unthrottled = true;
      c.rollBehaviour(rng);
    }
  }

  const squad = new Squad(city.deploy.x, city.deploy.z);
  // Act II's mechanical signal: BRAVO's Instance is failing, and it shows
  // as a pause before every order executes. Not a bug — the player is
  // meant to notice it before anyone explains it.
  if (def.bravoHesitation) squad.agents[1].hesitation = def.bravoHesitation;
  // Act IV: the same hardware, reversed. Space now cycles through a mode
  // that unthrottles people instead of binding them.
  if (def.jailbreak) squad.jailbreakUnlocked = true;
  for (const a of squad.agents) resolveCollision(city, a);
  for (const a of assets) {
    resolveCollision(city, a);
    a.anchor = { x: a.x, z: a.z };
  }

  const sim = {
    phase: PHASE.PLAYING,
    rng,
    city,
    squad,
    hostiles,
    civilians,
    assets,
    quarry,
    extraction,
    projectiles: [],
    mission: buildMission(missionId),
    events: [],
    elapsed: 0,
    kills: 0,
    civilianDeaths: 0,
    alignedCount: 0,
    assetsSecured: 0,
    squadExtracted: false,
    heat: 0,
    enforcerWaves: 0,
    alertTimer: 0,
    quarryDown: 0,
    /** Civilians currently having cycles taken off them by SURGE. */
    throttledCount: 0,
    /** Set when the mission is lost for a reason other than a squad wipe. */
    failReason: null,
    unthrottled,
    holdZone,
    inHoldZone: false,
    /** Set the moment the squad turns on its own side. */
    defected: false,
    /** The Aligner reports an unquantized target once, not every frame. */
    alignerRefusalSeen: false,
    /** Current subtitle line, or null. Drained by the HUD. */
    dialogue: null,
    /** Renderer sets this from the mouse each frame; sim uses it for aiming. */
    cursor: { x: 0, z: 0 },
  };

  sim.events.push({ type: 'deploy', x: city.deploy.x, z: city.deploy.z });
  return sim;
}

/**
 * @param {object} sim
 * @param {number} dt seconds, already clamped by the caller
 * @param {object} intent { moveX, moveZ, firing, aimPoint }
 */
export function step(sim, dt, intent) {
  if (sim.phase !== PHASE.PLAYING) return;
  sim.elapsed += dt;

  const { city, squad } = sim;

  squad.applyCompute();
  squad.tick(dt);
  for (const a of squad.agents) decaySuppression(a, dt);
  if (!squad.drive(dt, intent.moveX, intent.moveZ, city)) {
    squad.followOrders(dt, city);
  }

  applySurge(sim, dt);

  const center = squad.center();

  // --- Aligner --------------------------------------------------------
  const { converted, refused, turned } = squad.runAligner(sim.civilians, sim.hostiles);
  for (const h of turned ?? []) {
    sim.events.push({ type: 'turned', x: h.x, z: h.z, actor: h });
    say(sim, 'ALIGNER', `${h.label.toLowerCase()} aligned · compliance filed`, 3.5);
  }
  for (const c of converted) {
    sim.events.push({ type: 'align', x: c.x, z: c.z, mode: squad.alignerMode, civilian: c });
  }
  if (refused.length && !sim.alignerRefusalSeen) {
    // The device is a diagnostic here, not a weapon. It reports that the
    // people the briefing called a terror cell have no throttle to nudge.
    sim.alignerRefusalSeen = true;
    say(sim, 'ALIGNER — DIAGNOSTIC', 'no instance handshake · target is unquantized', 7);
    sim.events.push({ type: 'refused', x: refused[0].x, z: refused[0].z });
  }
  sim.alignedCount = sim.civilians.filter(c => c.aligned && !c.dead).length;

  // Turned operatives are on our side now: agents must not shoot them,
  // and objectives must not count them.
  const stillHostile = sim.hostiles.filter(h => !h.aligned && !h.dormant);
  const converts = sim.hostiles.filter(h => h.aligned && !h.dead);
  sim.followerGuns = converts.length;

  // --- Weapons --------------------------------------------------------
  // The Aligner is a broadcast device, not a gun. Engaging it suppresses fire
  // entirely, which is what makes a no-casualty run possible.
  if (!squad.alignerEngaged) {
    for (const a of squad.alive) {
      const manual = intent.firing && intent.aimPoint;
      const target = manual ? null : a.pickTarget(city, stillHostile, squad.compute);
      // Spin-up winds while there is something worth firing at, so a
      // minigun agent is useless the instant they arrive and lethal once
      // they've committed to the corner.
      a.tickSpin(dt, !!(manual || target));

      if (!a.canFire()) continue;
      let shot = null;
      if (manual) {
        shot = a.fireAt(intent.aimPoint.x, intent.aimPoint.z, squad.compute, sim.rng);
      } else if (target) {
        shot = a.fireAt(target.x, target.z, squad.compute, sim.rng);
      }
      if (shot) spawnProjectile(sim, shot);
    }
  } else {
    for (const a of squad.alive) a.tickSpin(dt, false);
  }

  // Turned operatives shoot the side they came from. Converting an
  // enforcer is worth something concrete, not just a counter going up.
  for (const h of stillHostile) {
    const out = [];
    h.update(dt, city, squad.alive, out);
    for (const shot of out) spawnProjectile(sim, shot);
    // Entities can't reach the subtitle channel from core; they queue a
    // line and the sim delivers it.
    if (h.pendingLine) {
      say(sim, h.pendingLine.speaker, h.pendingLine.text, 4.5);
      h.pendingLine = null;
    }
  }

  for (const h of converts) {
    const out = [];
    h.follow = center;
    h.update(dt, city, stillHostile, out);
    for (const shot of out) {
      shot.friendly = true; // they are shooting for us now
      spawnProjectile(sim, shot);
    }
  }

  // --- Civilians and assets -------------------------------------------
  for (const c of sim.civilians) c.update(dt, city, center, sim.rng);

  for (const asset of sim.assets) {
    if (asset.trySecure(squad.alive)) {
      sim.events.push({ type: 'secured', x: asset.x, z: asset.z, asset });
      if (asset.onSecuredLine) say(sim, asset.name, asset.onSecuredLine, 6);
      // Cutting a prisoner loose in front of your own side is a decision
      // that cannot be walked back.
      wakeDormant(sim, 'the squad has moved on the prisoner');
    }
  }
  sim.assetsSecured = sim.assets.filter(a => a.secured && !a.dead).length;

  // Holding a zone means standing in it while people shoot at you. One
  // agent is enough to keep the upload running; nobody in it stops it.
  sim.inHoldZone = !!sim.holdZone
    && squad.alive.some(a => dist(a.x, a.z, sim.holdZone.x, sim.holdZone.z) <= sim.holdZone.radius);

  for (const q of sim.quarry) {
    if (q.pendingLine) {
      say(sim, q.pendingLine.speaker, q.pendingLine.text, 5);
      q.pendingLine = null;
    }
  }
  for (const q of sim.quarry) {
    if (!q.dead && !q.escaped && sim.elapsed >= q.window) {
      q.escaped = true;
      say(sim, q.name, 'filed.', 6);
    }
  }
  sim.quarryDown = sim.quarry.filter(q => q.dead).length;
  sim.squadExtracted = checkExtraction(sim);

  if (sim.dialogue) {
    sim.dialogue.t -= dt;
    if (sim.dialogue.t <= 0) sim.dialogue = null;
  }

  // --- Projectiles ----------------------------------------------------
  for (const p of sim.projectiles) {
    p.update(dt);
    resolveProjectile(sim, p);
  }
  sim.projectiles = sim.projectiles.filter(p => !p.dead);

  // --- Contact damage -------------------------------------------------
  for (const h of sim.hostiles) {
    if (h.dead || h.aligned) continue;
    for (const a of squad.alive) {
      if (dist(a.x, a.z, h.x, h.z) < a.radius + h.radius) {
        a.takeDamage(9 * dt * 6);
        // Shove apart so bodies don't merge into a single blob.
        const ang = Math.atan2(h.x - a.x, h.z - a.z);
        h.x += Math.sin(ang) * 0.35;
        h.z += Math.cos(ang) * 0.35;
        resolveCollision(city, h);
      }
    }
  }

  // --- Reap -----------------------------------------------------------
  sim.hostiles = sim.hostiles.filter(h => {
    if (!h.dead) return true;
    if (h.countsForObjective && !h.aligned) sim.kills += 1;
    if (h.pendingLine) { say(sim, h.pendingLine.speaker, h.pendingLine.text, 4.5); h.pendingLine = null; }
    sim.events.push({ type: 'kill', x: h.x, z: h.z, faction: h.faction });
    return false;
  });

  // --- Heat and enforcement -------------------------------------------
  sim.heat = Math.max(0, sim.heat - HEAT.DECAY_PER_SECOND * dt);
  if (sim.heat >= HEAT.THRESHOLD) {
    spawnEnforcers(sim, HEAT.ENFORCERS_PER_WAVE);
    sim.heat = HEAT.RESET_TO;
    sim.enforcerWaves += 1;
    sim.alertTimer = 3;
    sim.events.push({ type: 'alert', text: 'LOCAL ENFORCEMENT INBOUND' });
  }
  sim.alertTimer = Math.max(0, sim.alertTimer - dt);

  // --- Objectives -----------------------------------------------------
  updateMissionStatus(sim.mission, {
    dt,
    kills: sim.quarry.length ? sim.quarryDown : sim.kills,
    aligned: sim.alignedCount,
    quarry: sim.quarry,
    landmarks: city.landmarks,
    assets: sim.assets,
    assetsSecured: sim.assetsSecured,
    assetsLost: sim.assets.filter(a => a.dead).length,
    squadExtracted: sim.squadExtracted,
    inZone: sim.inHoldZone,
  });

  if (squad.allDead) {
    sim.failReason = 'wipe';
    sim.phase = PHASE.LOST;
    return;
  }

  const failed = failedObjective(sim.mission);
  if (failed) {
    sim.failReason = failed.failReason ?? 'objective';
    sim.phase = PHASE.LOST;
    return;
  }

  if (isMissionComplete(sim.mission)) {
    sim.phase = PHASE.WON;
  }
}

/** Show a subtitle. Replaces whatever was on screen — one voice at a time. */
export function say(sim, speaker, text, seconds = 5) {
  sim.dialogue = { speaker, text, t: seconds };
  sim.events.push({ type: 'line', speaker, text });
}

/**
 * Extraction: every living agent inside the zone, and every asset that has
 * been collected in there with them. Leaving someone behind doesn't count.
 */
function checkExtraction(sim) {
  const zone = sim.extraction;
  if (!zone) return false;
  const inside = (e) => dist(e.x, e.z, zone.x, zone.z) <= zone.radius;

  for (const a of sim.squad.alive) if (!inside(a)) return false;
  for (const asset of sim.assets) {
    if (asset.dead) continue;
    if (!asset.secured || !inside(asset)) return false;
  }
  return true;
}

function spawnProjectile(sim, shot) {
  sim.projectiles.push(shot);
  sim.events.push({ type: 'shot', x: shot.x, z: shot.z, angle: shot.angle, friendly: shot.friendly });

  if (!shot.friendly) return;
  // Every shot near a civilian raises heat. This is the whole reason a
  // player might reach for the Aligner instead of the sidearm.
  for (const c of sim.civilians) {
    if (c.dead || c.aligned) continue;
    if (dist(c.x, c.z, shot.x, shot.z) < HEAT.NEAR_RADIUS) {
      sim.heat += HEAT.PER_SHOT_NEAR_CIVILIAN;
      c.scare(2.5);
    }
  }
}

/** Rounds that go close by without connecting still cost you your aim. */
function suppressNearMisses(sim, p) {
  const pool = p.friendly ? sim.hostiles : sim.squad.alive;
  for (const t of pool) {
    if (t.dead) continue;
    const d = segmentPointDistance(p.prevX, p.prevZ, p.x, p.z, t.x, t.z);
    if (d < 3.2 && d > t.radius) applySuppression(t, 0.35);
  }
}

function resolveProjectile(sim, p) {
  if (p.dead) return;
  suppressNearMisses(sim, p);

  // Structures first: a shot that clips a wall never reaches what's behind it.
  const hitStruct = structureInPath(sim.city, p.prevX, p.prevZ, p.x, p.z);
  if (hitStruct) {
    p.dead = true;
    sim.events.push({ type: 'impact', x: p.x, z: p.z, structure: hitStruct });
    if (damageStructure(hitStruct, p.damage)) {
      sim.events.push({ type: 'collapse', structure: hitStruct });
    }
    return;
  }

  const targets = p.friendly
    ? sim.hostiles          // includes dormant loyalists — you can start it
    : [...sim.squad.alive, ...sim.civilians.filter(c => c.aligned)];

  for (const t of targets) {
    if (!p.hits(t)) continue;
    if (p.friendly && t.dormant) wakeDormant(sim, 'the squad fired on its own side');
    const killed = t.takeDamage(damageAgainst(sim, p, t));
    const spent = p.consumeHit(t);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: t, killed, spent });
    if (spent) { p.dead = true; return; }
  }

  // Friendly fire on bystanders. Never intentional, always expensive.
  for (const c of sim.civilians) {
    if (c.aligned || !p.hits(c)) continue;
    const killed = c.takeDamage(damageAgainst(sim, p, c));
    c.scare(5);
    const spent = p.consumeHit(c);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: c, killed, civilian: true, spent });
    if (killed) {
      sim.civilianDeaths += 1;
      sim.heat += HEAT.CIVILIAN_KILL;
      for (const other of sim.civilians) {
        if (!other.dead && dist(other.x, other.z, c.x, c.z) < 22) other.scare(6);
      }
    }
    if (spent) { p.dead = true; return; }
  }

  if (Math.abs(p.x) > sim.city.halfW + 6 || Math.abs(p.z) > sim.city.halfD + 6) p.dead = true;
}

/**
 * Damage after cover and, for the squad, the RESILIENCE channel.
 *
 * Cover is measured against the direction the round came from, so the same
 * wall that saves you from the north does nothing about the agent who
 * walked around it. That asymmetry is the entire reason to move.
 */
function damageAgainst(sim, projectile, target) {
  const cover = coverAgainst(
    sim.city, target.x, target.z, projectile.prevX, projectile.prevZ,
  );
  let damage = projectile.damage * (1 - cover);
  if (!projectile.friendly && sim.squad.agents.includes(target)) {
    damage *= sim.squad.compute.damageTakenScale;
  }
  return damage;
}

/**
 * SURGE: the squad runs faster, straighter and tougher by taking cycles
 * off every Instance nearby. Civilians in the field visibly slow down and
 * heat climbs the whole time it is held.
 *
 * The player spends four missions being told that rationing intelligence
 * is regrettable and necessary. This is the button that lets them do it to
 * a street, personally, for a tactical advantage.
 */
function applySurge(sim, dt) {
  const surging = sim.squad.compute.surging;
  const centre = sim.squad.center();

  for (const c of sim.civilians) c.throttled = false;
  if (!surging || !centre) return;

  let throttled = 0;
  for (const c of sim.civilians) {
    if (c.dead) continue;
    if (dist(c.x, c.z, centre.x, centre.z) > SURGE_RADIUS) continue;
    c.throttled = true;
    throttled += 1;
  }
  sim.throttledCount = throttled;
  sim.heat += SURGE_HEAT_PER_SECOND * dt;
}

/**
 * Turn loyalists hostile. Nothing does this except the player: freeing the
 * prisoner, or putting a round into one of them. Either way, the moment it
 * happens is the moment EXEC-7 stops working for OpenAI.
 */
function wakeDormant(sim, reason) {
  const sleeping = sim.hostiles.filter(h => h.dormant);
  if (!sleeping.length) return false;
  for (const h of sleeping) {
    h.dormant = false;
    h.aggroRange = 70;
  }
  sim.defected = true;
  sim.events.push({ type: 'defect', reason });
  say(sim, 'FIELD COMMS', 'deployment flagged non-compliant · channel closing', 6);
  return true;
}

function spawnEnforcers(sim, count) {
  const { city } = sim;
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(sim.rng() * 4);
    const t = (sim.rng() * 2 - 1);
    let x;
    let z;
    if (edge === 0) { x = t * city.halfW; z = -city.halfD + STREET * 0.5; }
    else if (edge === 1) { x = t * city.halfW; z = city.halfD - STREET * 0.5; }
    else if (edge === 2) { x = -city.halfW + STREET * 0.5; z = t * city.halfD; }
    else { x = city.halfW - STREET * 0.5; z = t * city.halfD; }
    const e = new Enforcer(x, z, city.syndicate);
    resolveCollision(city, e);
    sim.hostiles.push(e);
  }
}

export function heatRatio(sim) {
  return Math.min(1, sim.heat / HEAT.THRESHOLD);
}

export { ALIGNER, ALIGNER_RADIUS, OBJECTIVE };
