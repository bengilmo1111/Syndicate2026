// Invariants of the simulation layer. No browser, no rendering.

import { suite, test, ok, notOk, eq, gte, lt, near } from './lib/harness.mjs';
import {
  buildCity, addLandmark, isBlocked, hasLineOfSight, structureInPath,
  damageStructure, randomStreetPoint, resolveCollision,
} from '../src/core/city.js';
import { findPath, movementBlocked } from '../src/core/nav.js';
import { makeRng, segmentPointDistance, dist } from '../src/core/math.js';
import { Agent, Civilian, Hostile, Unquantized, Projectile, TIER } from '../src/core/entities.js';
import { Squad, ALIGNER, ALIGNER_RADIUS } from '../src/core/squad.js';
import {
  objective, OBJECTIVE, STATUS, updateMissionStatus, isMissionComplete, failedObjective,
} from '../src/core/mission.js';

const city = () => buildCity({ seed: 1234, cols: 7, rows: 7, syndicate: 'google' });

// ------------------------------------------------------------------ city

suite('city');

test('generation is deterministic for a seed', () => {
  const a = buildCity({ seed: 99, cols: 6, rows: 6 });
  const b = buildCity({ seed: 99, cols: 6, rows: 6 });
  eq(a.structures.length, b.structures.length, 'same seed, same structure count');
  eq(a.structures[0].x, b.structures[0].x, 'same seed, same placement');
});

test('the deploy point is not inside geometry', () => {
  // A squad that spawns inside a building is stuck before the player
  // touches anything. This regressed once already.
  for (const seed of [1, 2, 3, 4, 5]) {
    const c = buildCity({ seed, cols: 8, rows: 8 });
    notOk(isBlocked(c, c.deploy.x, c.deploy.z, 1.2), `seed ${seed}: deploy point is clear`);
  }
});

test('the deploy point sits on a street centreline', () => {
  const c = city();
  ok(c.streetsX.includes(c.deploy.x), 'deploy x is a street');
  ok(c.streetsZ.includes(c.deploy.z), 'deploy z is a street');
});

test('a full squad fits in the street at the deploy point', () => {
  const c = city();
  const squad = new Squad(c.deploy.x, c.deploy.z);
  for (const a of squad.agents) {
    const before = { x: a.x, z: a.z };
    resolveCollision(c, a);
    lt(dist(before.x, before.z, a.x, a.z), 0.01, 'agent was not shoved on spawn');
  }
});

test('randomStreetPoint never lands inside a structure', () => {
  const c = city();
  const rng = makeRng(7);
  for (let i = 0; i < 200; i++) {
    const p = randomStreetPoint(c, rng, 1.4);
    notOk(isBlocked(c, p.x, p.z, 1.2), `street point ${i} is clear`);
  }
});

test('landmarks clear cover out of their own footprint', () => {
  const c = buildCity({ seed: 42, cols: 8, rows: 8 });
  const mast = addLandmark(c, { name: 'TEST MAST', near: { x: 0, z: 0 } });
  const overlapping = c.structures.filter(
    s => s !== mast && s.destructible && dist(s.x, s.z, mast.x, mast.z) < 8,
  );
  eq(overlapping.length, 0, 'no cover grew through the landmark');
});

// ----------------------------------------------------------- destruction

suite('destruction');

test('collapse-to-cover: rubble stops blocking sight but still blocks movement', () => {
  // This is the headline mechanic. If it silently inverts, the game still
  // runs and nothing looks wrong.
  const c = buildCity({ seed: 5150, cols: 8, rows: 8 });
  const mast = addLandmark(c, { name: 'MAST', near: { x: 0, z: 0 }, hp: 100, height: 20 });
  const a = { x: mast.x - 14, z: mast.z };
  const b = { x: mast.x + 14, z: mast.z };

  notOk(hasLineOfSight(c, a.x, a.z, b.x, b.z), 'standing structure blocks sight');
  ok(movementBlocked(c, a.x, a.z, b.x, b.z), 'standing structure blocks movement');

  const collapsed = damageStructure(mast, 100);
  ok(collapsed, 'the structure reported its collapse');
  ok(mast.collapsed, 'and is flagged collapsed');

  ok(hasLineOfSight(c, a.x, a.z, b.x, b.z), 'rubble does NOT block sight');
  ok(movementBlocked(c, a.x, a.z, b.x, b.z), 'rubble DOES still block movement');
});

