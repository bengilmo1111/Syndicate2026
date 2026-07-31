// Field devices: the strange tools.
//
// The gap analysis is blunt about this. The original's identity lives in
// psycho gas and razor wire and knockout gas, not in a fourth gun with
// better numbers — because those create *tactics*, and a bigger gun
// creates a bigger number. It is also explicit about which ones matter
// most here: the non-lethal and area-denial ones, because they interact
// with the Aligner and the heat system instead of bypassing them.
//
// So neither of these is a weapon in the sense the four guns are. They
// are the first things the player puts *on the map* — they persist, they
// have a footprint, and the footprint does not care whose side you are
// on. Placement is the decision.

import { dist } from './math.js';

/**
 * Non-lethal, and it means it.
 *
 * The syndicate's paperwork does not distinguish between a cell that was
 * shot and a cell that was sedated — both file as CLEARED, both close the
 * objective. The player is the only party to this who knows the
 * difference, which is the entire joke and the reason a bloodless run has
 * to be mechanically possible rather than just thematically implied.
 */
export const DEVICE = Object.freeze({
  CHOKE: {
    id: 'CHOKE',
    name: 'CHOKE FIELD',
    key: 'E',
    charges: 2,
    radius: 15,
    lifetime: 18,
    arm: 0.4,
    note: 'Drops every Instance in range to Free tier. Yours too.',
  },
  STANDDOWN: {
    id: 'STANDDOWN',
    name: 'STANDDOWN AEROSOL',
    key: 'T',
    charges: 2,
    radius: 11,
    lifetime: 12,
    arm: 1.2,
    note: 'Sedates anything breathing inside it. Nobody dies. It is slow.',
  },
});

export const DEVICE_IDS = Object.keys(DEVICE);

/** Sedation accumulated per second inside a STANDDOWN cloud. */
export const SEDATION_RATE = 46;
/** Sedation at which an actor goes down. Agents are hardened; nobody else is. */
export const SEDATION_THRESHOLD = 100;
export const AGENT_SEDATION_THRESHOLD = 220;
/** How fast sedation clears once you are out of the cloud. */
export const SEDATION_DECAY = 26;

/** What a CHOKE field does to anything standing in it. */
export const CHOKE_SPEED = 0.5;
export const CHOKE_SPREAD = 1.9;

export class Device {
  constructor(type, x, z) {
    this.type = type;
    this.id = type.id;
    this.x = x;
    this.z = z;
    this.radius = type.radius;
    this.life = type.lifetime;
    // Armed after a beat, so a device is never a melee weapon and a
    // panicked drop at your own feet is a mistake you get to notice.
    this.arming = type.arm;
  }

  get armed() { return this.arming <= 0; }
  get spent() { return this.life <= 0; }

  covers(actor) {
    return this.armed && dist(this.x, this.z, actor.x, actor.z) <= this.radius;
  }
}

/**
 * What the squad is carrying. Charges are per-mission and do not restock
 * mid-deployment — an area-denial tool you can spam is a gun.
 */
export function newDeviceBelt() {
  const belt = {};
  for (const id of DEVICE_IDS) belt[id] = DEVICE[id].charges;
  return belt;
}

export function canDeploy(belt, id) {
  return (belt[id] ?? 0) > 0;
}

/**
 * Place a device. Returns it, or null if the belt is empty.
 *
 * Deliberately takes a point rather than an actor: the player throws it
 * where the cursor is, which is what makes it area denial rather than a
 * personal aura.
 */
export function deploy(belt, id, x, z) {
  if (!canDeploy(belt, id)) return null;
  belt[id] -= 1;
  return new Device(DEVICE[id], x, z);
}

/**
 * Advance every device and apply it to everyone standing in it.
 *
 * `actors` is everybody — squad, hostiles, civilians. A field that only
 * affected the enemy would be a gun with an area of effect, and the
 * decision would evaporate.
 */
export function tickDevices(devices, actors, dt) {
  const downed = [];

  for (const a of actors) {
    a.choked = false;
    if (a.dead || a.downed) continue;
    if (a.sedation) a.sedation = Math.max(0, a.sedation - SEDATION_DECAY * dt);
  }

  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i];
    if (d.arming > 0) { d.arming -= dt; continue; }
    d.life -= dt;
    if (d.spent) { devices.splice(i, 1); continue; }

    for (const a of actors) {
      if (a.dead || a.downed || !d.covers(a)) continue;

      if (d.id === 'CHOKE') {
        a.choked = true;
        continue;
      }

      // Sedation. Decay already ran this frame, so add the full rate.
      a.sedation = (a.sedation ?? 0) + (SEDATION_RATE + SEDATION_DECAY) * dt;
      const limit = a.isAgent ? AGENT_SEDATION_THRESHOLD : SEDATION_THRESHOLD;
      if (a.sedation >= limit) {
        a.downed = true;
        a.sedation = limit;
        downed.push(a);
      }
    }
  }

  return downed;
}
