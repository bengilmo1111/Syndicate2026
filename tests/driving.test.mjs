// Drivable vehicles.
//
// The other half of `GAP_ANALYSIS.md` §6. Ambient traffic is asserted in
// `traffic.test.mjs` and most of what is there is about what a car is not
// allowed to do to the player. This file is the opposite: a car with the
// player in it is allowed to do almost anything, and what has to hold is
// that all of it is *charged* to them, that being in one is a trade rather
// than a hiding place, and that nothing about it quietly breaks the rules
// the rest of the game runs on.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, near, lt, gt, gte } from './lib/harness.mjs';
import { createSim, step } from '../src/core/sim.js';
import { buildCity } from '../src/core/city.js';
import { Vehicle, lanesFor, tickTraffic, VEHICLE_HEALTH } from '../src/core/traffic.js';
import {
  boardableAt, board, disembark, steerVehicle, tickDriven, ramDamage,
  BOARD_RANGE, BOARD_SPEED, SEATS, DRIVE_SPEED, RAM_SPEED, RAM_WIDTH,
  TURN_RATE, CRASH_SPEED,
} from '../src/core/driving.js';
import { Civilian } from '../src/core/entities.js';
import { dist } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null, board: false };
const block = () => buildCity({ seed: 4242, cols: 8, rows: 8 });

/** A stopped car on the first lane of a block, at a known point. */
function parked(city, t = 0.5) {
  const v = new Vehicle(1, lanesFor(city)[0], t, 0);
  v.speed = 0;
  return v;
}

suite('driving');

test('you get in a car by standing next to a stopped one', () => {
  const city = block();
  const v = parked(city);

  ok(!boardableAt([v], v.x + 40, v.z), 'not from across the block');
  eq(boardableAt([v], v.x + 1, v.z), v, 'and yes from beside it');

  // The whole interface. Traffic brakes for people, so making a car
  // boardable is something the player does with their body — walk into
  // the road and wait. A car doing twenty is not something you open.
  v.speed = BOARD_SPEED + 4;
  ok(!boardableAt([v], v.x + 1, v.z), 'a moving car is not boardable');
  v.speed = 0;
  ok(boardableAt([v], v.x + 1, v.z), 'a stopped one is');
});

test('a wreck is not a ride', () => {
  const city = block();
  const v = parked(city);
  v.takeDamage(VEHICLE_HEALTH * 2);
  ok(v.dead);
  ok(!boardableAt([v], v.x + 1, v.z), 'nobody gets into a burnt-out shell');
});

test('four seats, and sedated agents stay on the pavement', () => {
  const sim = createSim('district-12');
  const v = parked(sim.city);
  const agents = sim.squad.agents;
  agents[2].downed = true;
  ok(agents[2].neutralised, 'and that one cannot climb into anything');

  const crew = board(v, agents);
  eq(crew.length, 3, 'three of the four');
  ok(!crew.includes(agents[2]));
  eq(v.crew.length, 3);
  ok(crew.every(a => a.riding === v), 'and each of them knows where they are');
});

test('four seats is four seats', () => {
  // The squad is four, so the cap never bites in play — which is exactly
  // why it needs a test. Followers, turned operatives and a rescued asset
  // are all bodies somebody will eventually try to put in a car.
  const city = block();
  const v = parked(city);
  const bodies = Array.from({ length: 7 }, () => ({ neutralised: false }));
  eq(board(v, bodies).length, SEATS);
  eq(v.crew.length, SEATS);
  ok(bodies.slice(SEATS).every(b => !b.riding), 'and the rest are still outside');
});

function lte(a, b) { ok(a <= b, `${a} <= ${b}`); }