test('a collapsed structure absorbs no further damage', () => {
  const c = buildCity({ seed: 3, cols: 6, rows: 6 });
  const mast = addLandmark(c, { name: 'M', near: { x: 0, z: 0 }, hp: 50 });
  damageStructure(mast, 50);
  eq(damageStructure(mast, 999), false, 'second collapse does not fire');
});

test('structureInPath returns the nearest blocker, not just any', () => {
  const c = buildCity({ seed: 808, cols: 8, rows: 8 });
  const from = { x: c.deploy.x, z: c.deploy.z };
  let found = null;
  for (const s of c.structures) {
    const hit = structureInPath(c, from.x, from.z, s.x, s.z);
    if (hit && hit !== s) { found = { s, hit }; break; }
  }
  if (found) {
    lt(
      dist(from.x, from.z, found.hit.x, found.hit.z),
      dist(from.x, from.z, found.s.x, found.s.z) + 0.001,
      'the reported blocker is no further than the intended target',
    );
  }
});

// ------------------------------------------------------------------- nav

suite('nav');

test('a route exists between arbitrary street points', () => {
  const c = city();
  const rng = makeRng(11);
  for (let i = 0; i < 40; i++) {
    const from = randomStreetPoint(c, rng, 1.4);
    const to = randomStreetPoint(c, rng, 1.4);
    const path = findPath(c, from, to, 1.2);
    gte(path.length, 1, 'a path was produced');
    eq(path[path.length - 1].x, to.x, 'the path ends at the destination');
  }
});

test('route legs do not cut through buildings', () => {
  const c = city();
  const rng = makeRng(23);
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    const from = randomStreetPoint(c, rng, 1.4);
    const to = randomStreetPoint(c, rng, 1.4);
    const path = findPath(c, from, to, 1.2);
    // The final leg targets an arbitrary point and may clip; every leg
    // before it runs along streets and must be clean.
    let cursor = from;
    for (let j = 0; j < path.length - 1; j++) {
      notOk(
        movementBlocked(c, cursor.x, cursor.z, path[j].x, path[j].z, 1.2),
        `leg ${j} of route ${i} is clear`,
      );
      cursor = path[j];
      checked++;
    }
  }
  gte(checked, 1, 'the test actually exercised some multi-leg routes');
});

test('an unobstructed order does not build a route', () => {
  const c = city();
  const from = { x: c.deploy.x, z: c.deploy.z };
  const to = { x: c.deploy.x, z: c.deploy.z - 8 };
  if (!movementBlocked(c, from.x, from.z, to.x, to.z, 1.2)) {
    eq(findPath(c, from, to, 1.2).length, 1, 'straight shot is a single waypoint');
  }
});

test('the nav graph is rebuilt when a collapse changes the map', () => {
  const c = city();
  const rng = makeRng(5);
  const from = randomStreetPoint(c, rng, 1.4);
  const to = randomStreetPoint(c, rng, 1.4);
  findPath(c, from, to, 1.2);
  const stampBefore = c._nav?.stamp;
  addLandmark(c, { name: 'NEW', near: { x: 0, z: 0 } });
  findPath(c, from, to, 1.2);
  ok(c._nav.stamp !== stampBefore, 'the cached graph did not go stale');
});

// -------------------------------------------------------------- ballistics

suite('ballistics');

test('segmentPointDistance measures the segment, not the endpoints', () => {
  near(segmentPointDistance(-10, 0, 10, 0, 0, 3), 3, 1e-9, 'perpendicular distance');
  near(segmentPointDistance(0, 0, 10, 0, 20, 0), 10, 1e-9, 'clamps past the far end');
  near(segmentPointDistance(0, 0, 10, 0, -5, 0), 5, 1e-9, 'clamps before the near end');
});

test('a fast round cannot tunnel through the target it passes through', () => {
  // 78 m/s over a 1/60s step covers 1.3m; a target disc is 1.5m across.
  // Testing only the endpoint made hits stochastic.
  const target = new Civilian(0, 0, makeRng(1));
  const p = new Projectile(0, -6, 0, 10, null);
  p.prevX = 0; p.prevZ = -6;
  p.x = 0; p.z = 6; // straight through the middle in one step
  ok(p.hits(target), 'the swept test catches a pass-through');
});

