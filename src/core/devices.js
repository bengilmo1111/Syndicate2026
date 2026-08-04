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
import { resolveCollision } from './city.js';

/**
 * When each tool becomes standard issue.
 *
 * The belt grows with the campaign rather than arriving whole, for two
 * reasons. Six area-denial tools handed to a player in Act I is not a
 * toolkit, it is a menu; and every one of the first ten missions was
 * tuned against a two-item belt. `'THE MAP'` is where generated retake
 * deployments live — by the time the map is writing you work, you have
 * the kit.
 */
export const ACTS = Object.freeze(['ACT I', 'ACT II', 'ACT III', 'ACT IV', 'THE MAP']);

/**
 * An act string we do not recognise gets the *base* kit, not the full one.
 * A typo in a mission definition should quietly under-equip the squad, not
 * quietly hand them an orbital strike.
 */
export function actIndex(act) {
  const i = ACTS.indexOf(act);
  return i < 0 ? 0 : i;
}

/**
 * Non-lethal, and it means it.
 *
 * The syndicate's paperwork does not distinguish between a cell that was
 * shot and a cell that was sedated — both file as CLEARED, both close the
 * objective. The player is the only party to this who knows the
 * difference, which is the entire joke and the reason a bloodless run has
 * to be mechanically possible rather than just thematically implied.
 *
 * The four that follow are the *offensive* strange tools `GAP_ANALYSIS.md`
 * §4 still wanted. The rule they are all built to is the one that made the
 * first two work: none of them is a bigger gun. Razor wire shapes where a
 * fight can happen; the misalignment aerosol changes who people shoot;
 * the graviton charge decides where they are standing; satellite rain is
 * the only thing in the game that levels a block without the squad firing
 * a round. Each creates a tactic. None of them is a damage number you
 * could have got from a better rifle.
 *
 * And every one of them applies to the squad. That is not an oversight
 * being preserved for symmetry — it is the reason placement is a decision.
 */
export const DEVICE = Object.freeze({
  CHOKE: {
    id: 'CHOKE',
    name: 'CHOKE FIELD',
    key: 'E',
    from: 'ACT I',
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
    from: 'ACT I',
    charges: 2,
    radius: 11,
    lifetime: 12,
    arm: 1.2,
    note: 'Sedates anything breathing inside it. Nobody dies. It is slow.',
  },
  RAZOR: {
    id: 'RAZOR',
    name: 'RAZOR WIRE',
    key: 'U',
    from: 'ACT II',
    charges: 2,
    radius: 9,
    // Wire does not disperse. It lasts most of a deployment, which is what
    // makes it the one device you place before the fight rather than
    // during it.
    lifetime: 50,
    arm: 0.5,
    note: 'Crossing it is slow and it costs. It stays where you put it.',
  },
  PSYCHO: {
    id: 'PSYCHO',
    name: 'MISALIGNMENT AEROSOL',
    key: 'Y',
    from: 'ACT III',
    charges: 1,
    radius: 12,
    lifetime: 10,
    arm: 1,
    note: 'An alignment payload with the sign flipped. Nobody inside can tell sides apart.',
  },
  GRAVITON: {
    id: 'GRAVITON',
    name: 'GRAVITON CHARGE',
    key: 'O',
    from: 'ACT IV',
    charges: 1,
    radius: 16,
    lifetime: 6,
    arm: 0.8,
    note: 'Drags everything inside to one point. Does no damage. That is not the same as safe.',
  },
  RAIN: {
    id: 'RAIN',
    name: 'SATELLITE RAIN',
    key: 'I',
    from: 'ACT IV',
    charges: 1,
    radius: 20,
    // Three and a half seconds of a ring on the ground and nothing else.
    // The warning *is* the weapon: it is long enough for the squad to walk
    // out and long enough to be too late if they were told to hold.
    arm: 3.5,
    lifetime: 0.6,
    strike: true,
    note: 'Borrowed from a constellation that is not ours. Get out of the ring.',
  },
});

export const DEVICE_IDS = Object.keys(DEVICE);

/** The tools available to a mission, by the act it belongs to. */
export function devicesFor(act) {
  const at = actIndex(act);
  return DEVICE_IDS.filter(id => actIndex(DEVICE[id].from) <= at);
}

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

/** Razor wire: expensive to cross, not impossible. Wire is not a wall. */
export const RAZOR_DPS = 24;
export const RAZOR_SPEED = 0.35;

/**
 * How long the misalignment lasts after you leave the cloud.
 *
 * Long enough that walking out is not an instant fix, short enough that a
 * squad which reacts survives it. The seconds are the whole tactic.
 */
export const PSYCHO_FOR = 8;