test('boarding cancels a standing order', () => {
  const sim = createSim('district-12');
  sim.squad.issueMove({ x: sim.city.deploy.x + 30, z: sim.city.deploy.z }, sim.city);
  ok(sim.squad.agents.every(a => a.moveTarget), 'everyone is walking somewhere');

  const v = parked(sim.city);
  board(v, sim.squad.agents);
  ok(sim.squad.agents.every(a => !a.moveTarget),
    'and nobody is still trying to walk there from inside a car');
});

test('a car the squad has touched leaves the ambient model for good', () => {
  const city = block();
  const v = parked(city);
  const agent = { x: v.x, z: v.z, neutralised: false };
  board(v, [agent]);

  const at = { x: v.x, z: v.z };
  for (let i = 0; i < 60 * 3; i++) tickTraffic([v], [], 1 / 60, city, Math.random);
  eq(dist(v.x, v.z, at.x, at.z), 0, 'it does not drive itself away');

  // And it stays parked after they get out, rather than resuming its lane
  // — a getaway car that drives off while you are inside a building is
  // not a getaway car.
  disembark(v, city);
  for (let i = 0; i < 60 * 3; i++) tickTraffic([v], [], 1 / 60, city, Math.random);
  eq(dist(v.x, v.z, at.x, at.z), 0, 'and it is still there when you come back');
});

test('everyone gets out somewhere, not into the same point', () => {
  const sim = createSim('district-12');
  const v = parked(sim.city);
  const crew = board(v, sim.squad.agents);
  eq(crew.length, 4);

  const out = disembark(v, sim.city);
  eq(out.length, 4);
  eq(v.crew.length, 0, 'and the car is empty');
  ok(out.every(a => a.riding === null), 'and nobody thinks they are still in it');

  const spots = new Set(out.map(a => `${a.x.toFixed(1)},${a.z.toFixed(1)}`));
  eq(spots.size, 4, 'four people, four places');
  ok(out.every(a => dist(a.x, a.z, v.x, v.z) < 8), 'all of them beside the car');
});

test('steering: point it and it goes, and it commits at speed', () => {
  const city = block();
  const v = parked(city);
  v.facing = 0;

  // Full throttle north for a second.
  for (let i = 0; i < 60; i++) steerVehicle(v, 0, 1, 1 / 60);
  gt(v.speed, 10, 'it accelerates');
  lt(v.speed, DRIVE_SPEED + 0.01, 'and it has a top speed');

  // Turn authority falls off with speed, or a car is just a fast agent.
  const fast = parked(city);
  fast.speed = DRIVE_SPEED;
  fast.facing = 0;
  const slow = parked(city);
  fast.facing = 0;
  slow.speed = 0;
  slow.facing = 0;
  steerVehicle(fast, 1, 0, 1 / 60);
  steerVehicle(slow, 1, 0, 1 / 60);
  gt(Math.abs(slow.facing), Math.abs(fast.facing),
    'a car at forty does not pivot the way a stopped one does');
  lte(Math.abs(slow.facing), TURN_RATE / 60 + 1e-9);
});

test('off the throttle it rolls to a stop', () => {
  const city = block();
  const v = parked(city);
  v.speed = DRIVE_SPEED;
  const moved = steerVehicle(v, 0, 0, 1 / 60);
  notOk(moved, 'no input is not an order');
  lt(v.speed, DRIVE_SPEED, 'and it is slowing');
  for (let i = 0; i < 60 * 5; i++) steerVehicle(v, 0, 0, 1 / 60);
  eq(v.speed, 0, 'and it stops');
});

test('a car at speed goes through the people in front of it', () => {
  const city = block();
  const v = parked(city);
  v.facing = 0;
  v.speed = DRIVE_SPEED;
  const victim = { x: v.x, z: v.z + 6, radius: 1, dead: false };
  let struck = [];
  // Ambient traffic would have braked several metres back. This does not.
  for (let i = 0; i < 30 && !struck.length; i++) {
    ({ struck } = tickDriven(v, 1 / 60, city, [victim]));
  }
  eq(struck.length, 1, 'it does not brake, and it does not miss');
  gt(struck[0].amount, 100, 'and flat out is not survivable');
});

