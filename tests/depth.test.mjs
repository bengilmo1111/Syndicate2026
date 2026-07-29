// Weapons, cover, and compute allocation — the systems that turn "walk at
// the enemy and auto-fire" into something with a decision in it.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, near, lt, gte } from './lib/harness.mjs';
import { WEAPONS, DEFAULT_LOADOUT, weapon } from '../src/core/weapons.js';
import {
  Compute, CHANNELS, BUDGET, SURGE_RADIUS, THROTTLED_SPEED,
} from '../src/core/compute.js';
import {
  buildCity, coverAgainst, damageStructure, addLandmark, hasLineOfSight, COVER,
} from '../src/core/city.js';
import { Agent, Civilian, Hostile, Unquantized, Projectile } from '../src/core/entities.js';
import { Squad, resistanceOf, ALIGN_RESISTANCE } from '../src/core/squad.js';
import { createSim, step, PHASE } from '../src/core/sim.js';
import { makeRng, dist } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };

// ------------------------------------------------------------------ weapons

suite('weapons');

test('the default deployment is four different weapons', () => {
  eq(new Set(DEFAULT_LOADOUT).size, 4, 'no two agents carry the same thing');
  for (const id of DEFAULT_LOADOUT) ok(WEAPONS[id], `${id} is a real weapon`);
});

test('a squad picks up its loadout', () => {
  const squad = new Squad(0, 0);
  const carried = squad.agents.map(a => a.weapon.id);
  eq(carried.join(','), DEFAULT_LOADOUT.join(','), 'agents carry the default loadout');
  eq(new Set(squad.agents.map(a => a.damage)).size > 1, true, 'and they hit differently');
});

test('weapons trade range against rate of fire', () => {
  // If these ever collapse into each other the loadout stops being a choice.
  ok(WEAPONS.RAIL.range > WEAPONS.SMG.range * 2, 'the rail rifle reaches');
  ok(WEAPONS.SMG.fireRate < WEAPONS.RAIL.fireRate / 5, 'the SMG cycles');
  ok(WEAPONS.RAIL.spread < WEAPONS.MINIGUN.spread / 10, 'and it is far more accurate');
  gte(WEAPONS.RAIL.pierce, 1, 'the rail rifle passes through bodies');
});

test('a minigun will not fire until it has spun up', () => {
  const a = new Agent(0, 0, 3, 'MINIGUN');
  eq(a.fireAt(0, 10), null, 'cold barrel, no shot');
  a.tickSpin(WEAPONS.MINIGUN.spinUp, true);
  ok(a.fireAt(0, 10), 'spun up, it fires');
});

test('a spun-up barrel winds back down when it stops wanting to fire', () => {
  const a = new Agent(0, 0, 3, 'MINIGUN');
  a.tickSpin(1, true);
  gte(a.spin, WEAPONS.MINIGUN.spinUp, 'fully spun');
  a.tickSpin(1, false);
  eq(a.spin, 0, 'and back down');
});

test('spread deflects the shot, and no-spread weapons fly true', () => {
  const rail = new Agent(0, 0, 2, 'RAIL');
  const shot = rail.fireAt(0, 40, null, () => 0.5); // 0.5 → zero deflection
  near(shot.angle, 0, 1e-9, 'a centred roll is dead straight');

  const mg = new Agent(0, 0, 3, 'MINIGUN');
  mg.tickSpin(1, true);
  const wide = mg.fireAt(0, 40, null, () => 1); // max deflection
  ok(Math.abs(wide.angle) > 0.05, 'a wide roll deflects meaningfully');
});

test('a rail round passes through one body and keeps going', () => {
  const p = new Projectile(0, 0, 0, 46, null);
  p.pierce = 2;
  const a = new Hostile(0, 3, {});
  const b = new Hostile(0, 6, {});
  notOk(p.consumeHit(a), 'not spent on the first body');
  notOk(p.consumeHit(b), 'nor the second');
  ok(p.consumeHit(new Hostile(0, 9, {})), 'spent on the third');
});

test('a round cannot hit the same person twice', () => {
  const p = new Projectile(0, -3, 0, 20, null);
  p.pierce = 3;
  const t = new Hostile(0, 0, {});
  p.prevX = 0; p.prevZ = -3; p.x = 0; p.z = 3;
  ok(p.hits(t), 'first pass connects');
  p.consumeHit(t);
  notOk(p.hits(t), 'the same body is not hit again');
});

