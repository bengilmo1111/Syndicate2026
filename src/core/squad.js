// Squad state: selection, formation movement, move orders, the Aligner.
// Engine-agnostic. Movement input arrives as a camera-relative vector so the
// renderer owns the camera and the simulation stays pure.

import { Agent } from './entities.js';
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

export class Squad {
  constructor(x, z) {
    this.agents = FORMATION.map((off, i) => new Agent(x + off.x, z + off.z, i));
    this.alignerMode = ALIGNER.OFF;
    // Jailbreak mode unlocks in Act IV. Until then Space only toggles bind.
    this.jailbreakUnlocked = false;
  }

  get alive() { return this.agents.filter(a => !a.dead); }
  get selected() { return this.agents.filter(a => a.selected && !a.dead); }
  get allDead() { return this.agents.every(a => a.dead); }
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
      const goal = {
        x: point.x + (a.x - center.x),
        z: point.z + (a.z - center.z),
      };
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
    if (!this.alignerEngaged) return { converted: [], refused: [] };
    const mode = this.alignerMode;
    const converted = [];
    const refused = [];

    for (const a of this.alive) {
      for (const c of civilians) {
        if (c.dead) continue;
        if (dist(a.x, a.z, c.x, c.z) > ALIGNER_RADIUS) continue;
        if (c.align(mode)) converted.push(c);
      }
      for (const h of hostiles) {
        if (h.dead || h.alignable || h.refusedAligner) continue;
        if (dist(a.x, a.z, h.x, h.z) > ALIGNER_RADIUS) continue;
        h.refusedAligner = true;
        refused.push(h);
      }
    }
    return { converted, refused };
  }
}

export { FORMATION };
