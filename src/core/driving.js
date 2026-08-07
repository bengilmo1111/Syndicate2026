// Drivable vehicles — the other half of `GAP_ANALYSIS.md` §6.
//
// Ambient traffic shipped first because it buys most of the atmosphere for
// a fraction of the work (`src/core/traffic.js`). This is the rest of it:
// the squad can get in one and drive it.
//
// The whole design turns on one thing that was already true. Ambient
// traffic **brakes for people**, so a car will stop for anybody standing
// in the road — which means the way you get a vehicle is to walk into the
// street and wait for one. No hotwiring verb, no ownership model, no
// "press E to steal". You stand in front of it, it stops, you get in.
//
// And then it stops braking. A car with the player in it does not slow
// down for the crowd, because that is the player's foot on the floor and
// the game has been about what you are prepared to do to people since the
// first briefing. A pedestrian at forty is not an accident the simulation
// had; it is something you did, and it is charged to you like everything
// else.
//
// Pure core: no Three.js, no DOM.

import { dist, clamp, angleDelta } from './math.js';
import { resolveCollision } from './city.js';

/** How close an agent has to be to a stopped car to get into it. */
export const BOARD_RANGE = 5.5;

/**
 * How slowly a car has to be going before anyone can board.
 *
 * Not a difficulty knob — it is the whole interface. Traffic brakes for
 * people, so the way to make a car boardable is to stand in front of it.
 */
export const BOARD_SPEED = 1.2;

/** Four agents, four seats. There is no fifth thing to put in a car. */
export const SEATS = 4;

/** Flat out. Comfortably faster than a surged agent can run. */
export const DRIVE_SPEED = 27;
export const DRIVE_ACCEL = 13;
/** Off the throttle it rolls to a stop rather than stopping dead. */
export const DRIVE_COAST = 11;

/** Turn authority at a standstill, in radians per second. */
export const TURN_RATE = 2.4;
/** How much of it is left at full speed. A car at forty does not pivot. */
export const TURN_AT_SPEED = 0.42;

/** Below this, hitting somebody is a nudge. */
export const RAM_SPEED = 5;
/** What flat out does to a person. It is not survivable, which is the point. */
export const RAM_DAMAGE = 140;

/** Below this, hitting a wall costs paint. */
export const CRASH_SPEED = 11;
/** Damage per metre-per-second over that, to the car. */
export const CRASH_DAMAGE = 5.5;

/**
 * The nearest car somebody standing here could get into.
 *
 * Moving cars are excluded rather than made harder to catch: a car doing
 * twenty is not something you jog alongside and open, and the game already
 * has a way to stop one.
 */
