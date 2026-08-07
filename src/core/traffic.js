// Ambient traffic.
//
// `GAP_ANALYSIS.md` §6 is explicit that vehicles are a large chunk of what
// made the original's cities feel like cities rather than dioramas — and
// equally explicit that **ambient traffic alone buys most of the
// atmosphere for a fraction of the work**, and is worth doing first as a
// separate item. This is that item. Nothing here is drivable.
//
// The block already has a street grid the squad paths over. Traffic reuses
// it exactly: a vehicle picks a centreline, drives it end to end, and picks
// another. No pathfinding, no intersection logic, no turning — a car that
// only ever goes straight down a street it is already on cannot get stuck,
// cannot deadlock, and cannot cost a frame. Everything interesting happens
// where it meets people.
//
// Pure core: no Three.js, no DOM. Tested in Node like the rest.

import { dist } from './math.js';
import { STREET } from './city.js';

/** How fast a lane runs, in metres per second. */
export const SPEED_MIN = 13;
export const SPEED_MAX = 21;
/** What one is worth shooting at. Two bursts, not a project. */
export const VEHICLE_HEALTH = 90;
/** How far ahead a vehicle looks for something to stop for. */
export const BRAKE_RANGE = 13;
/** Radius of the blast when one goes up, and what it does at the centre. */
export const WRECK_RADIUS = 11;
export const WRECK_DAMAGE = 95;
/** How long a wreck burns before it is just a shape in the road. */
export const BURN_SECONDS = 6;

/**
 * A vehicle.
 *
 * Not an `Actor` subclass on purpose. Actors are people: they are aligned,
 * sedated, suppressed, thrown by graviton charges and counted by
 * objectives. A car is none of those things, and giving it the whole
 * interface would mean every one of those systems has to remember to skip
 * it. It gets exactly what it needs — a position, health, and a lane.
 */
export class Vehicle {
  constructor(id, lane, t, speed) {
    this.id = id;
    /** `{ axis, at, dir }` — see `lanesFor`. */
    this.lane = lane;
    /** How far along the lane, 0..1. */
    this.t = t;
    this.cruise = speed;
    this.speed = speed;
    this.radius = 2.4;
    this.health = VEHICLE_HEALTH;
    this.maxHealth = VEHICLE_HEALTH;
    this.dead = false;
    this.burning = 0;
    /** Set on the frame it is destroyed, so the sim can blow it up once. */
    this.justWrecked = false;
    this.hitFlash = 0;
    /**
     * Who is aboard, and whether anyone ever has been. Both live here
     * rather than in `driving.js` because `tickTraffic` has to know to
     * leave this car alone, and it is the only thing ambient traffic
     * needs to know about the player being in one. See `src/core/driving.js`.
     */
    this.crew = [];
    this.driven = false;
    this.x = 0;
    this.z = 0;
    this.facing = 0;
    this.place();
  }

  /** Where 0..1 along this lane actually is, in metres. */
  place() {
    const { axis, at, dir, from, to } = this.lane;
    const along = from + (to - from) * this.t;
    if (axis === 'x') {
      this.x = at;
      this.z = along;
      this.facing = dir > 0 ? 0 : Math.PI;
    } else {
      this.x = along;
      this.z = at;
      this.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  takeDamage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.hitFlash = 0.14;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.justWrecked = true;
      this.burning = BURN_SECONDS;
      // No `speed = 0` here: the dead branch in `tickTraffic` returns
      // before anything moves, so setting it would be a line no test could
      // ever fail on.
      return true;
    }
    return false;
  }
}

/**
 * Every lane in the block, both directions.
 *
 * Offset half a lane off the centreline so opposing traffic passes rather
 * than driving through itself — the streets are ten metres wide and this
 * is the whole of the road layout the game needs.
 */
export function lanesFor(city) {
  const lanes = [];
  const off = STREET * 0.22;
  for (const x of city.streetsX) {
    lanes.push({ axis: 'x', at: x - off, dir: 1, from: -city.halfD, to: city.halfD });
    lanes.push({ axis: 'x', at: x + off, dir: -1, from: city.halfD, to: -city.halfD });
  }
  for (const z of city.streetsZ) {
    lanes.push({ axis: 'z', at: z + off, dir: 1, from: -city.halfW, to: city.halfW });
    lanes.push({ axis: 'z', at: z - off, dir: -1, from: city.halfW, to: -city.halfW });
  }
  return lanes;
}

