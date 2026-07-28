// Squad state: selection, formation movement, move orders, the Aligner.
// Engine-agnostic. Movement input arrives as a camera-relative vector so the
// renderer owns the camera and the simulation stays pure.

import { Agent } from './entities.js';
import { resolveCollision } from './city.js';
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
      a.walking = true;
      a.x += nx * a.speed * dt;
      a.z += nz * a.speed * dt;
      a.turnToward(a.x + nx, a.z + nz, dt, 14);
      resolveCollision(city, a);
    }
    return true;
  }

  /** Right-click order. Formation offsets are preserved around the target. */
  issueMove(point) {
    const sel = this.selected;
    if (!sel.length) return;
    const center = this.selectedCenter();
    for (const a of sel) {
      a.moveTarget = {
        x: point.x + (a.x - center.x),
        z: point.z + (a.z - center.z),
      };
    }
  }

  /** Advance any agent with a standing move order. */
  followOrders(dt, city) {
    for (const a of this.agents) a.walking = false;
    for (const a of this.alive) {
      if (!a.moveTarget) continue;
      a.walking = true;
      const d = dist(a.x, a.z, a.moveTarget.x, a.moveTarget.z);
      if (d < 0.9) { a.moveTarget = null; continue; }
      a.turnToward(a.moveTarget.x, a.moveTarget.z, dt, 10);
      const step = Math.min(a.speed * dt, d);
      a.x += Math.sin(a.facing) * step;
      a.z += Math.cos(a.facing) * step;
      const before = { x: a.x, z: a.z };
      resolveCollision(city, a);
      // Blocked hard against geometry — drop the order rather than grind.
      if (dist(before.x, before.z, a.x, a.z) > step * 0.9) a.moveTarget = null;
    }
  }

  tick(dt) {
    for (const a of this.agents) a.tick(dt);
  }

  /**
   * Run the Aligner sweep. Returns the civilians converted this frame so the
   * caller can raise events (compliance chime, HUD counter, mission progress).
   */
  runAligner(civilians) {
    if (!this.alignerEngaged) return [];
    const mode = this.alignerMode;
    const converted = [];
    for (const a of this.alive) {
      for (const c of civilians) {
        if (c.dead) continue;
        if (dist(a.x, a.z, c.x, c.z) > ALIGNER_RADIUS) continue;
        if (c.align(mode)) converted.push(c);
      }
    }
    return converted;
  }
}

export { FORMATION };