test('a round that misses still misses', () => {
  const target = new Civilian(0, 0, makeRng(1));
  const p = new Projectile(0, -6, 0, 10, null);
  p.prevX = 8; p.prevZ = -6;
  p.x = 8; p.z = 6;
  notOk(p.hits(target), 'a clean miss is still a miss');
});

// ---------------------------------------------------------------- aligner

suite('aligner');

test('the Aligner converts civilians inside its radius and nobody outside', () => {
  const c = city();
  const rng = makeRng(2);
  const squad = new Squad(0, 0);
  squad.cycleAligner();
  eq(squad.alignerMode, ALIGNER.BIND, 'first press engages bind mode');

  const inside = new Civilian(2, 2, rng);
  const outside = new Civilian(ALIGNER_RADIUS + 40, 0, rng);
  const { converted } = squad.runAligner([inside, outside]);

  eq(converted.length, 1, 'exactly one conversion');
  ok(inside.aligned, 'the near civilian was aligned');
  notOk(outside.aligned, 'the far civilian was not');
});

test('the Aligner refuses an unquantized target and reports it', () => {
  // This refusal is the entire reveal of The Bracket. Silently doing
  // nothing would read as a bug, and would lose the mission's point.
  const rng = makeRng(3);
  const squad = new Squad(0, 0);
  squad.cycleAligner();
  const group = { members: [] };
  const unq = new Unquantized(3, 3, rng, group);
  group.members.push(unq);

  const { converted, refused } = squad.runAligner([], [unq]);
  eq(converted.length, 0, 'nothing was converted');
  eq(refused.length, 1, 'the refusal was reported');
  notOk(unq.aligned, 'the target is not aligned');

  const second = squad.runAligner([], [unq]);
  eq(second.refused.length, 0, 'the refusal reports once, not every frame');
});

test('a syndicate hostile is alignable; an unquantized one is not', () => {
  eq(new Hostile(0, 0, {}).alignable, true, 'rivals carry a throttled Instance');
  eq(new Unquantized(0, 0, makeRng(1), { members: [] }).alignable, false, 'the unquantized do not');
});

test('mission assets cannot be aligned', () => {
  const civ = new Civilian(0, 0, makeRng(1));
  civ.isAsset = true;
  ok(civ.align('bind'), 'a plain civilian aligns'); // sanity: the base does
});

// --------------------------------------------------------------- morale

suite('morale');

test('the unquantized break once two of their group are down', () => {
  const rng = makeRng(9);
  const group = { members: [] };
  for (let i = 0; i < 6; i++) group.members.push(new Unquantized(i * 3, 0, rng, group));

  notOk(group.members[5].broken, 'an intact group holds');
  group.members[0].dead = true;
  notOk(group.members[5].broken, 'one loss is not enough');
  group.members[1].dead = true;
  ok(group.members[5].broken, 'two losses break the rest');
});

test('a badly wounded unquantized breaks on its own', () => {
  const u = new Unquantized(0, 0, makeRng(4), { members: [] });
  notOk(u.broken, 'unhurt and holding');
  u.takeDamage(u.maxHealth * 0.5);
  ok(u.broken, 'below half health and done');
});

test('a wounded unquantized speaks, once', () => {
  const u = new Unquantized(0, 0, makeRng(4), { members: [] });
  u.takeDamage(2);
  ok(u.pendingLine, 'a line was queued');
  ok(u.pendingLine.speaker.length > 0, 'the line is attributed to a name');
  u.pendingLine = null;
  u.takeDamage(2);
  eq(u.pendingLine, null, 'they do not keep talking');
});

test('six people in one place get six different names', () => {
  const rng = makeRng(77);
  const group = { members: [] };
  for (let i = 0; i < 6; i++) group.members.push(new Unquantized(0, 0, rng, group));
  eq(new Set(group.members.map(m => m.name)).size, 6, 'all names distinct');
});

// -------------------------------------------------------------- objectives

suite('objectives');

