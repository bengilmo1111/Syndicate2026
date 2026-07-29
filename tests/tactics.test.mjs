// Hostile decision-making: cover-seeking, repositioning, suppression.
//
// Every assertion here exists because the first implementation of this
// system was dead code and looked fine. Cover needed a structure within
// 2.0m while collision held actors 1.55m clear, so the band where cover
// existed was 0.45m wide and the AI never landed in it. Nothing crashed,
// nothing failed, and enemies simply stood in the open forever.
//
// So: assert that the AI *changes behaviour*, not merely that the
// functions return plausible values.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gte, lt } from './lib/harness.mjs';
import {
  findCover, applySuppression, decaySuppression, suppressionSpread,
} from '../src/core/tactics.js';
import { buildCity, coverAgainst, isBlocked, COVER } from '../src/core/city.js';
import { Hostile, Unquantized, Agent } from '../src/core/entities.js';
import { createSim, step } from '../src/core/sim.js';
import { makeRng, dist } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };

// -------------------------------------------------------------- positions

suite('cover seeking');

test('a hostile caught in the open usually finds somewhere better to stand', () => {
  // Statistical rather than anecdotal: not every scrap of street has cover
  // reachable from it, and asserting one hand-picked spot would be a
  // coin-flip test. What matters is that this works in the common case.
  // Geometry matters and the test has to respect it. A wall directly
  // behind you relative to the shooter is a backstop, not cover — cover is
  // a facade *beside* you. So the scenario is the real one: caught in the
  // open street while being shot at from along it.
  const city = buildCity({ seed: 2468, cols: 7, rows: 7 });
  let exposed = 0;
  let improved = 0;

  for (let i = 1; i < city.streetsX.length - 1; i++) {
    for (let j = 1; j < city.streetsZ.length - 1; j++) {
      const h = new Hostile(city.streetsX[i], city.streetsZ[j], { range: 26 });
      const threat = new Agent(h.x, h.z - 25, 0); // firing down the street
      if (coverAgainst(city, h.x, h.z, threat.x, threat.z) !== COVER.NONE) continue;
      exposed++;
      const spot = findCover(city, h, threat, { weaponRange: h.range });
      if (spot && coverAgainst(city, spot.x, spot.z, threat.x, threat.z) > COVER.NONE) {
        improved++;
      }
    }
  }

  gte(exposed, 10, 'the test had plenty of exposed positions to work with');
  gte(improved / exposed, 0.5,
    `found real cover from ${improved}/${exposed} exposed street positions`);
});

test('cover candidates are never inside geometry', () => {
  // A hostile that "takes cover" inside a wall is worse than one that
  // stands in the road.
  const city = buildCity({ seed: 1357, cols: 7, rows: 7 });
  let checked = 0;
  for (const s of city.structures.slice(0, 25)) {
    const h = new Hostile(s.x + s.w / 2 + 5, s.z + 3, { range: 26 });
    const threat = new Agent(h.x + 18, h.z + 4, 0);
    const spot = findCover(city, h, threat, { weaponRange: h.range });
    if (!spot) continue;
    notOk(isBlocked(city, spot.x, spot.z, h.radius), 'the chosen spot is walkable');
    checked++;
  }
  gte(checked, 1, 'the test actually found some candidates to check');
});

test('an actor already in hard cover does not fidget', () => {
  const city = buildCity({ seed: 999, cols: 7, rows: 7 });
  const wall = city.structures.find(s => !s.collapsed && s.h > 6);
  const h = new Hostile(wall.x, wall.z + wall.d / 2 + 1.6, { range: 26 });
  const threat = new Agent(h.x + 25, h.z, 0);
  if (coverAgainst(city, h.x, h.z, threat.x, threat.z) === COVER.HARD) {
    eq(findCover(city, h, threat, { weaponRange: h.range }), null, 'stays put');
  }
});

test('a chosen position is within reach, not across the map', () => {
  const city = buildCity({ seed: 8642, cols: 7, rows: 7 });
  const s = city.structures.find(x => !x.collapsed && x.h > 6);
  const h = new Hostile(s.x + s.w / 2 + 5, s.z, { range: 26 });
  const threat = new Agent(h.x + 20, h.z, 0);
  const spot = findCover(city, h, threat, { radius: 9, weaponRange: h.range });
  if (spot) lt(dist(h.x, h.z, spot.x, spot.z), 9 * 1.6 + 0.01, 'inside the reposition radius');
});