/** Fill a block with traffic, spread down the lanes rather than stacked. */
export function newTraffic(city, count, rng = Math.random) {
  const lanes = lanesFor(city);
  const out = [];
  for (let i = 0; i < count; i++) {
    const lane = lanes[Math.floor(rng() * lanes.length)];
    // Position stratified by index and only jittered inside its own slice.
    // Left to the rng alone, a block opens with cars clumped — and two on
    // the same lane at the same point brake for each other forever, so the
    // street starts with a jam nobody caused.
    const t = (i + rng()) / count;
    out.push(new Vehicle(i + 1, lane, t, SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN)));
  }
  return out;
}

/**
 * Drive everything one step, and report what blew up.
 *
 * `obstacles` is everybody on foot. A vehicle **brakes** for them rather
 * than running them down: these are autonomous in 2041, braking is what
 * they are for, and a game that kills your own agents with random
 * background traffic is a game with a random punishment in it. Standing in
 * the road stops the road, which is a tactic rather than an accident.
 */
export function tickTraffic(vehicles, obstacles, dt, city, rng = Math.random) {
  const wrecked = [];

  for (const v of vehicles) {
    v.hitFlash = Math.max(0, v.hitFlash - dt);

    if (v.dead) {
      v.burning = Math.max(0, v.burning - dt);
      if (v.justWrecked) {
        v.justWrecked = false;
        wrecked.push(v);
      }
      continue;
    }

    // A car the squad has been in is out of the ambient model for good —
    // it is steered by `tickDriven` and it stays where they left it. It is
    // still an obstacle everything else brakes for, which is how a parked
    // getaway car blocks a lane.
    if (v.driven) continue;

    // Brake for whatever is in the lane ahead — people, and the wreck of
    // whatever was in front of you a moment ago.
    const blocked = ahead(v, obstacles, vehicles);
    const want = blocked ? 0 : v.cruise;
    // Braking is much faster than accelerating, which is both true and
    // what stops a queue of cars oscillating into each other.
    const rate = want < v.speed ? 46 : 9;
    v.speed += Math.sign(want - v.speed) * Math.min(rate * dt, Math.abs(want - v.speed));

    const length = Math.abs(v.lane.to - v.lane.from);
    v.t += (v.speed * dt) / length;
    if (v.t >= 1) {
      // Off the far edge. Reappear on a fresh lane rather than looping the
      // same one, so a block does not develop a permanent circuit.
      const lanes = lanesFor(city);
      v.lane = lanes[Math.floor(rng() * lanes.length)];
      v.t = 0;
      v.cruise = SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN);
      v.speed = v.cruise;
    }
    v.place();
  }

  return wrecked;
}

/** Is there something in this vehicle's way? */
function ahead(v, obstacles, vehicles) {
  const fx = Math.sin(v.facing);
  const fz = Math.cos(v.facing);
  const inWay = (o) => {
    const dx = o.x - v.x;
    const dz = o.z - v.z;
    const forward = dx * fx + dz * fz;
    if (forward <= 0 || forward > BRAKE_RANGE) return false;
    // Sideways offset: only things actually in the lane count. A crowd on
    // the pavement is not a reason to stop.
    return Math.abs(dx * fz - dz * fx) <= (o.radius ?? 1) + v.radius;
  };
  // Anybody still alive, sedated or not — a body lying in the road is
  // exactly the thing you would want a car to notice.
  for (const o of obstacles) if (!o.dead && inWay(o)) return true;
  // And whatever is in front of you, including the burnt-out shell of the
  // car that was there a minute ago.
  for (const o of vehicles) if (o !== v && inWay(o)) return true;
  return false;
}

/** How much a wreck does to somebody standing that far from it. */
export function blastAt(distance) {
  if (distance > WRECK_RADIUS) return 0;
  // Falls off hard. Next to one is fatal; the far side of the street is a
  // bad afternoon.
  return WRECK_DAMAGE * (1 - distance / WRECK_RADIUS) ** 1.5;
}

/** Everyone a wreck reaches, with what it does to each of them. */
export function blastVictims(vehicle, actors) {
  const out = [];
  for (const a of actors) {
    if (a.dead) continue;
    const amount = blastAt(dist(a.x, a.z, vehicle.x, vehicle.z));
    if (amount > 0) out.push({ actor: a, amount });
  }
  return out;
}