// -------------------------------------------------------------------- cover

suite('cover');

test('a wall along your flank shelters you; the same wall head-on does not', () => {
  // Pressed against a wall's south face: shots down the wall (east/west)
  // are partly stopped by it, a shot from due south hits you square.
  const city = buildCity({ seed: 4242, cols: 6, rows: 6 });
  const wall = city.structures.find(s => !s.collapsed);
  const x = wall.x;
  const z = wall.z + wall.d / 2 + 1.0;

  eq(coverAgainst(city, x, z, x + 40, z), COVER.HARD, 'sheltered from the east');
  eq(coverAgainst(city, x, z, x - 40, z), COVER.HARD, 'and from the west');
  eq(coverAgainst(city, x, z, x, z + 40), COVER.NONE, 'square-on from the south, nothing');
});

test('standing in the open is cover from nowhere', () => {
  const city = buildCity({ seed: 4242, cols: 6, rows: 6 });
  const open = { x: city.streetsX[2], z: city.streetsZ[2] };
  for (const [dx, dz] of [[40, 0], [-40, 0], [0, 40], [0, -40], [30, 30]]) {
    eq(coverAgainst(city, open.x, open.z, open.x + dx, open.z + dz), COVER.NONE,
      `no cover from (${dx}, ${dz})`);
  }
});

test('rubble shelters you from shots it no longer blocks', () => {
  // Completes collapse-to-cover: the round now arrives, but it arrives
  // over a pile you are crouched behind.
  const city = buildCity({ seed: 777, cols: 6, rows: 6 });
  const mast = addLandmark(city, { name: 'M', near: { x: 0, z: 0 }, hp: 40, height: 18 });
  const z = mast.z + mast.d / 2 + 1.4; // just south of it
  // Close in, so the mast is the only thing in the line — further back and
  // the test would be measuring some unrelated building instead.
  const from = { x: mast.x, z: mast.z - mast.d / 2 - 3 };

  notOk(hasLineOfSight(city, from.x, from.z, mast.x, z), 'standing, the shot is blocked entirely');

  damageStructure(mast, 40);
  ok(hasLineOfSight(city, from.x, from.z, mast.x, z), 'collapsed, the lane opens');
  eq(coverAgainst(city, mast.x, z, from.x, from.z), COVER.RUBBLE, 'and the rubble still shelters');
});

test('cover reduces damage taken in a live sim, by direction alone', () => {
  const sim = createSim('sector-7');
  // Freeze everything that would otherwise move or shoot, so the only
  // variable left is which side the round arrives from.
  for (const a of sim.squad.agents) a.range = 0;
  const wall = sim.city.structures.find(s => !s.collapsed && s.h > 6);
  const victim = sim.hostiles[0];
  victim.aggroRange = -1;

  // One position, tucked against the wall's south face. Two directions.
  const spot = { x: wall.x, z: wall.z + wall.d / 2 + 1.2 };

  const loss = (from) => {
    victim.x = spot.x; victim.z = spot.z;
    victim.health = victim.maxHealth;
    victim.dead = false;
    fireInto(sim, spot, from);
    return victim.maxHealth - victim.health;
  };

  const exposed = loss({ x: spot.x, z: spot.z + 9 });  // square-on, no cover
  const covered = loss({ x: spot.x + 9, z: spot.z });  // along the wall, sheltered

  gte(exposed, 1, 'the square-on shot landed in full');
  lt(covered, exposed, 'the same shot along the wall hurt less');
  near(covered / exposed, 1 - COVER.HARD, 0.05, 'reduced by exactly the cover value');
});

/** Put a round through `at` from `from`, resolving it against the sim. */
function fireInto(sim, at, from) {
  const angle = Math.atan2(at.x - from.x, at.z - from.z);
  const p = new Projectile(from.x, from.z, angle, 20, null);
  p.friendly = true;
  sim.projectiles.push(p);
  for (let i = 0; i < 40 && !p.dead; i++) step(sim, 1 / 60, idle);
}

// ------------------------------------------------------------------ compute

suite('compute');

test('the budget is conserved no matter how you shuffle it', () => {
  const c = new Compute();
  const total = () => CHANNELS.reduce((n, ch) => n + c.alloc[ch], 0);
  eq(total(), BUDGET, 'starts balanced');
  for (let i = 0; i < 50; i++) {
    c.shiftInto(CHANNELS[i % 3]);
    eq(total(), BUDGET, `still ${BUDGET} after shift ${i}`);
  }
});

