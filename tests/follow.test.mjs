// Following somebody through a city rather than at them.
//
// Agents have routed since `nav.js` shipped; everybody who follows one
// did not. Aligned civilians, turned operatives and escorted assets all
// pointed at the squad centroid and walked, which is fine until a
// building is in the way and then they press into the facade and slide.
//
// The assertions are about the difference, not about the pathfinder —
// `nav.test` owns A\*. What has to hold here is that a follower with a
// wall between them and the squad *arrives*, that one with a clear line
// does not pay for a search it does not need, and that a crowd of thirty
// does not turn into thirty searches a frame.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, lt, gt, gte } from './lib/harness.mjs';
import { follow, REPATH_AFTER, REPATH_MOVED, ARRIVE } from '../src/core/follow.js';
import { buildCity, hasLineOfSight, isBlocked } from '../src/core/city.js';
import { Civilian, Asset } from '../src/core/entities.js';
import { createSim, step } from '../src/core/sim.js';
import { makeRng, dist } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null, board: false };
const block = () => buildCity({ seed: 4242, cols: 8, rows: 8 });

/** A body that can walk, without dragging a whole entity in. */
function body(x, z) {
  return {
    x, z, facing: 0, radius: 1.1,
    turnToward(tx, tz, dt, rate) {
      const want = Math.atan2(tx - this.x, tz - this.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += Math.max(-rate * dt, Math.min(rate * dt, d));
    },
  };
}

/** A pair of points on opposite sides of a building. */
function acrossABuilding(city) {
  for (const s of city.structures) {
    if (s.collapsed || Math.max(s.w, s.d) < 10) continue;
    const gap = Math.max(s.w, s.d) / 2 + 6;
    const from = { x: s.x, z: s.z - gap };
    const to = { x: s.x, z: s.z + gap };
    if (isBlocked(city, from.x, from.z, 1.5) || isBlocked(city, to.x, to.z, 1.5)) continue;
    if (hasLineOfSight(city, from.x, from.z, to.x, to.z)) continue;
    return { from, to, s };
  }
  return null;
}

suite('following');

test('a clear line costs nothing', () => {
  // The common case by a long way — the squad walks streets — so it has
  // to be the cheap one. `follow` reports whether it used a route.
  const city = block();
  const a = body(0, 0);
  ok(hasLineOfSight(city, 0, 0, 0, 6), 'nothing between them');
  notOk(follow(a, 1 / 60, city, { x: 0, z: 6 }, 9), 'no search');
  eq(a.route, null);
  gt(a.z, 0, 'and they moved');
});

test('a wall between them is walked around, not into', () => {
  const city = block();
  const across = acrossABuilding(city);
  ok(across, 'the block has a building with open ground either side');
  const { from, to } = across;

  const walker = body(from.x, from.z);
  ok(follow(walker, 1 / 60, city, to, 9), 'this one needs a route');

  let closest = Infinity;
  for (let i = 0; i < 60 * 20; i++) {
    follow(walker, 1 / 60, city, to, 9);
    closest = Math.min(closest, dist(walker.x, walker.z, to.x, to.z));
  }
  lt(closest, 3, `got within ${closest.toFixed(1)}m of the far side`);
});

test('a route is not rebuilt every frame', () => {
  // Thirty aligned civilians asking A* for a route every frame is thirty
  // searches a frame, and the whole reason this is gated.
  const city = block();
  const { from, to } = acrossABuilding(city);
  const walker = body(from.x, from.z);
  follow(walker, 1 / 60, city, to, 0);      // speed 0: they stay put
  const first = walker.route;
  for (let i = 0; i < 60 * (REPATH_AFTER - 0.2); i++) follow(walker, 1 / 60, city, to, 0);
  eq(walker.route, first, 'same array, so no search happened');

  for (let i = 0; i < 60; i++) follow(walker, 1 / 60, city, to, 0);
  ok(walker.route !== first, 'and then it refreshes');
});

test('but it is rebuilt when the person moves away from it', () => {
  const city = block();
  const { from, to } = acrossABuilding(city);
  const walker = body(from.x, from.z);
  follow(walker, 1 / 60, city, to, 0);
  const first = walker.route;
  follow(walker, 1 / 60, city, { x: to.x + REPATH_MOVED + 4, z: to.z }, 0);
  ok(walker.route !== first, 'a squad that walked off gets a new route');
});

test('waypoints are consumed as they are reached', () => {
  const city = block();
  const { from, to } = acrossABuilding(city);
  const walker = body(from.x, from.z);
  follow(walker, 1 / 60, city, to, 0);
  const length = walker.route.length;
  gte(length, 1, 'there is a route');

  // Stand on the first waypoint and take one more step.
  const first = walker.route[0];
  walker.x = first.x;
  walker.z = first.z;
  follow(walker, 1 / 60, city, to, 0);
  lt(walker.route.length, length, 'that one is behind them now');
});

suite('following in play');

test('an escorted asset gets round a corner', () => {
  // Act I·3 is an escort, and an asset who grinds along a wall two metres
  // short of the extraction zone is the mission failing for a reason the
  // player cannot see.
  const sim = createSim('sable-campus');
  const asset = sim.assets[0];
  ok(asset, 'there is somebody to escort');
  asset.secured = true;

  // Put the squad on the far side of the nearest big building.
  const across = acrossABuilding(sim.city);
  ok(across);
  asset.x = across.from.x;
  asset.z = across.from.z;
  for (const a of sim.squad.agents) { a.x = across.to.x; a.z = across.to.z; }

  let closest = Infinity;
  for (let i = 0; i < 60 * 25; i++) {
    step(sim, 1 / 60, idle);
    const c = sim.squad.center();
    closest = Math.min(closest, dist(asset.x, asset.z, c.x, c.z));
  }
  lt(closest, 6, `she closed to ${closest.toFixed(1)}m`);
});

test('a crowd of twenty still gets home', () => {
  // A scale test, and deliberately not the test that pins the routing —
  // `an escorted asset gets round a corner` is, and it is the one that
  // goes red when the beeline comes back.
  //
  // The measurement, so nobody has to redo it: over 25 seconds on
  // sector-7 the routed crowd leaves 3 of 20 stranded beyond 25m and the
  // old beeline leaves 5; on run-south it is 4 of 14 against 5. Real, and
  // far too narrow to assert on. What a crowd is good for is proving the
  // gating holds up at twenty followers at once, which is the thing that
  // would otherwise only be found by a frame rate dropping.
  //
  // Not District 12, which is the obvious block and the wrong one:
  // aligning eighteen residents *is* its objective, so a test that aligns
  // twenty wins the mission on frame one and then measures a simulation
  // that has stopped. The first version of this did exactly that and
  // reported a crowd that had not moved a centimetre.
  const sim = createSim('sector-7');
  const crowd = sim.civilians.filter(c => !c.isAsset && !c.isQuarry).slice(0, 20);
  gte(crowd.length, 8, `${crowd.length} people to move`);
  for (const c of crowd) c.aligned = true;

  const from = sim.squad.center();
  const before = crowd.map(c => dist(c.x, c.z, from.x, from.z));
  for (let i = 0; i < 60 * 25; i++) step(sim, 1 / 60, idle);
  const to = sim.squad.center();
  const after = crowd.map(c => dist(c.x, c.z, to.x, to.z));

  const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  lt(median(after), median(before) * 0.5,
    `median ${median(before).toFixed(0)}m → ${median(after).toFixed(0)}m`);
  gt(after.filter(d => d < 12).length, crowd.length / 2,
    'and most of them are actually with the squad');
});