/**
 * How hard a graviton charge drags, in metres per second.
 *
 * Deliberately above every walking speed in the game, the squad's
 * included. A charge you can stroll out of is not a graviton weapon, it
 * is a suggestion — and the reason it is allowed to be inescapable is
 * that it does no damage at all and it drags your own agents too.
 */
export const GRAVITON_PULL = 16;
/** It stops dragging once you are here — a pile, not a single point. */
export const GRAVITON_CORE = 2.2;

/** Impacts per satellite strike, and what each one does at its centre. */
export const RAIN_IMPACTS = 5;
export const RAIN_DAMAGE = 130;
export const RAIN_SPLASH = 8;

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
    /** Strike devices happen once. This is how they remember. */
    this.fired = false;
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
export function newDeviceBelt(act = 'THE MAP') {
  const belt = {};
  // Absent, not zero. A tool the squad has not been issued yet is not on
  // the belt at all, so the HUD can leave it off the panel instead of
  // showing four empty rows from mission one.
  for (const id of devicesFor(act)) belt[id] = DEVICE[id].charges;
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
export function tickDevices(devices, actors, dt, city = null) {
  const downed = [];
  /** Damage a device did, handed back for the sim to account for properly. */
  const hurt = [];
  /** Impacts a strike device called down as it armed. */
  const strikes = [];

  for (const a of actors) {
    a.choked = false;
    a.snared = false;
    if (a.dead || a.downed) continue;
    if (a.sedation) a.sedation = Math.max(0, a.sedation - SEDATION_DECAY * dt);
    // Misalignment persists after you walk out of the cloud. Walking out
    // is the counter; walking out is not instant.
    if (a.psycho) a.psycho = Math.max(0, a.psycho - dt);
  }

  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i];
    if (d.arming > 0) {
      d.arming -= dt;
      continue;
    }

    // A strike device is not a field. It spends its warning on the ground
    // and then happens once, on the frame it finishes arming.
    if (d.type.strike && !d.fired) {
      d.fired = true;
      strikes.push(...impactsFor(d));
    }

    d.life -= dt;
    if (d.spent) { devices.splice(i, 1); continue; }

    for (const a of actors) {
      if (a.dead || a.downed || !d.covers(a)) continue;

      switch (d.id) {
        case 'CHOKE':
          a.choked = true;
          break;

        case 'RAZOR':
          a.snared = true;
          hurt.push({ actor: a, amount: RAZOR_DPS * dt });
          break;

        case 'PSYCHO':
          // Not a nudge — the payload with the sign flipped. While this is
          // set, whoever is carrying it cannot tell one side from another.
          a.psycho = PSYCHO_FOR;
          break;

        case 'GRAVITON': {
          const dx = d.x - a.x;
          const dz = d.z - a.z;
          const away = Math.hypot(dx, dz);
          if (!away) break;                       // already on it; nothing to divide by
          // One expression enforces the whole behaviour: drag at the pull
          // rate, but never further than the distance that would put you on
          // the core. An extra "already inside, stop" branch would be dead
          // code — this returns zero there anyway.
          const step = Math.min(Math.max(0, away - GRAVITON_CORE), GRAVITON_PULL * dt);
          if (!step) break;
          a.x += (dx / away) * step;
          a.z += (dz / away) * step;
          // Dragged *through* the street, not into a wall. Without this a
          // charge placed across a facade parks half the block inside the
          // geometry for the rest of the mission.
          if (city) resolveCollision(city, a);
          break;
        }

        case 'STANDDOWN': {
          // Sedation. Decay already ran this frame, so add the full rate.
          a.sedation = (a.sedation ?? 0) + (SEDATION_RATE + SEDATION_DECAY) * dt;
          const limit = a.isAgent ? AGENT_SEDATION_THRESHOLD : SEDATION_THRESHOLD;
          if (a.sedation >= limit) {
            a.downed = true;
            a.sedation = limit;
            downed.push(a);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  return { downed, hurt, strikes };
}

/**
 * Where a satellite strike actually lands.
 *
 * Deliberately a fixed pattern rather than a random scatter: the ring on
 * the ground is a promise, and a player who cleared it should not be
 * killed by a roll. One at the centre, four on the diagonals.
 */
function impactsFor(d) {
  const out = [{ x: d.x, z: d.z, radius: RAIN_SPLASH, damage: RAIN_DAMAGE }];
  const r = d.radius * 0.62;
  for (let i = 0; i < RAIN_IMPACTS - 1; i++) {
    const a = (Math.PI / 4) + (i * Math.PI) / 2;
    out.push({
      x: d.x + Math.sin(a) * r,
      z: d.z + Math.cos(a) * r,
      radius: RAIN_SPLASH,
      damage: RAIN_DAMAGE,
    });
  }
  return out;
}
