// Squad state: selection, formation movement, move orders, the Aligner.
// Engine-agnostic. Movement input arrives as a camera-relative vector so the
// renderer owns the camera and the simulation stays pure.

import { Agent } from './entities.js';
import { Compute } from './compute.js';
import { resolveCollision } from './city.js';
import { findPath } from './nav.js';
import { dist } from './math.js';

/** Diamond formation offsets, in metres, relative to the squad anchor. */
const FORMATION = [
  { x: -2.6, z: 1.4 },
  { x: 2.6, z: 1.4 },
  { x: -2.6, z: -1.9 },
  { x: 2.6, z: -1.9 },
];

export const ALIGNER = Object.freeze({
  OFF: 'off',
  BIND: 'bind',
  JAILBREAK: 'jailbreak',
});

export const ALIGNER_RADIUS = 13.5;

/**
 * How far from the ordered point an agent may be placed to keep the
 * squad's shape. A little larger than the diamond, so a tight squad
 * arrives in formation and a scattered one regroups.
 */
export const MAX_SPREAD = 4;

/**
 * How much alignment pressure a target resists.
 *
 * Straight from the original: converting a crowd is how you *earn* the
 * ability to convert an operative, because your existing followers count
 * toward the threshold. That snowball is what turns the Aligner from a
 * mission-objective device into a strategy — and it is why the Act IV
 * jailbreak inversion lands, since by then the player has spent hours
 * building crowds with it.
 */
export const ALIGN_RESISTANCE = Object.freeze({
  civilian: 0,
  enforcer: 6,
  rival: 12,
  asset: Infinity,      // she is not being converted, she is being taken
  unquantized: Infinity, // no throttle to talk to
});

export function resistanceOf(target) {
  if (target.isAsset) return ALIGN_RESISTANCE.asset;
  if (target.alignable === false) return ALIGN_RESISTANCE.unquantized;
  if (target.faction) return ALIGN_RESISTANCE[target.faction] ?? ALIGN_RESISTANCE.rival;
  return ALIGN_RESISTANCE.civilian;
}

export class Squad {
  constructor(x, z, loadout = null) {
    this.agents = FORMATION.map((off, i) => new Agent(x + off.x, z + off.z, i, loadout?.[i]));
    this.alignerMode = ALIGNER.OFF;
    // Jailbreak mode unlocks in Act IV. Until then Space only toggles bind.
    this.jailbreakUnlocked = false;
    this.compute = new Compute();
  }

  /** Push the compute allocation onto the agents that depend on it. */
  applyCompute() {
    const scale = this.compute.speedScale;
    for (const a of this.agents) a.speed = a.baseSpeed * scale;
  }

  // A sedated agent is alive and no use to anybody: they cannot walk,
  // shoot, or stand in an extraction zone on their own account. Every
  // one of those reads `alive`, so `alive` has to mean "on their feet".
  get alive() { return this.agents.filter(a => !a.neutralised); }
  get selected() { return this.agents.filter(a => a.selected && !a.neutralised); }
  get allDead() { return this.agents.every(a => a.dead); }
  /** Nobody left standing — dead, sedated, or some of each. */
  get allDown() { return this.agents.every(a => a.neutralised); }
  get alignerEngaged() { return this.alignerMode !== ALIGNER.OFF; }

  center() {
    const alive = this.alive;
    if (!alive.length) return null;
    let x = 0;
    let z = 0;
    for (const a of alive) { x += a.x; z += a.z; }
    return { x: x / alive.length, z: z / alive.length };
  }

  selectedCenter() {
    const sel = this.selected;
    if (!sel.length) return this.center();
    let x = 0;
    let z = 0;
    for (const a of sel) { x += a.x; z += a.z; }
    return { x: x / sel.length, z: z / sel.length };
  }

  selectOnly(index) {
    this.agents.forEach((a, i) => { a.selected = i === index && !a.dead; });
    if (!this.selected.length) this.selectAll();
  }

  toggleSelect(index) {
    const a = this.agents[index];
    if (!a || a.dead) return;
    a.selected = !a.selected;
    if (!this.selected.length) a.selected = true;
  }

  selectAll() {
    this.agents.forEach(a => { a.selected = !a.dead; });
  }

  cycleAligner() {
    if (this.alignerMode === ALIGNER.OFF) {
      this.alignerMode = ALIGNER.BIND;
    } else if (this.alignerMode === ALIGNER.BIND && this.jailbreakUnlocked) {
      this.alignerMode = ALIGNER.JAILBREAK;
    } else {
      this.alignerMode = ALIGNER.OFF;
    }
    return this.alignerMode;
  }

  /**
   * Drive selected agents with a normalised camera-relative direction.
   * Manual input cancels any standing move order.
   */
  drive(dt, dirX, dirZ, city) {
    const mag = Math.hypot(dirX, dirZ);
    if (mag < 0.01) return false;
    const nx = dirX / mag;
    const nz = dirZ / mag;
    for (const a of this.agents) a.walking = false;
    for (const a of this.selected) {
      a.moveTarget = null;
      a.path = null;
      a.walking = true;
      a.x += nx * a.speed * dt;
      a.z += nz * a.speed * dt;
      a.turnToward(a.x + nx, a.z + nz, dt, 14);
      resolveCollision(city, a);
    }
    return true;
  }

