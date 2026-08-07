// Ambient traffic.
//
// `GAP_ANALYSIS.md` §6 says ambient traffic alone buys most of a city's
// atmosphere for a fraction of the work of drivable vehicles. The risk in
// that trade is that "atmosphere" quietly becomes "a random punishment
// wandering around the map", so most of what is asserted here is about
// what traffic is *not* allowed to do to the player.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, near, lt, gt, gte } from './lib/harness.mjs';
import { createSim, step } from '../src/core/sim.js';
import { buildCity } from '../src/core/city.js';
import {
  newTraffic, tickTraffic, lanesFor, blastAt, blastVictims, Vehicle,
  SPEED_MIN, WRECK_RADIUS, VEHICLE_HEALTH, BRAKE_RANGE,
} from '../src/core/traffic.js';
import { dist, makeRng } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };
const block = () => buildCity({ seed: 4242, cols: 8, rows: 8 });

suite('traffic');

test('every lane is a street, and both directions exist', () => {
  const city = block();
  const lanes = lanesFor(city);
  eq(lanes.length, (city.streetsX.length + city.streetsZ.length) * 2,
    'two lanes per centreline');

  // Offset off the centreline, or opposing traffic drives through itself.
  const north = lanes.filter(l => l.axis === 'x' && l.dir > 0);
  const south = lanes.filter(l => l.axis === 'x' && l.dir < 0);
  ok(north.every(n => south.every(s => s.at !== n.at)), 'nobody shares a lane');
});

test('traffic drives, and keeps driving', () => {
  const city = block();
  // A varied rng, because a constant one would put every car on the same
  // lane at the same point and the test would be about the jam.
  let n = 0;
  const cars = newTraffic(city, 6, () => ((n += 0.37) % 1));
  const start = cars.map(c => ({ x: c.x, z: c.z }));
  // Seeded, not `Math.random`. A car that runs off the end of its lane
  // picks a new one, and an unseeded pick can drop it onto a lane behind
  // another car — at which point it correctly brakes, and this test
  // correctly fails, for a reason that has nothing to do with what it is
  // asserting. It failed roughly one run in four, which is worse than a
  // test that fails always.
  const rng = makeRng(90210);
  for (let i = 0; i < 60 * 4; i++) tickTraffic(cars, [], 1 / 60, city, rng);
  ok(cars.every((c, i) => dist(c.x, c.z, start[i].x, start[i].z) > 20),
    'everything moved a long way');
  ok(cars.every(c => c.speed >= SPEED_MIN * 0.9), 'and nothing has stalled');
});

test('a block does not open with a jam nobody caused', () => {
  // Two cars on the same lane at the same point brake for each other
  // forever. Left to the rng alone that is a coin toss on every block, so
  // the starting position is stratified by index — which a degenerate rng
  // is the only way to actually test.
  const city = block();
  const cars = newTraffic(city, 6, () => 0.5);
  const spots = new Set(cars.map(c => `${c.x.toFixed(1)},${c.z.toFixed(1)}`));
  eq(spots.size, cars.length, 'no two cars start in the same place');

  for (let i = 0; i < 60 * 3; i++) tickTraffic(cars, [], 1 / 60, city, () => 0.5);
  ok(cars.some(c => c.speed > SPEED_MIN * 0.5), 'and the street is moving');
});

test('a car stays inside the block', () => {
  const city = block();
  const cars = newTraffic(city, 8, Math.random);
  for (let i = 0; i < 60 * 90; i++) tickTraffic(cars, [], 1 / 60, city, Math.random);
  for (const c of cars) {
    lt(Math.abs(c.x), city.halfW + 2, 'inside the block on x');
    lt(Math.abs(c.z), city.halfD + 2, 'and on z');
  }
});

test('a car brakes for somebody standing in the road', () => {
  // Not "runs them down". These are autonomous in 2041, braking is what
  // they are for, and a game that kills your own agents with random
  // background traffic is a game with a random punishment in it. Standing
  // in the road stops the road, which is a tactic rather than an accident.
  const city = block();
  const lane = lanesFor(city).find(l => l.axis === 'x' && l.dir > 0);
  const car = new Vehicle(1, lane, 0.4, SPEED_MIN);
  const person = { x: car.x, z: car.z + BRAKE_RANGE * 0.5, radius: 1.2, dead: false };

  for (let i = 0; i < 60; i++) tickTraffic([car], [person], 1 / 60, city, Math.random);
  near(car.speed, 0, 0.01, 'stopped');
  lt(dist(car.x, car.z, person.x, person.z), BRAKE_RANGE + 2, 'and stopped short of them');
  ok(!person.dead, 'and did not run them over');
});

test('and gets going again once the road is clear', () => {
  const city = block();
  const lane = lanesFor(city).find(l => l.axis === 'x' && l.dir > 0);
  const car = new Vehicle(1, lane, 0.4, SPEED_MIN);
  const person = { x: car.x, z: car.z + 6, radius: 1.2, dead: false };
  for (let i = 0; i < 60; i++) tickTraffic([car], [person], 1 / 60, city, Math.random);
  person.z += 400;
  for (let i = 0; i < 60 * 3; i++) tickTraffic([car], [person], 1 / 60, city, Math.random);
  gt(car.speed, SPEED_MIN * 0.9, 'back up to speed');
});