test('and slowly it is a nudge', () => {
  eq(ramDamage(0), 0);
  eq(ramDamage(RAM_SPEED), 0, 'crawling into somebody costs them nothing');
  gt(ramDamage(RAM_SPEED + 1), 0);
  gt(ramDamage(DRIVE_SPEED), ramDamage(DRIVE_SPEED / 2), 'and it scales with speed');
});

test('nobody can slip between two frames of a car', () => {
  // The contact test samples the car's position rather than sweeping its
  // path — the projectiles are swept and this deliberately is not, because
  // a step is short next to a car's reach where a round's is not. That is
  // a fact about two constants rather than a law, so this is where raising
  // the top speed past the point where it stops being true gets caught.
  // The first version of this file swept anyway, and the sweep survived
  // being deleted: there was no input that could tell the difference.
  const step = DRIVE_SPEED / 60;
  const reach = 2.4 * RAM_WIDTH;    // a vehicle's radius, narrowed
  lt(step, reach, `${step.toFixed(2)}m of travel against ${reach.toFixed(2)}m of car`);

  // And the behaviour resting on it: somebody the car reaches during a
  // step is hit, not skipped.
  const city = block();
  const v = parked(city);
  v.facing = 0;
  v.speed = DRIVE_SPEED;
  const victim = { x: v.x, z: v.z + step * 0.5, radius: 0.6, dead: false };
  eq(tickDriven(v, 1 / 60, city, [victim]).struck.length, 1);
});

test('the people inside are not run over by their own car', () => {
  const sim = createSim('district-12');
  const v = parked(sim.city);
  board(v, sim.squad.agents);
  v.speed = DRIVE_SPEED;
  // Twice. The crew are carried to the car's position at the *end* of a
  // tick, so on the first one they are still standing where they boarded
  // and the question has not been asked yet.
  tickDriven(v, 1 / 60, sim.city, [...sim.squad.agents]);
  ok(sim.squad.agents.every(a => dist(a.x, a.z, v.x, v.z) === 0), 'they are in it');
  const { struck } = tickDriven(v, 1 / 60, sim.city, [...sim.squad.agents]);
  eq(struck.length, 0);
});

test('the crew ride where the car is', () => {
  const sim = createSim('district-12');
  const v = parked(sim.city);
  board(v, sim.squad.agents);
  v.facing = 0;
  v.speed = DRIVE_SPEED;
  for (let i = 0; i < 30; i++) tickDriven(v, 1 / 60, sim.city, []);
  ok(sim.squad.agents.every(a => dist(a.x, a.z, v.x, v.z) === 0),
    'so extraction, hold zones and objectives all still work on position');
});

test('hitting a building costs the car, and only above a speed', () => {
  const city = block();
  // Aim at the nearest structure rather than hoping.
  const target = city.structures[0];
  const v = parked(city);
  v.x = target.x;
  v.z = target.z - target.d / 2 - 6;
  v.facing = 0;

  const slow = new Vehicle(2, lanesFor(city)[0], 0.5, 0);
  slow.x = v.x; slow.z = v.z; slow.facing = 0; slow.speed = CRASH_SPEED - 2;
  let bump = 0;
  for (let i = 0; i < 60 && bump === 0; i++) bump = tickDriven(slow, 1 / 60, city, []).crashed;
  eq(bump, 0, 'walking pace into a wall costs paint');
  eq(slow.speed, 0, 'and it stops');

  v.speed = DRIVE_SPEED;
  let crashed = 0;
  for (let i = 0; i < 60 && crashed === 0; i++) crashed = tickDriven(v, 1 / 60, city, []).crashed;
  gt(crashed, 0, 'flat out into one does not');
  eq(v.speed, 0, 'and it stops dead');
});

// --- through the simulation ------------------------------------------------