test('a channel can be maxed and never exceeds the budget', () => {
  const c = new Compute();
  for (let i = 0; i < 20; i++) c.shiftInto('precision');
  eq(c.alloc.precision, BUDGET, 'all of it in one channel');
  eq(c.alloc.latency + c.alloc.resilience, 0, 'and nothing left elsewhere');
  notOk(c.shiftInto('precision'), 'a full channel refuses more');
});

test('the default allocation is neutral', () => {
  // 2/2/2 must be the identity, or "balanced" silently means "worse".
  const c = new Compute();
  near(c.speedScale, 1.04, 0.05, 'speed is roughly unmodified');
  near(c.spreadScale, 1.4, 0.01, 'spread baseline');
  near(c.damageTakenScale, 0.88, 0.01, 'resilience baseline');
});

test('each channel does what it says', () => {
  const c = new Compute();
  const base = { speed: c.speedScale, spread: c.spreadScale, taken: c.damageTakenScale };

  for (let i = 0; i < 4; i++) c.shiftInto('latency');
  ok(c.speedScale > base.speed, 'LATENCY makes the squad faster');

  const p = new Compute();
  for (let i = 0; i < 4; i++) p.shiftInto('precision');
  lt(p.spreadScale, base.spread, 'PRECISION tightens the shot');
  ok(p.rangeScale > 1, 'and reaches further');

  const r = new Compute();
  for (let i = 0; i < 4; i++) r.shiftInto('resilience');
  lt(r.damageTakenScale, base.taken, 'RESILIENCE soaks more');
});

test('surge amplifies every channel at once', () => {
  const c = new Compute();
  const before = c.speedScale;
  c.toggleSurge();
  ok(c.surging, 'surge is on');
  ok(c.speedScale > before, 'and everything sharpens');
  c.toggleSurge();
  eq(c.speedScale, before, 'toggling back is exact');
});

// -------------------------------------------------------------------- surge

suite('surge');

test('surge throttles the civilians standing near the squad', () => {
  // The cost of surge is other people. If this stops being true, the
  // mechanic is just a free buff and the game loses its argument.
  const sim = createSim('district-12');
  const centre = sim.squad.center();
  const near = sim.civilians.find(c => !c.dead);
  near.x = centre.x + 3; near.z = centre.z + 3;
  const far = sim.civilians.find(c => c !== near);
  far.x = centre.x + SURGE_RADIUS + 40; far.z = centre.z;

  step(sim, 1 / 60, idle);
  notOk(near.throttled, 'nobody is throttled before surge');

  sim.squad.compute.toggleSurge();
  step(sim, 1 / 60, idle);
  ok(near.throttled, 'the civilian beside the squad is throttled');
  notOk(far.throttled, 'the one down the block is not');
  gte(sim.throttledCount, 1, 'and the count is reported for the HUD');
});

test('a throttled civilian actually moves slower', () => {
  const rng = makeRng(5);
  const city = buildCity({ seed: 5, cols: 6, rows: 6 });
  const open = { x: city.streetsX[2], z: city.streetsZ[2] };

  const move = (throttled) => {
    const c = new Civilian(open.x, open.z, makeRng(5));
    c.throttled = throttled;
    c.wanderTarget = { x: open.x, z: open.z - 30 };
    c.restTimer = 0;
    const from = { x: c.x, z: c.z };
    for (let i = 0; i < 60; i++) c.update(1 / 60, city, null, rng);
    return dist(from.x, from.z, c.x, c.z);
  };

  const free = move(false);
  const slowed = move(true);
  gte(free, 0.5, 'the unthrottled civilian covered ground');
  lt(slowed, free, 'the throttled one covered less');
  near(slowed / free, THROTTLED_SPEED, 0.15, 'by roughly the throttle factor');
});

test('holding surge climbs heat on its own, with no shots fired', () => {
  const sim = createSim('district-12');
  eq(sim.heat, 0, 'starts cold');
  sim.squad.compute.toggleSurge();
  for (let i = 0; i < 120; i++) step(sim, 1 / 60, idle);
  gte(sim.heat, 5, 'surging alone draws attention');
  eq(sim.civilianDeaths, 0, 'without anyone being hurt');
});