export function boardableAt(vehicles, x, z, range = BOARD_RANGE) {
  let best = null;
  let bestD = range;
  for (const v of vehicles) {
    if (v.dead || v.crew?.length) continue;
    if (v.speed > BOARD_SPEED) continue;
    const d = dist(x, z, v.x, v.z) - v.radius;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

/**
 * Put people in a car.
 *
 * Sedated agents stay on the pavement. `neutralised` means "not on their
 * feet", and somebody who cannot walk cannot climb into a vehicle either —
 * the alternative is a squad that carries its own casualties, which is a
 * different game and a much longer one.
 */
export function board(vehicle, agents) {
  if (vehicle.dead) return [];
  const crew = agents.filter(a => !a.neutralised).slice(0, SEATS);
  if (!crew.length) return [];
  vehicle.crew = crew;
  // Sticky, and deliberately never cleared: a car the player has touched
  // stays theirs to come back to. Ambient traffic that resumed its lane
  // the moment you stepped out would drive your getaway car away.
  vehicle.driven = true;
  vehicle.speed = 0;
  for (const a of crew) {
    a.riding = vehicle;
    a.moveTarget = null;
    a.path = null;
    a.finalGoal = null;
    a.walking = false;
  }
  return crew;
}

/**
 * Get out, and stand somewhere.
 *
 * Beside the car rather than inside it: `resolveCollision` would happily
 * leave four agents stacked on the same point, and a squad that
 * disembarks into a single pile is a squad the player has to untangle
 * before they can do anything.
 */
export function disembark(vehicle, city) {
  const crew = vehicle.crew ?? [];
  const side = vehicle.radius + 1.9;
  crew.forEach((a, i) => {
    const door = vehicle.facing + (i % 2 ? -Math.PI / 2 : Math.PI / 2);
    const back = Math.floor(i / 2) * 2.4;
    a.x = vehicle.x + Math.sin(door) * side - Math.sin(vehicle.facing) * back;
    a.z = vehicle.z + Math.cos(door) * side - Math.cos(vehicle.facing) * back;
    a.facing = vehicle.facing;
    a.riding = null;
    if (city) resolveCollision(city, a);
  });
  vehicle.crew = [];
  vehicle.speed = 0;
  return crew;
}

/** Everyone aboard rides where the car is. */
export function carryCrew(vehicle) {
  for (const a of vehicle.crew ?? []) {
    a.x = vehicle.x;
    a.z = vehicle.z;
    a.facing = vehicle.facing;
    a.walking = false;
  }
}

/**
 * Throttle and steering, from the same camera-relative vector that walks
 * an agent. Point it where you want to go and it goes there.
 *
 * Steering authority falls off with speed. Without that, a car at full
 * speed pivots on the spot and handles exactly like an agent who happens
 * to be quick — the speed is the only thing you would feel, and none of
 * the commitment.
 */
export function steerVehicle(vehicle, dirX, dirZ, dt) {
  const mag = Math.hypot(dirX, dirZ);
  if (mag < 0.01) {
    vehicle.speed = Math.max(0, vehicle.speed - DRIVE_COAST * dt);
    return false;
  }
  const want = Math.atan2(dirX / mag, dirZ / mag);
  const rate = TURN_RATE * (1 - (1 - TURN_AT_SPEED) * (vehicle.speed / DRIVE_SPEED));
  vehicle.facing += clamp(angleDelta(vehicle.facing, want), -rate * dt, rate * dt);
  vehicle.speed = Math.min(DRIVE_SPEED, vehicle.speed + DRIVE_ACCEL * dt);
  return true;
}

/** What a car doing this speed does to a person. */
export function ramDamage(speed) {
  if (speed <= RAM_SPEED) return 0;
  return RAM_DAMAGE * ((speed - RAM_SPEED) / (DRIVE_SPEED - RAM_SPEED));
}

/**
 * How wide a car's contact is, as a fraction of its collision radius.
 *
 * Under a metre narrower than the body, so somebody hugging the kerb as a
 * car goes past is missed rather than mown down by its aura.
 */
export const RAM_WIDTH = 0.8;

/**
 * Move a driven car one step and report what it hit.
 *
 * Sampled at the car's position rather than swept along its path, which
 * the projectiles are and this deliberately is not. A round crosses tens
 * of metres in a step and is a point; a car covers 0.45m flat out at a
 * sixtieth of a second and reaches nearly two and a half metres to each
 * side. It cannot pass through anybody, and a sweep here would be code
 * that no input could ever make a difference to. The margin that makes
 * that true is asserted in `tests/driving.test.mjs` — raise `DRIVE_SPEED`
 * far enough and that test is where you will find out.
 */
export function tickDriven(vehicle, dt, city, actors) {
  vehicle.x += Math.sin(vehicle.facing) * vehicle.speed * dt;
  vehicle.z += Math.cos(vehicle.facing) * vehicle.speed * dt;

  const struck = [];
  const amount = ramDamage(vehicle.speed);
  if (amount > 0) {
    for (const a of actors) {
      if (a.dead || a.riding) continue;
      const d = dist(vehicle.x, vehicle.z, a.x, a.z);
      if (d <= (a.radius ?? 1) + vehicle.radius * RAM_WIDTH) struck.push({ actor: a, amount });
    }
  }

  // Buildings. `resolveCollision` pushes the car back out of whatever it
  // is inside, so any correction at all means contact happened.
  const wasX = vehicle.x;
  const wasZ = vehicle.z;
  resolveCollision(city, vehicle);
  let crashed = 0;
  if (dist(wasX, wasZ, vehicle.x, vehicle.z) > 0.01) {
    if (vehicle.speed > CRASH_SPEED) crashed = (vehicle.speed - CRASH_SPEED) * CRASH_DAMAGE;
    vehicle.speed = 0;
  }

  carryCrew(vehicle);
  return { struck, crashed };
}