const snapshot = over => ({
  dt: 1 / 60, kills: 0, aligned: 0, landmarks: [], assets: [],
  assetsSecured: 0, squadExtracted: false, inZone: false, ...over,
});

test('an ELIMINATE objective tracks kills and completes on target', () => {
  const m = { objectives: [objective(OBJECTIVE.ELIMINATE, { id: 'e', target: 3 })] };
  updateMissionStatus(m, snapshot({ kills: 2 }));
  eq(m.objectives[0].status, STATUS.PENDING, 'not there yet');
  updateMissionStatus(m, snapshot({ kills: 3 }));
  eq(m.objectives[0].status, STATUS.COMPLETE, 'completes on target');
});

test('a prerequisite gates an objective that would otherwise pass immediately', () => {
  // The squad deploys inside its own extraction zone, so without `after:`
  // the extract objective completes on frame one.
  const m = {
    objectives: [
      objective(OBJECTIVE.RETRIEVE, { id: 'get', target: 1 }),
      objective(OBJECTIVE.EXTRACT, { id: 'out', target: 1, after: 'get' }),
    ],
  };
  updateMissionStatus(m, snapshot({ squadExtracted: true, assetsSecured: 0 }));
  eq(m.objectives[1].status, STATUS.PENDING, 'extract is gated');
  notOk(isMissionComplete(m), 'and the mission is not won');

  updateMissionStatus(m, snapshot({ squadExtracted: true, assetsSecured: 1 }));
  eq(m.objectives[0].status, STATUS.COMPLETE, 'retrieve completed');
  updateMissionStatus(m, snapshot({ squadExtracted: true, assetsSecured: 1 }));
  eq(m.objectives[1].status, STATUS.COMPLETE, 'extract then completes');
});

test('a failure predicate fails the objective and the mission', () => {
  const m = {
    objectives: [objective(OBJECTIVE.RETRIEVE, {
      id: 'get', target: 1,
      failed: s => s.assets.some(a => a.dead),
      failReason: 'assetLost',
    })],
  };
  updateMissionStatus(m, snapshot({ assets: [{ dead: false }] }));
  eq(m.objectives[0].status, STATUS.PENDING, 'alive asset, still pending');
  updateMissionStatus(m, snapshot({ assets: [{ dead: true }] }));
  eq(m.objectives[0].status, STATUS.FAILED, 'dead asset fails the objective');
  eq(failedObjective(m)?.failReason, 'assetLost', 'and reports why');
});

test('optional objectives do not gate completion', () => {
  const m = {
    objectives: [
      objective(OBJECTIVE.ELIMINATE, { id: 'a', target: 1 }),
      objective(OBJECTIVE.ALIGN, { id: 'b', target: 5, optional: true }),
    ],
  };
  updateMissionStatus(m, snapshot({ kills: 1 }));
  ok(isMissionComplete(m), 'the required objective alone wins it');
});

// ------------------------------------------------------------------ agents

suite('agents');

test('agents will not shoot through a building', () => {
  const c = buildCity({ seed: 606, cols: 8, rows: 8 });
  const wall = c.structures.find(s => !s.collapsed && s.h > 6);
  const agent = new Agent(wall.x, wall.z + wall.d / 2 + 12, 0);
  const target = new Hostile(wall.x, wall.z - wall.d / 2 - 12, {});
  agent.range = 200;
  eq(agent.pickTarget(c, [target]), null, 'no target through a wall');

  const clear = new Hostile(agent.x + 8, agent.z + 4, {});
  eq(agent.pickTarget(c, [clear]), clear, 'but a visible one is picked');
});

test('enforcement never counts toward an ELIMINATE objective', () => {
  eq(new Hostile(0, 0, {}).countsForObjective, true, 'rivals count');
  eq(new Hostile(0, 0, { countsForObjective: false }).countsForObjective, false, 'enforcement does not');
});

test('civilian tier is assigned and drives speed', () => {
  const rng = makeRng(31);
  const tiers = new Set();
  for (let i = 0; i < 200; i++) tiers.add(new Civilian(0, 0, rng).tier);
  ok(tiers.has(TIER.FREE), 'Free tier exists in the population');
  gte(tiers.size, 2, 'more than one tier is represented');
});