test('surge is never free — it always costs heat or people', () => {
  const sim = createSim('sector-7');
  sim.squad.compute.toggleSurge();
  const before = sim.heat;
  for (let i = 0; i < 60; i++) step(sim, 1 / 60, idle);
  ok(sim.heat > before, 'the meter moved');
});

// ---------------------------------------------------------- aligner snowball

suite('aligner snowball');

test('resistance rises with what you are trying to convert', () => {
  // Straight from the original: a crowd is free, an operative is not.
  const civ = new Civilian(0, 0, makeRng(1));
  eq(resistanceOf(civ), ALIGN_RESISTANCE.civilian, 'civilians do not resist');
  eq(resistanceOf(new Hostile(0, 0, { faction: 'enforcer' })), ALIGN_RESISTANCE.enforcer,
    'enforcement resists');
  ok(resistanceOf(new Hostile(0, 0, { faction: 'rival' })) > ALIGN_RESISTANCE.enforcer,
    'a rival operative resists more');
  notOk(Number.isFinite(resistanceOf(new Unquantized(0, 0, makeRng(1), { members: [] }))),
    'the unquantized cannot be converted at all');
});

test('an operative resists a lone squad and yields to a crowd', () => {
  // The snowball. Converting civilians is how you *earn* the ability to
  // convert an operative — this is what makes the Aligner a strategy
  // rather than an objective counter.
  const squad = new Squad(0, 0);
  squad.cycleAligner();
  const rng = makeRng(12);

  const makeCrowd = n => Array.from({ length: n }, (_, i) => {
    const c = new Civilian(200 + i, 200, rng); // far away, just strength
    c.aligned = true;
    return c;
  });

  const alone = new Hostile(2, 2, { faction: 'enforcer' });
  const weak = squad.runAligner(makeCrowd(0), [alone]);
  eq(weak.turned.length, 0, 'four agents alone cannot turn an enforcer');
  notOk(alone.aligned, 'and it stays hostile');

  const target = new Hostile(2, 2, { faction: 'enforcer' });
  const strong = squad.runAligner(makeCrowd(ALIGN_RESISTANCE.enforcer), [target]);
  eq(strong.turned.length, 1, 'with a crowd behind you, it turns');
  ok(target.aligned, 'and it is yours');
});

test('a turned operative stops counting as a kill', () => {
  const squad = new Squad(0, 0);
  squad.cycleAligner();
  const rng = makeRng(3);
  const crowd = Array.from({ length: 20 }, (_, i) => {
    const c = new Civilian(300 + i, 300, rng);
    c.aligned = true;
    return c;
  });
  const h = new Hostile(2, 2, { faction: 'rival' });
  squad.runAligner(crowd, [h]);
  ok(h.aligned, 'converted');
  notOk(h.countsForObjective, 'and no longer counts toward ELIMINATE');
});

test('turned operatives shoot the side they came from', () => {
  // Set the conversion directly rather than driving the Aligner: with a
  // crowd big enough to turn one operative, the field turns everyone in
  // range, and there is nobody left to shoot. What is under test here is
  // what a convert *does*, not how they got there.
  const sim = createSim('sector-7');
  const convert = sim.hostiles[0];
  const victim = sim.hostiles[1];

  convert.aligned = true;
  convert.faction = 'follower';
  convert.countsForObjective = false;

  convert.x = victim.x + 7;
  convert.z = victim.z;
  victim.aggroRange = 0;               // it stays put; we measure the convert
  sim.squad.agents.forEach(a => {      // keep the squad out of it entirely
    a.range = 0;
    a.x = sim.city.halfW - 4;
    a.z = sim.city.halfD - 4;
  });

  notOk(victim.aligned, 'the victim is still hostile');
  const before = victim.health;
  for (let i = 0; i < 60 * 10; i++) step(sim, 1 / 60, idle);
  lt(victim.health, before, 'the convert shot its former colleague');
});

test('the squad will not shoot someone it just converted', () => {
  const sim = createSim('sector-7');
  const h = sim.hostiles[0];
  h.aligned = true;
  const agent = sim.squad.agents[0];
  agent.x = h.x; agent.z = h.z + 5;
  eq(agent.pickTarget(sim.city, sim.hostiles.filter(x => !x.aligned)), null,
    'a converted operative is not a target');
});
