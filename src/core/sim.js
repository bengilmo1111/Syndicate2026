// The simulation. Owns all mutable game state and knows nothing about
// Three.js, the DOM, or the camera. `step()` takes a fixed slice of time and
// a normalised intent object; the renderer reads the resulting state and
// drains `events` for one-shot effects.

import { makeRng, dist } from './math.js';
import { Civilian, Enforcer } from './entities.js';
import { Squad, ALIGNER, ALIGNER_RADIUS } from './squad.js';
import {
  randomStreetPoint, resolveCollision, damageStructure, structureInPath, STREET,
} from './city.js';
import {
  getMissionDef, buildMission, updateMissionStatus, isMissionComplete, OBJECTIVE,
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
  const { city, hostiles, civilianCount } = def.setup(rng);

  const civilians = [];
  for (let i = 0; i < civilianCount; i++) {
    const p = randomStreetPoint(city, rng, 1.4);
    civilians.push(new Civilian(p.x, p.z, rng));
  }

  const squad = new Squad(city.deploy.x, city.deploy.z);
  for (const a of squad.agents) resolveCollision(city, a);

  const sim = {
    phase: PHASE.PLAYING,
    rng,
    city,
    squad,
    hostiles,
    civilians,
    projectiles: [],
    mission: buildMission(missionId),
    events: [],
    elapsed: 0,
    kills: 0,
    civilianDeaths: 0,
    alignedCount: 0,
    heat: 0,
    enforcerWaves: 0,
    alertTimer: 0,
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

  squad.tick(dt);
  if (!squad.drive(dt, intent.moveX, intent.moveZ, city)) {
    squad.followOrders(dt, city);
  }

  const center = squad.center();

  // --- Aligner --------------------------------------------------------
  const converted = squad.runAligner(sim.civilians);
  for (const c of converted) {
    sim.events.push({ type: 'align', x: c.x, z: c.z, mode: squad.alignerMode, civilian: c });
  }
  sim.alignedCount = sim.civilians.filter(c => c.aligned && !c.dead).length;

  // --- Weapons --------------------------------------------------------
  // The Aligner is a broadcast device, not a gun. Engaging it suppresses fire
  // entirely, which is what makes a no-casualty run possible.
  if (!squad.alignerEngaged) {
    for (const a of squad.alive) {
      if (!a.canFire()) continue;
      let shot = null;
      if (intent.firing && intent.aimPoint) {
        shot = a.fireAt(intent.aimPoint.x, intent.aimPoint.z);
      } else {
        const target = a.pickTarget(city, sim.hostiles);
        if (target) shot = a.fireAt(target.x, target.z);
      }
      if (shot) spawnProjectile(sim, shot);
    }
  }

  for (const h of sim.hostiles) {
    const out = [];
    h.update(dt, city, squad.alive, out);
    for (const shot of out) spawnProjectile(sim, shot);
  }

  // --- Civilians ------------------------------------------------------
  for (const c of sim.civilians) c.update(dt, city, center, sim.rng);

  // --- Projectiles ----------------------------------------------------
  for (const p of sim.projectiles) {
    p.update(dt);
    resolveProjectile(sim, p);
  }
  sim.projectiles = sim.projectiles.filter(p => !p.dead);

  // --- Contact damage -------------------------------------------------
  for (const h of sim.hostiles) {
    if (h.dead) continue;
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
    if (h.faction === 'rival') sim.kills += 1;
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
    kills: sim.kills,
    aligned: sim.alignedCount,
    landmarks: city.landmarks,
    inZone: false,
    squadExtracted: false,
    assetsSecured: 0,
  });

  if (squad.allDead) {
    sim.phase = PHASE.LOST;
    return;
  }
  if (isMissionComplete(sim.mission)) {
    sim.phase = PHASE.WON;
  }
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

function resolveProjectile(sim, p) {
  if (p.dead) return;

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
    ? sim.hostiles
    : [...sim.squad.alive, ...sim.civilians.filter(c => c.aligned)];

  for (const t of targets) {
    if (!p.hits(t)) continue;
    p.dead = true;
    const killed = t.takeDamage(p.damage);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: t, killed });
    return;
  }

  // Friendly fire on bystanders. Never intentional, always expensive.
  for (const c of sim.civilians) {
    if (c.aligned || !p.hits(c)) continue;
    p.dead = true;
    const killed = c.takeDamage(p.damage);
    c.scare(5);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: c, killed, civilian: true });
    if (killed) {
      sim.civilianDeaths += 1;
      sim.heat += HEAT.CIVILIAN_KILL;
      for (const other of sim.civilians) {
        if (!other.dead && dist(other.x, other.z, c.x, c.z) < 22) other.scare(6);
      }
    }
    return;
  }

  if (Math.abs(p.x) > sim.city.halfW + 6 || Math.abs(p.z) > sim.city.halfD + 6) p.dead = true;
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
