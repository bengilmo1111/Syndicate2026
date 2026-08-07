// The simulation. Owns all mutable game state and knows nothing about
// Three.js, the DOM, or the camera. `step()` takes a fixed slice of time and
// a normalised intent object; the renderer reads the resulting state and
// drains `events` for one-shot effects.

import { makeRng, dist, segmentPointDistance } from './math.js';
import { Civilian, Enforcer } from './entities.js';
import { Squad, ALIGNER, ALIGNER_RADIUS, PROVOKED_FOR } from './squad.js';
import {
  randomStreetPoint, resolveCollision, damageStructure, structureInPath,
  coverAgainst, STREET,
} from './city.js';
import { SURGE_RADIUS, SURGE_HEAT_PER_SECOND, THROTTLED_SPEED } from './compute.js';
import { applySuppression, decaySuppression, spreadAlert } from './tactics.js';
import { pumpInterludes } from './interlude.js';
import { deployed, applyToAgent } from './roster.js';
import {
  DEVICE, newDeviceBelt, deploy as deployDevice, tickDevices,
  CHOKE_SPEED, CHOKE_SPREAD, RAZOR_SPEED,
} from './devices.js';
import { newTraffic, tickTraffic, blastVictims } from './traffic.js';
import { boardableAt, board, disembark, steerVehicle, tickDriven } from './driving.js';
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

/**
 * @param missionId
 * @param opts.roster optional persistent roster — supplies who is in the
 *   suits and what has been bolted into them. Omitted, the squad is four
 *   anonymous default agents, which is what every test that does not care
 *   about progression wants.
 */