// ------------------------------------------------------------ suppression

suite('suppression');

test('being shot at widens your shots', () => {
  const h = new Hostile(0, 0, {});
  eq(suppressionSpread(h), 1, 'unsuppressed is neutral');
  applySuppression(h, 1);
  ok(suppressionSpread(h) > 1, 'suppressed shooters miss more');
});

test('suppression decays and is capped', () => {
  const h = new Hostile(0, 0, {});
  for (let i = 0; i < 20; i++) applySuppression(h, 1);
  lt(h.suppression, 3.01, 'capped');
  for (let i = 0; i < 600; i++) decaySuppression(h, 1 / 60);
  eq(h.suppression, 0, 'and it wears off');
});

test('being shot at makes you reconsider your position immediately', () => {
  const h = new Hostile(0, 0, {});
  h.rethinkIn = 5;
  applySuppression(h, 1);
  eq(h.rethinkIn, 0, 'the next update re-evaluates');
});

// ---------------------------------------------------------- in a live sim

suite('tactics in play');

/** Drive a real engagement: walk the squad onto the nearest hostile. */
function engage(missionId, seconds = 60) {
  const sim = createSim(missionId);
  const seen = { sought: new Set(), peakSuppression: 0, moved: 0 };
  const start = sim.hostiles.map(h => ({ id: h.id, x: h.x, z: h.z }));

  for (let i = 0; i < 60 * seconds; i++) {
    if (i % 40 === 0 && sim.hostiles.length) {
      const c = sim.squad.center();
      let best = sim.hostiles[0];
      let bd = Infinity;
      for (const h of sim.hostiles) {
        const d = dist(c.x, c.z, h.x, h.z);
        if (d < bd) { bd = d; best = h; }
      }
      sim.squad.issueMove({ x: best.x, z: best.z }, sim.city);
    }
    step(sim, 1 / 60, idle);
    for (const h of sim.hostiles) if (h.coverSpot) seen.sought.add(h.id);
    for (const a of sim.squad.agents) {
      seen.peakSuppression = Math.max(seen.peakSuppression, a.suppression ?? 0);
    }
    if (!sim.hostiles.length) break;
  }
  for (const s of start) {
    const h = sim.hostiles.find(x => x.id === s.id);
    if (h && dist(s.x, s.z, h.x, h.z) > 2) seen.moved++;
  }
  return { sim, ...seen };
}

test('hostiles actually seek cover during a firefight', () => {
  // The regression this whole file exists for.
  const r = engage('sector-7');
  gte(r.sought.size, 1, 'at least one hostile repositioned deliberately');
});

test('agents get suppressed by incoming fire', () => {
  const r = engage('sector-7');
  ok(r.peakSuppression > 0, `the squad came under fire (peak ${r.peakSuppression.toFixed(2)})`);
});

test('a firefight now costs the squad something', () => {
  // Before cover-seeking and suppression, the squad finished sector-7
  // untouched every single time. If this ever returns to zero, the enemy
  // AI has gone back to standing in the road.
  const r = engage('sector-7');
  const damage = r.sim.squad.agents.reduce((n, a) => n + (a.maxHealth - a.health), 0);
  ok(damage > 0, `the squad took ${Math.round(damage)} damage`);
});

test('the unquantized do not take cover — they are not trained', () => {
  // Story-load-bearing: The Bracket's whole point is that they do not
  // fight like the terror cell the briefing described.
  const sim = createSim('the-bracket');
  ok(sim.hostiles.every(h => !h.seeksCover), 'none of them seek cover');
  ok(sim.hostiles.every(h => h.spread > 0.1), 'and none of them shoot straight');

  const r = engage('the-bracket', 40);
  eq(r.sought.size, 0, 'and none of them repositioned tactically');
});

test('syndicate hostiles do seek cover — the difference is the point', () => {
  const sim = createSim('sector-7');
  ok(sim.hostiles.every(h => h.seeksCover), 'trained operatives think about position');
});