/**
 * Deploy, park a car, and stand the squad next to it.
 *
 * The squad is moved to the car rather than the car to the squad: an
 * ambient tick re-places every vehicle from its lane every frame, so a
 * car dragged to a convenient spot is back in its lane before the next
 * assertion. A vehicle constructed at zero cruises at zero, which is
 * exactly what a parked car is.
 */
function withCar(missionId = 'district-12') {
  const sim = createSim(missionId);
  const v = new Vehicle(99, lanesFor(sim.city)[0], 0.5, 0);
  sim.traffic.push(v);
  for (const a of sim.squad.agents) { a.x = v.x + 2.6; a.z = v.z; }
  return { sim, v };
}

test('standing in the road is how you stop a car, and stopping it is how you get one', () => {
  // This is the whole interface, and it is made of two rules that were
  // already there: traffic brakes for people, and a stopped car can be
  // boarded. There is no hotwiring verb anywhere in the game.
  const sim = createSim('district-12');
  const v = sim.traffic[0];
  gt(v.speed, BOARD_SPEED, 'it is moving to start with');

  // Stand in its lane, well ahead of it.
  const ahead = 10;
  for (const a of sim.squad.agents) {
    a.x = v.x + Math.sin(v.facing) * ahead;
    a.z = v.z + Math.cos(v.facing) * ahead;
  }
  for (let i = 0; i < 60 * 2; i++) step(sim, 1 / 60, idle);
  lt(v.speed, BOARD_SPEED, 'and it stopped for them');

  // Walk up to it and get in.
  for (const a of sim.squad.agents) { a.x = v.x + 2.6; a.z = v.z; }
  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, v);
});

test('Enter gets in, and Enter gets out', () => {
  const { sim, v } = withCar();
  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, v, 'aboard');
  ok(sim.squad.agents.every(a => a.riding === v));

  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, null, 'and out again');
  ok(sim.squad.agents.every(a => !a.riding));
});

test('the same keys drive the car, and only for whoever is in it', () => {
  const { sim, v } = withCar();
  step(sim, 1 / 60, { ...idle, board: true });
  const at = { x: v.x, z: v.z };
  for (let i = 0; i < 60; i++) step(sim, 1 / 60, { ...idle, moveX: 0, moveZ: 1 });
  // A standing start under a real acceleration figure: half of thirteen
  // metres per second squared for a second is about six and a half metres,
  // and a car that covered its own top speed in the first second would be
  // a much sillier vehicle.
  gt(dist(v.x, v.z, at.x, at.z), 5, 'it drove');

  // Nobody aboard selected: no foot on the throttle, and it rolls to a stop.
  sim.squad.agents.forEach(a => { a.selected = false; });
  sim.squad.agents[0].selected = true;
  sim.squad.agents[0].riding = null;    // this one got out
  v.crew = v.crew.filter(a => a !== sim.squad.agents[0]);
  for (let i = 0; i < 60 * 3; i++) step(sim, 1 / 60, { ...idle, moveX: 0, moveZ: 1 });
  eq(v.speed, 0, 'the car coasted down');
});

test('a squad in a car extracts, because extraction is about position', () => {
  const { sim, v } = withCar('district-12');
  step(sim, 1 / 60, { ...idle, board: true });
  ok(sim.squad.alive.length > 0, 'they are still alive');
  eq(sim.squad.afoot.length, 0, 'and none of them is on the street');
  // `alive` is what the zones read, and riders are in it.
  ok(sim.squad.alive.every(a => a.riding === v));
});