export function createSim(missionId, opts = {}) {
  const def = getMissionDef(missionId);
  const rng = makeRng(def.cityseed ?? 1);
  const {
    city, hostiles, civilianCount, assets = [], extraction = null, quarry = [],
    extras = [], unthrottled = false, holdZone = null, traffic = 0,
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
  // Who is actually in the suits, and what they have had fitted.
  {
    const roster = opts.roster ?? null;
    if (roster) {
      const crew = deployed(roster);
      squad.agents.forEach((a, i) => applyToAgent(a, crew[i]));
      squad.roster = roster;
    }
  }
  // Act II's mechanical signal: BRAVO's Instance is failing, and it shows
  // as a pause before every order executes. Not a bug — the player is
  // meant to notice it before anyone explains it.
  //
  // A reflex governor is the in-fiction fix, so it suppresses this. It
  // does not fix what is actually wrong with BRAVO.
  if (def.bravoHesitation && !squad.agents[1].hesitationImmune) {
    squad.agents[1].hesitation = def.bravoHesitation;
  }
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
    /** Of `civilianDeaths`, how many went down with a building. */
    collapseDeaths: 0,
    unthrottled,
    holdZone,
    inHoldZone: false,
    /** Set the moment the squad turns on its own side. */
    defected: false,
    /** The Aligner reports an unquantized target once, not every frame. */
    alignerRefusalSeen: false,
    /** Current subtitle line, or null. Drained by the HUD. */
    dialogue: null,
    /** Mid-mission dialog beats — see `src/core/interlude.js`. */
    interludeDefs: def.interludes ?? [],
    /** The beat currently on screen waiting to be answered, or null. */
    interlude: null,
    /** Beats that have already fired, so a condition can't re-trigger. */
    interludesSeen: new Set(),
    /** interlude id → chosen option id. Debriefs and later missions read this. */
    interludeAnswers: {},
    /** The persistent roster this deployment was drawn from, if any. */
    roster: opts.roster ?? null,
    /** Field devices currently on the map. See `src/core/devices.js`. */
    devices: [],
    /**
     * Ambient traffic. Not people and not scenery: a car brakes for you,
     * blocks a lane once it is wreckage, and takes anybody standing next
     * to it with it. See `src/core/traffic.js`.
     */
    traffic: newTraffic(city, traffic, rng),
    /**
     * The car the squad is in, or null. One at a time: there are four
     * agents and four seats, and a squad split across two vehicles is a
     * second control scheme for a situation the game never asks for.
     * See `src/core/driving.js`.
     */
    vehicle: null,
    /** Charges left, per device type. Not restocked mid-deployment. */
    // The belt grows with the campaign. Act I deploys with two tools and
    // the first ten missions were tuned against exactly that.
    belt: newDeviceBelt(def.act),
    /** Sedated, not dead. Counts toward ELIMINATE; does not count as a kill. */
    downed: 0,
    /**
     * What the objective model reads. The syndicate does not distinguish
     * between a cell that was shot and a cell that was sedated — both file
     * as CLEARED. The player is the only party who knows the difference,
     * and `kills` is where that difference is kept.
     */
    neutralised: 0,
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

  // A blocking interlude freezes the field. Yelin gets to finish the
  // sentence; the guards do not get to shoot you while he does.
  if (pumpInterludes(sim)) return;

  sim.elapsed += dt;

  const { city, squad } = sim;

  squad.applyCompute();
  squad.tick(dt);
  for (const a of squad.agents) {
    decaySuppression(a, dt);
    // RETURN FIRE reads this. It has to expire, or one stray round early
    // in a mission quietly turns the stance into ENGAGE for good.
    if (a.provoked > 0) a.provoked = Math.max(0, a.provoked - dt);
  }
  if (!squad.drive(dt, intent.moveX, intent.moveZ, city)) {
    squad.followOrders(dt, city);
  }

  applySurge(sim, dt);

  // A device goes where the player put the cursor, not at their feet.
  if (intent.deployDevice) {
    const at = intent.aimPoint ?? sim.cursor;
    const placed = deployDevice(sim.belt, intent.deployDevice, at.x, at.z);
    if (placed) {
      sim.devices.push(placed);
      sim.events.push({ type: 'device', x: placed.x, z: placed.z, device: placed });
      say(sim, DEVICE[intent.deployDevice].name, DEVICE[intent.deployDevice].note, 4);
    }
  }

  // --- Field devices ---------------------------------------------------
  // Everybody on the map, because a field that only affected the enemy
  // would be a gun with an area of effect.
  const everyone = [...squad.agents, ...sim.hostiles, ...sim.civilians];
  // Every field that slows somebody writes `speed` directly, so the base
  // has to be restored each frame or the scaling compounds. Agents are
  // already reset by `applyCompute()` above; nobody else was reset at all,
  // which meant a hostile who walked through a choke field spent the rest
  // of the mission at a fraction of a metre per second — the field read as
  // "stops you dead, permanently" rather than "half speed while you are in
  // it", and no test noticed because slowing is what it is supposed to do.
  for (const a of everyone) {
    if (a.isAgent) continue;
    if (a.baseSpeed == null) a.baseSpeed = a.speed;
    else a.speed = a.baseSpeed;
  }

  // Traffic. Ticked with the devices because it is the other thing on the
  // street that is neither a person nor a building.
  for (const v of tickTraffic(sim.traffic, everyone, dt, city, sim.rng)) {
    sim.events.push({ type: 'wreck', x: v.x, z: v.z });
    // Anybody still in it is thrown clear first, and then stands two
    // metres from a car that is going up — which is very nearly the
    // worst place on the block to be. A vehicle is speed and noise, not
    // armour, and being shot at inside one has to be worse than being
    // shot at outside one or it is the only thing anybody would ever do.
    if (v.crew?.length) {
      disembark(v, city);
      if (sim.vehicle === v) sim.vehicle = null;
      say(sim, 'VEHICLE', 'the car is gone — everybody out', 4);
    }
    // Blowing up a car on a street is loud, and the sector notices whether
    // or not it was the squad that did it.
    sim.heat += HEAT.CIVILIAN_KILL;
    for (const { actor, amount } of blastVictims(v, everyone)) {
      // The same rule as every other incidental: what happens to a person
      // with a name is something the player chose, in as many words. A
      // player who drops satellite rain on a journalist chose that; a car
      // going up on the far side of the street is not that, and letting it
      // kill Okafor or Yelin silently converts an ending nobody decided.
      if (actor.fated || actor.isQuarry || actor.isAsset) continue;
      incidentalDamage(sim, actor, amount, true);
      actor.scare?.(7);
    }
    for (const c of sim.civilians) {
      if (!c.dead && dist(c.x, c.z, v.x, v.z) < 34) c.scare(6);
    }
  }

  driveVehicle(sim, dt, intent, everyone);

  const fields = tickDevices(sim.devices, everyone, dt, city);
  for (const a of fields.downed) {
    sim.events.push({ type: 'downed', x: a.x, z: a.z, actor: a });
    if (a.isAgent) {
      say(sim, 'STANDDOWN', `${a.name} is down — sedated, not lost`, 5);
    } else if (sim.hostiles.includes(a)) {
      sim.downed += 1;
    }
  }
  // Razor wire. Charged to the player because the player put it there —
  // a civilian who walks into your wire is your civilian.
  for (const { actor, amount } of fields.hurt) incidentalDamage(sim, actor, amount, true);
  for (const s of fields.strikes) applyStrike(sim, s);

  // A choked Instance thinks at Free tier. It is SURGE pointed the other
  // way, and it does not care whose Instance it is.
  for (const a of everyone) {
    if (a.snared) a.speed = (a.baseSpeed ?? a.speed) * RAZOR_SPEED;
    if (!a.choked) continue;
    a.speed = (a.baseSpeed ?? a.speed) * CHOKE_SPEED;
    // A civilian's pace is not `speed` at all — it is three tier-derived
    // speeds read through `throttled`, the same flag SURGE sets. Without
    // this the field's own note ("drops every Instance in range to Free
    // tier") was false for the only people on the street actually running
    // a consumer Instance.
    if (a.throttled !== undefined) a.throttled = true;
  }

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
    for (const a of squad.afoot) {
      const manual = intent.firing && intent.aimPoint;
      // Fire discipline. Left-click always works — HOLD FIRE is
      // discipline, not disarmament — but what an agent does on its own
      // account is the player's call.
      // Misalignment turns "who" into nobody in particular. Deliberately
      // narrowed to whoever is armed: "the squad never auto-targets a
      // civilian" is an absolute the contract missions are built on, and
      // this must not become its exception. What it does reach is the
      // other three suits, which is enough.
      //
      // Fire discipline still applies. Setting HOLD FIRE is a real answer
      // to being gassed, and it costs you your own guns to use — which is
      // the trade, not a loophole.
      const pool = a.psycho > 0
        ? [...stillHostile, ...squad.afoot.filter(other => other !== a)]
        : stillHostile;
      const target = (manual || !squad.mayEngage(a))
        ? null
        : a.pickTarget(city, pool, squad.compute);
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
      if (shot) {
        // Whether a human pointed this round or the squad picked its own
        // target. Only one of those is an order, and one thing in the game
        // cares which — see the quarry rule in `resolveProjectile`.
        shot.ordered = manual;
        spawnProjectile(sim, shot);
      }
    }
  } else {
    for (const a of squad.afoot) a.tickSpin(dt, false);
  }

  // What the other side can actually shoot at.
  //
  // Bodies on foot, plus the car if the squad is in one. Without the car
  // in this list a vehicle is total cover: hostiles find no target at all
  // and stand there while the squad drives past them, which makes the
  // best move in every firefight "get in a car". With it, they shoot the
  // car — and rounds already stop at vehicles, so it takes the damage,
  // and when it goes up it takes the squad with it.
  const marks = sim.vehicle && !sim.vehicle.dead
    ? [...squad.afoot, sim.vehicle]
    : squad.afoot;

  // A cell fights as a cell.
  //
  // Two frames' worth of coordination, and between them they are most of
  // what `GAP_ANALYSIS.md` gap 7 was still asking for. `spreadAlert`
  // passes a contact from whoever can see the squad to whoever is near
  // them, so a patient player can no longer stand at thirty-five metres
  // and take a room apart one man at a time. `claimed` stops two of them
  // walking to the same corner and standing in each other — they each
  // reconsider on their own clock, so it has to be the *current* set,
  // rebuilt every frame rather than accumulated.
  spreadAlert(stillHostile, dt);
  const claimed = stillHostile.map(h => h.coverSpot).filter(Boolean);

  // Turned operatives shoot the side they came from. Converting an
  // enforcer is worth something concrete, not just a counter going up.
  for (const h of stillHostile) {
    h.claimed = claimed.filter(spot => spot !== h.coverSpot);
    const out = [];
    // Gassed, they stop being a side. `update` skips itself, so a cell
    // caught in a misalignment cloud fights the nearest body it can see,
    // which is usually one of its own.
    h.update(dt, city, h.psycho > 0 ? [...marks, ...stillHostile] : marks, out);
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
    h.update(dt, city, h.psycho > 0 ? [...stillHostile, ...marks] : stillHostile, out);
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
  // Shot or sedated, the objective is satisfied. `kills` stays separate
  // so the debrief can tell the player which run they actually had.
  sim.neutralised = sim.kills + sim.downed;

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
    for (const a of squad.afoot) {
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
    // Somebody who was sedated and then killed stops being a sedation.
    // `neutralised` is kills + downed, so leaving both set would close an
    // ELIMINATE objective off half the bodies it asked for.
    if (h.downed) sim.downed = Math.max(0, sim.downed - 1);
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
    kills: sim.quarry.length ? sim.quarryDown : sim.neutralised,
    aligned: sim.alignedCount,
    quarry: sim.quarry,
    landmarks: city.landmarks,
    assets: sim.assets,
    assetsSecured: sim.assetsSecured,
    assetsLost: sim.assets.filter(a => a.dead).length,
    squadExtracted: sim.squadExtracted,
    inZone: sim.inHoldZone,
    // For `done` predicates: what the player has decided so far, and how
    // they answered the dialog beats. An ending branch is a decision, not
    // a tally, and this is what it reads.
    flags: sim.mission.flags,
    interludeAnswers: sim.interludeAnswers,
    sim,
  });

  if (squad.allDead) {
    sim.failReason = 'wipe';
    sim.phase = PHASE.LOST;
    return;
  }
  // Everybody sedated is not a wipe and must not read as one — but the
  // deployment is over, and it has to end rather than sit there while the
  // player waits for someone to get up.
  if (squad.allDown) {
    sim.failReason = 'sedated';
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
/**
 * Say something once when an occupied structure is close to going.
 *
 * A tower collapsing is the most expensive thing in the game and stray
 * rounds chip towers. Finding out afterwards that eighty people were in
 * the building reads as the game cheating; being told at 40% and doing it
 * anyway is a decision, which is the whole point of making them
 * destructible.
 */
function warnStructure(sim, s) {
  if (s.warned || s.collapsed || !s.occupancy || !s.maxHp) return;
  if (s.hp / s.maxHp > 0.4) return;
  s.warned = true;
  say(sim, 'STRUCTURAL',
    `${s.occupancy} instances still checked in at that address`, 6);
  sim.events.push({ type: 'structural', x: s.x, z: s.z, structure: s });
}

/**
 * What a collapse costs.
 *
 * This is the cost model the gap analysis asked for, in the game's own
 * language rather than a resource bar: a tower is ninety Free-tier
 * tenants, and dropping it kills all of them. It spikes heat, it wrecks
 * the mission's civilian-loss record, and it costs research at the
 * debrief — the same currency the cryovat runs on.
 *
 * And it lands on whoever is standing in the footprint, including the
 * squad. Rubble spreads a third further than the building stood, so
 * dropping a block you are fighting next to is a way to lose an
 * operative permanently.
 */
function collapseCasualties(sim, s, byPlayer) {
  // The people inside. Abstract — they were never simulated on the
  // street — but they count exactly like anyone else who dies here.
  if (s.occupancy > 0) {
    sim.civilianDeaths += s.occupancy;
    sim.collapseDeaths += s.occupancy;
    say(sim, 'STRUCTURAL',
      `${s.occupancy} instances lost with the structure`, 7);

    if (byPlayer) {
      // Heat alone cannot express this. The threshold spawns one wave and
      // resets, so a fifty-tenant tower and a six-tenant one would cost
      // the same — which would make levelling the tall one strictly
      // better. Enforcement scales with the body count instead, capped so
      // a single mistake is expensive rather than unrecoverable.
      sim.heat += HEAT.CIVILIAN_KILL * 2;
      const waves = Math.min(COLLAPSE_MAX_WAVES, Math.ceil(s.occupancy / COLLAPSE_PER_WAVE));
      for (let i = 0; i < waves; i++) {
        spawnEnforcers(sim, HEAT.ENFORCERS_PER_WAVE);
        sim.enforcerWaves += 1;
      }
      if (waves) {
        sim.alertTimer = 4;
        sim.events.push({ type: 'alert', text: 'STRUCTURAL COLLAPSE — ENFORCEMENT INBOUND' });
      }
    }
  }

  // Anyone caught under it. The rubble field is already the widened
  // footprint by the time this runs.
  const caught = [...sim.squad.agents, ...sim.hostiles, ...sim.civilians];
  for (const a of caught) {
    if (a.dead || a.fated) continue;
    const inside = Math.abs(a.x - s.x) <= s.w / 2 + a.radius
      && Math.abs(a.z - s.z) <= s.d / 2 + a.radius;
    if (!inside) continue;

    const killed = a.takeDamage(COLLAPSE_DAMAGE);
    sim.events.push({ type: 'hit', x: a.x, z: a.z, actor: a, killed, spent: true });
    if (!killed) continue;
    // Counted the same way a bullet would count it. A civilian crushed
    // by a building the squad dropped is not a different kind of death.
    if (sim.civilians.includes(a)) {
      sim.civilianDeaths += 1;
      if (byPlayer) sim.heat += HEAT.CIVILIAN_KILL;
    }
    // A hostile crushed here is *not* counted as a kill on the spot. The
    // reaper at the end of the step counts every dead hostile exactly
    // once; doing it here as well meant dropping a building on a cell
    // credited the player twice for each body, and an ELIMINATE for six
    // could close on three.
  }
  // Nobody standing in a rubble field should be inside geometry, dead or
  // not — a survivor pushed into the mesh is a stuck agent for the rest
  // of the mission.
  for (const a of caught) if (!a.dead) resolveCollision(sim.city, a);
}

/**
 * Damage from something the squad *placed* rather than fired.
 *
 * Razor wire and satellite rain both need the accounting a bullet gets —
 * a civilian who dies in your wire is a civilian you killed — and neither
 * of them is a projectile, so `resolveProjectile` cannot do it.
 *
 * Kills are deliberately *not* counted here. The reaper at the end of the
 * step is the only place a dead hostile becomes a kill; anything that
 * counts one early counts it twice.
 */
/**
 * Getting in, getting out, and driving.
 *
 * Boarding is deliberately not a verb aimed at a vehicle: there is no
 * "click the car" and no ownership model. The squad stands next to a
 * stopped one and presses the key. Traffic already brakes for people, so
 * *making* a car stop is a thing the player does with their body — walk
 * into the road and wait. That loop existed before this feature did.
 *
 * The moment they are in it, it stops braking. See `src/core/driving.js`.
 */
function driveVehicle(sim, dt, intent, everyone) {
  const { city, squad } = sim;

  if (intent.board) {
    if (sim.vehicle) {
      const v = sim.vehicle;
      const out = disembark(v, city);
      sim.vehicle = null;
      sim.events.push({ type: 'unboard', x: v.x, z: v.z });
      say(sim, 'VEHICLE', `${out.length} out — it stays where you left it`, 3);
    } else {
      // From the selection's position, not the squad's: half a squad in
      // cover across the street should not be able to reach into a car
      // the other half is standing next to.
      const at = squad.selectedCenter();
      const car = at && boardableAt(sim.traffic, at.x, at.z);
      const crew = car ? board(car, squad.selected) : [];
      if (crew.length) {
        sim.vehicle = car;
        sim.events.push({ type: 'board', x: car.x, z: car.z });
        say(sim, 'VEHICLE', `${crew.length} aboard — it brakes for nobody now`, 4);
      }
    }
  }

  const v = sim.vehicle;
  if (!v || v.dead) return;

  // The same keys walk an agent and drive a car; who is selected decides
  // which. Nobody aboard selected means nobody has their foot on it, and
  // it rolls to a stop.
  const driving = v.crew.some(a => a.selected);
  steerVehicle(v, driving ? intent.moveX : 0, driving ? intent.moveZ : 0, dt);

  const { struck, crashed } = tickDriven(v, dt, city, everyone);

  for (const { actor, amount } of struck) {
    sim.events.push({ type: 'ram', x: actor.x, z: actor.z });
    // Charged to the player, every time, with no exemption for who was
    // driving or how fast the street was. A car is the least ambiguous
    // thing in this game: nothing put that person under it except the
    // direction somebody was holding. `incidentalDamage` still spares the
    // handful of people whose fate is a decision the mission asks for in
    // as many words — running Yelin over is not how that scene ends.
    incidentalDamage(sim, actor, amount, true);
    actor.scare?.(9);
  }
  // Everyone nearby sees it, whether or not it reached them.
  if (struck.length) {
    for (const c of sim.civilians) {
      if (!c.dead && dist(c.x, c.z, v.x, v.z) < 26) c.scare(7);
    }
  }

  if (crashed > 0) {
    sim.events.push({ type: 'crash', x: v.x, z: v.z });
    v.takeDamage(crashed);
  }
}

function incidentalDamage(sim, actor, amount, byPlayer) {
  if (actor.dead || actor.fated) return false;
  const killed = actor.takeDamage(amount);
  sim.events.push({ type: 'hit', x: actor.x, z: actor.z, actor, killed, spent: true });
  if (!killed) return false;
  if (sim.civilians.includes(actor)) {
    sim.civilianDeaths += 1;
    if (byPlayer) sim.heat += HEAT.CIVILIAN_KILL;
  }
  return true;
}

/**
 * One impact of a satellite strike.
 *
 * The only thing in the game that levels a block without the squad firing
 * a round — and the block still has people in it, so it runs through the
 * same collapse cost model everything else does. Deliberately not enough
 * damage to drop a nine-floor tower on its own: orbital rain clears a
 * street, it does not hand the player a demolition button.
 */
function applyStrike(sim, strike) {
  sim.events.push({ type: 'strike', x: strike.x, z: strike.z, radius: strike.radius });

  for (const s of [...sim.city.structures]) {
    if (s.collapsed || !s.destructible) continue;
    if (dist(s.x, s.z, strike.x, strike.z) > strike.radius + Math.max(s.w, s.d) / 2) continue;
    warnStructure(sim, s);
    if (damageStructure(s, strike.damage * STRIKE_STRUCTURE_SCALE, sim.city)) {
      sim.events.push({ type: 'collapse', structure: s });
      collapseCasualties(sim, s, true);
    }
  }

  for (const a of [...sim.squad.agents, ...sim.hostiles, ...sim.civilians]) {
    if (a.dead) continue;
    const d = dist(a.x, a.z, strike.x, strike.z);
    if (d > strike.radius) continue;
    // Falls off from the centre, so the edge of an impact is survivable
    // and standing on one is not.
    incidentalDamage(sim, a, strike.damage * (1 - (d / strike.radius) * 0.6), true);
  }
}

/** How much harder a strike hits concrete than it hits people. */
const STRIKE_STRUCTURE_SCALE = 4;

/** What being under a building costs. Survivable, but only just. */
const COLLAPSE_DAMAGE = 85;
/** Tenants per extra enforcement wave a player-caused collapse draws. */
const COLLAPSE_PER_WAVE = 18;
/** Expensive, not unrecoverable. */
const COLLAPSE_MAX_WAVES = 3;

function suppressNearMisses(sim, p) {
  const pool = p.friendly ? sim.hostiles : sim.squad.afoot;
  for (const t of pool) {
    if (t.dead) continue;
    const d = segmentPointDistance(p.prevX, p.prevZ, p.x, p.z, t.x, t.z);
    if (d < 3.2 && d > t.radius) {
      applySuppression(t, 0.35);
      // A round past your ear counts as being shot at. RETURN FIRE reads
      // this, and it deliberately triggers on the near miss rather than
      // on the hit — an agent who waits to be wounded before shooting
      // back is not a stance, it is a liability.
      if (!p.friendly) t.provoked = PROVOKED_FOR;
    }
  }
}

function resolveProjectile(sim, p) {
  if (p.dead) return;
  suppressNearMisses(sim, p);

  // Structures first: a shot that clips a wall never reaches what's behind it.
  // A car is a big steel box in the road. A round that hits one stops
  // there — which is what makes shooting past a lane of traffic a
  // different problem from shooting across an empty street.
  for (const v of sim.traffic) {
    if (v.dead || !p.hits(v)) continue;
    const killed = v.takeDamage(p.damage);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: v, killed, spent: true });
    p.dead = true;
    return;
  }

  const hitStruct = structureInPath(sim.city, p.prevX, p.prevZ, p.x, p.z);
  if (hitStruct) {
    p.dead = true;
    sim.events.push({ type: 'impact', x: p.x, z: p.z, structure: hitStruct });
    warnStructure(sim, hitStruct);
    if (damageStructure(hitStruct, p.damage, sim.city)) {
      sim.events.push({ type: 'collapse', structure: hitStruct });
      collapseCasualties(sim, hitStruct, p.friendly);
    }
    return;
  }

  // A round fired by somebody who cannot tell sides apart does not know
  // whose side it is on either. Without this the aerosol would make a
  // gassed agent *aim* at their own squad and the round would pass
  // harmlessly through them, which is worse than not shipping it.
  const confused = (p.owner?.psycho ?? 0) > 0;
  const targets = confused
    ? [...sim.hostiles, ...sim.squad.afoot]
    : (p.friendly
      ? sim.hostiles          // includes dormant loyalists — you can start it
      : [...sim.squad.afoot, ...sim.civilians.filter(c => c.aligned)]);

  for (const t of targets) {
    if (!p.hits(t)) continue;
    if (!p.friendly) t.provoked = PROVOKED_FOR;
    if (p.friendly && t.dormant) wakeDormant(sim, 'the squad fired on its own side');
    const killed = t.takeDamage(damageAgainst(sim, p, t));
    const spent = p.consumeHit(t);
    sim.events.push({ type: 'hit', x: p.x, z: p.z, actor: t, killed, spent });
    if (spent) { p.dead = true; return; }
  }

  // Friendly fire on bystanders. Never intentional, always expensive.
  for (const c of sim.civilians) {
    // …except for the handful of people whose fate is the mission's
    // decision. A stray round killing Yelin mid-firefight silently
    // converts the capture and walk-away endings into a corpse, and the
    // player never finds out why. Same rule as `securable: false` and the
    // collapse exemption: what happens to a person with a name has to be
    // something the player chose, in as many words.
    if (c.aligned || c.fated || !p.hits(c)) continue;
    // The same rule, one step weaker, for a named character the player is
    // *supposed* to be able to shoot. Priya Okafor dies to a round somebody
    // aimed or she does not die: a rival's spread, or the squad's own
    // auto-fire at a target behind her, closes the contract on the player's
    // behalf and the debrief reads as though they chose it.
    //
    // Found when ambient traffic shifted the shared RNG stream and a stray
    // landed on her. It was always possible; the stream just never happened
    // to do it before.
    if (c.isQuarry && !p.ordered) continue;
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