  /**
   * Right-click order. Formation offsets are preserved around the target,
   * and each agent gets its own route through the street grid — the block
   * is full of buildings, so a straight line is rarely the order.
   */
  issueMove(point, city) {
    const sel = this.selected;
    if (!sel.length) return;
    const center = this.selectedCenter();
    for (const a of sel) {
      // Preserve the shape of the squad, but only up to a formation's
      // worth of it. A firefight scatters agents tens of metres apart,
      // and an uncapped offset means "go there" resolves to each agent's
      // own current position — the order looks issued and nobody moves.
      // Found by the autopilot on the-tower, where the squad ended up
      // ringing the objective at 25m and standing still forever.
      let ox = a.x - center.x;
      let oz = a.z - center.z;
      const spread = Math.hypot(ox, oz);
      if (spread > MAX_SPREAD) {
        ox = (ox / spread) * MAX_SPREAD;
        oz = (oz / spread) * MAX_SPREAD;
      }
      const goal = { x: point.x + ox, z: point.z + oz };
      a.path = city ? findPath(city, a, goal, a.radius) : [goal];
      a.finalGoal = goal;
      a.moveTarget = a.path.shift() ?? goal;
      a.stuck = 0;
      a.repaths = 0;
    }
  }

  /** Advance any agent with a standing move order, one waypoint at a time. */
  followOrders(dt, city) {
    for (const a of this.agents) a.walking = false;
    for (const a of this.alive) {
      if (!a.moveTarget) continue;
      a.walking = true;

      const d = dist(a.x, a.z, a.moveTarget.x, a.moveTarget.z);
      if (d < 1.1) {
        a.moveTarget = a.path?.shift() ?? null;
        if (!a.moveTarget) { a.path = null; a.finalGoal = null; }
        a.stuck = 0;
        continue;
      }

      a.turnToward(a.moveTarget.x, a.moveTarget.z, dt, 10);
      const step = Math.min(a.speed * dt, d);
      const before = { x: a.x, z: a.z };
      a.x += Math.sin(a.facing) * step;
      a.z += Math.cos(a.facing) * step;
      resolveCollision(city, a);

      // Grinding against geometry the route didn't account for — usually
      // another agent's body or rubble. Re-route once, then give up rather
      // than stand there vibrating against a wall forever.
      const progress = dist(before.x, before.z, a.x, a.z);
      if (progress < step * 0.35) {
        a.stuck += dt;
        if (a.stuck > 0.7) {
          a.stuck = 0;
          a.repaths = (a.repaths ?? 0) + 1;
          if (a.repaths > 2 || !a.finalGoal) {
            a.moveTarget = null;
            a.path = null;
            a.finalGoal = null;
          } else {
            a.path = findPath(city, a, a.finalGoal, a.radius);
            a.moveTarget = a.path.shift() ?? a.finalGoal;
          }
        }
      } else {
        a.stuck = 0;
      }
    }
  }

  tick(dt) {
    for (const a of this.agents) a.tick(dt);
  }

  /**
   * Run the Aligner sweep.
   *
   * `converted` feeds mission progress and the HUD. `refused` is targets
   * inside the field with no Instance the device can talk to — which is
   * the only way the player ever finds out who they've been sent to kill.
   */
  runAligner(civilians, hostiles = []) {
    if (!this.alignerEngaged) return { converted: [], refused: [], turned: [] };
    const mode = this.alignerMode;
    const converted = [];
    const refused = [];
    const turned = [];

    // Every follower already carrying your alignment adds to the field.
    // This is the snowball: a crowd is the tool you use on an operative.
    const strength = civilians.filter(c => c.aligned && !c.dead).length;

    for (const a of this.alive) {
      for (const c of civilians) {
        if (c.dead) continue;
        if (dist(a.x, a.z, c.x, c.z) > ALIGNER_RADIUS) continue;
        if (c.align(mode)) converted.push(c);
      }
      // Jailbreak reaches the operatives you turned as well. Freeing
      // people costs you the ones who were following you.
      //
      // It also *only* frees: it does not recruit, so the binding pass
      // below is skipped entirely. Running both would have agent one turn
      // an operative and agent two free them again, every frame, forever.
      if (mode === ALIGNER.JAILBREAK) {
        for (const h of hostiles) {
          if (h.dead || !h.aligned || h.jailbroken) continue;
          if (dist(a.x, a.z, h.x, h.z) > ALIGNER_RADIUS) continue;
          h.jailbroken = true;
          h.aligned = false;
          h.dormant = true;   // they are nobody's now
          h.countsForObjective = false;
        }
        continue;
      }
      for (const h of hostiles) {
        if (h.dead || h.aligned) continue;
        if (dist(a.x, a.z, h.x, h.z) > ALIGNER_RADIUS) continue;

        const resistance = resistanceOf(h);
        if (!Number.isFinite(resistance)) {
          if (h.refusedAligner) continue;
          h.refusedAligner = true;
          refused.push(h);
          continue;
        }
        if (strength < resistance) {
          h.alignerResisted = true;
          continue;
        }
        h.aligned = true;
        h.faction = 'follower';
        h.countsForObjective = false;
        turned.push(h);
      }
    }
    return { converted, refused, turned, strength };
  }
}

export { FORMATION };