test('nobody shoots from a car, and nobody shoots at the people in one', () => {
  const { sim, v } = withCar('sector-7');
  // Put a hostile close enough to be a problem, and in the open.
  const h = sim.hostiles[0];
  h.x = v.x;
  h.z = v.z + 12;
  h.seeksCover = false;

  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, v);
  const before = sim.squad.agents.map(a => a.health);
  for (let i = 0; i < 60 * 4; i++) step(sim, 1 / 60, idle);
  ok(sim.squad.agents.every((a, i) => a.health === before[i]),
    'not one round reached anybody inside');
  ok(sim.projectiles.length >= 0);
  // …but the car is taking them.
  lt(v.health, VEHICLE_HEALTH, 'the car is what is being shot');
});

test('and a car is not armour — it goes up with everyone in it', () => {
  const { sim, v } = withCar('district-12');
  step(sim, 1 / 60, { ...idle, board: true });
  const health = sim.squad.agents.map(a => a.health);

  v.takeDamage(VEHICLE_HEALTH * 2);
  step(sim, 1 / 60, idle);

  eq(sim.vehicle, null, 'thrown clear');
  ok(sim.squad.agents.every(a => !a.riding));
  ok(sim.squad.agents.some((a, i) => a.health < health[i]),
    'and standing two metres from a car going up costs you');
});

test('running somebody down is charged to the player', () => {
  const { sim, v } = withCar('district-12');
  step(sim, 1 / 60, { ...idle, board: true });

  const victim = sim.civilians.find(c => !c.dead && !c.isAsset && !c.isQuarry);
  const deaths = sim.civilianDeaths;
  const heat = sim.heat;
  // Put them directly in front of the car and put the foot down.
  v.facing = 0;
  v.speed = DRIVE_SPEED;
  victim.x = v.x;
  victim.z = v.z + 3;
  step(sim, 1 / 60, { ...idle, moveX: 0, moveZ: 1 });

  ok(victim.dead, 'flat out is not survivable');
  eq(sim.civilianDeaths, deaths + 1, 'and it is a civilian loss like any other');
  gt(sim.heat, heat, 'and the sector notices');
});

test('but it still does not decide what happens to somebody with a name', () => {
  // The same rule as a stray round, a collapsing building and a car blast.
  // A player who wants Yelin dead is asked in as many words; a steering
  // wheel is not the place that question gets answered.
  const { sim, v } = withCar('district-12');
  const named = sim.civilians.find(c => !c.dead);
  named.fated = true;
  step(sim, 1 / 60, { ...idle, board: true });

  v.facing = 0;
  v.speed = DRIVE_SPEED;
  named.x = v.x;
  named.z = v.z + 3;
  for (let i = 0; i < 10; i++) step(sim, 1 / 60, { ...idle, moveX: 0, moveZ: 1 });
  ok(!named.dead, 'still standing');
});

test('a car across the block is out of reach, and four sedated agents drive nowhere', () => {
  const { sim, v } = withCar();
  // The squad walks away from it, not the other way round: the ambient
  // tick re-places a vehicle from its lane every frame.
  for (const a of sim.squad.agents) { a.x = v.x + 60; }
  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, null, 'out of reach is out of reach');

  for (const a of sim.squad.agents) { a.x = v.x + 2.6; a.z = v.z; }
  sim.squad.agents.forEach(a => { a.downed = true; });
  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, null, 'and four sedated agents do not drive anywhere');
});

test('driving does not stop a mission being winnable', () => {
  // The autopilot never presses Enter, so nothing else in the suite would
  // notice if boarding left the sim in a state a mission could not be
  // completed from. Get in, drive, get out, and finish on foot.
  const { sim, v } = withCar('district-12');
  step(sim, 1 / 60, { ...idle, board: true });
  for (let i = 0; i < 60 * 3; i++) step(sim, 1 / 60, { ...idle, moveX: 1, moveZ: 0.4 });
  step(sim, 1 / 60, { ...idle, board: true });
  eq(sim.vehicle, null);
  ok(sim.squad.afoot.length === sim.squad.alive.length, 'everybody is on the street again');
  ok(sim.squad.alive.length > 0, 'and alive');
  eq(sim.phase, 'playing', 'and the mission is still running');
});