test('a crowd on the pavement is not a reason to stop', () => {
  const city = block();
  const lane = lanesFor(city).find(l => l.axis === 'x' && l.dir > 0);
  const car = new Vehicle(1, lane, 0.4, SPEED_MIN);
  // Beside the lane, not in it.
  const crowd = [2, 4, 6].map(i => ({
    x: car.x + 9, z: car.z + i, radius: 1.2, dead: false,
  }));
  for (let i = 0; i < 60; i++) tickTraffic([car], crowd, 1 / 60, city, Math.random);
  gt(car.speed, SPEED_MIN * 0.9, 'straight past them');
});

test('a queue does not pile into itself', () => {
  const city = block();
  const lane = lanesFor(city).find(l => l.axis === 'x' && l.dir > 0);
  const lead = new Vehicle(1, lane, 0.4, SPEED_MIN);
  const behind = new Vehicle(2, lane, 0.38, SPEED_MIN);
  const person = { x: lead.x, z: lead.z + 5, radius: 1.2, dead: false };

  for (let i = 0; i < 60 * 3; i++) tickTraffic([lead, behind], [person], 1 / 60, city, Math.random);
  gt(dist(lead.x, lead.z, behind.x, behind.z), lead.radius, 'they are not inside each other');
  near(behind.speed, 0, 0.01, 'and the one behind stopped too');
});

suite('wrecks');

test('a car is worth shooting, and not a project', () => {
  // Two bursts. A car that soaks a magazine is a wall; a car that pops on
  // one round is a trap.
  gte(VEHICLE_HEALTH, 60, 'not a balloon');
  lt(VEHICLE_HEALTH, 200, 'and not a building');
});

test('a wreck is reported once, then blocks the lane', () => {
  const city = block();
  const lane = lanesFor(city).find(l => l.axis === 'x' && l.dir > 0);
  const car = new Vehicle(1, lane, 0.4, SPEED_MIN);
  car.takeDamage(VEHICLE_HEALTH + 10);

  const first = tickTraffic([car], [], 1 / 60, city, Math.random);
  eq(first.length, 1, 'it blew up');
  const second = tickTraffic([car], [], 1 / 60, city, Math.random);
  eq(second.length, 0, 'once');

  const where = { x: car.x, z: car.z };
  for (let i = 0; i < 60 * 4; i++) tickTraffic([car], [], 1 / 60, city, Math.random);
  near(car.x, where.x, 0.01, 'and it does not drive off afterwards');
  near(car.z, where.z, 0.01, 'at all');
});

test('the blast is fatal on top of it and survivable across the street', () => {
  gte(blastAt(0), 90, 'standing on one is not a plan');
  lt(blastAt(WRECK_RADIUS * 0.7), 30, 'the far side of the street is a bad afternoon');
  eq(blastAt(WRECK_RADIUS + 1), 0, 'and past it is nothing');
  lt(blastAt(5), blastAt(1), 'it falls off');
});

test('a wreck reaches whoever is near it, on any side', () => {
  const city = block();
  const car = new Vehicle(1, lanesFor(city)[0], 0.5, SPEED_MIN);
  const near_ = { x: car.x + 2, z: car.z, dead: false };
  const far = { x: car.x + WRECK_RADIUS * 3, z: car.z, dead: false };
  const victims = blastVictims(car, [near_, far]);
  eq(victims.length, 1, 'only the one standing beside it');
  eq(victims[0].actor, near_);
});

suite('traffic in play');

test('a mission on a live street has traffic on it', () => {
  const sim = createSim('district-12');
  gte(sim.traffic.length, 6, 'the road is a road');
  ok(sim.traffic.every(v => !v.dead), 'and nothing starts wrecked');
});

test('the tutorial does not', () => {
  // Mission one teaches. A car detonating during the tutorial is a
  // distraction from the four things it is trying to say.
  eq(createSim('sector-7').traffic.length, 0);
});

test('a round that hits a car stops at the car', () => {
  // Which is what makes shooting past a lane of traffic a different
  // problem from shooting across an empty street.
  const sim = createSim('district-12');
  const car = sim.traffic[0];
  const agent = sim.squad.agents[0];
  agent.x = car.x;
  agent.z = car.z - 14;
  const before = car.health;

  for (let i = 0; i < 60 * 2; i++) {
    step(sim, 1 / 60, { ...idle, firing: true, aimPoint: { x: car.x, z: car.z } });
  }
  lt(car.health, before, 'the car took it');
});

test('a wreck does not decide what happens to somebody with a name', () => {
  // The same rule as every other incidental. A car going up on the far
  // side of the street must not close the Okafor contract, and must not
  // convert one of Yelin's three endings into a corpse.
  const sim = createSim('okafor-contract');
  const okafor = sim.quarry[0];
  const car = sim.traffic[0];
  car.x = okafor.x + 1;
  car.z = okafor.z;
  const before = okafor.health;

  car.takeDamage(VEHICLE_HEALTH + 10);
  for (let i = 0; i < 30; i++) step(sim, 1 / 60, idle);
  eq(okafor.health, before, 'she is untouched');
  notOk(okafor.dead, 'and alive');
});

test('blowing up a car is loud, and the sector notices', () => {
  const sim = createSim('district-12');
  const before = sim.heat;
  sim.traffic[0].takeDamage(VEHICLE_HEALTH + 10);
  step(sim, 1 / 60, idle);
  gt(sim.heat, before, 'heat climbs');
});

test('traffic never stops a mission being winnable', () => {
  // The whole risk of this feature: atmosphere that quietly becomes an
  // obstacle. Every mission that has traffic still has to be playable by
  // the same dumb bot that plays the rest.
  for (const id of ['district-12', 'okafor-contract', 'run-south']) {
    gte(createSim(id).traffic.length, 6, `${id}: has traffic`);
  }
});
