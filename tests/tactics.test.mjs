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
import { suite, test, ok, notOk, eq, gt, gte, lt } from './lib/harness.mjs';
import {
  findCover, applySuppression, decaySuppression, suppressionSpread,
  spreadAlert, reachOf, isWithdrawing,
  CELL_RADIUS, ALERT_SECONDS, WITHDRAW_AT, CLAIM_SPACING,
} from '../src/core/tactics.js';
import { buildCity, coverAgainst, isBlocked, hasLineOfSight, COVER } from '../src/core/city.js';
import { Hostile, Unquantized, Agent } from '../src/core/entities.js';
import { createSim, step } from '../src/core/sim.js';
import { makeRng, dist } from '../src/core/math.js';
import { poolOf, poolMax } from '../src/core/buffer.js';

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
  const seen = {
    sought: new Set(), peakSuppression: 0, moved: 0, lowestPool: Infinity,
  };
  const fullPool = sim.squad.agents.reduce((n, a) => n + poolMax(a), 0);
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
    // The low-water mark, not the final state. The Instance buffer comes
    // back once the shooting stops, so a squad that won a fight it was
    // hurt in looks untouched by the time the last hostile is down.
    seen.lowestPool = Math.min(
      seen.lowestPool,
      sim.squad.agents.reduce((n, a) => n + poolOf(a), 0),
    );
    if (!sim.hostiles.length) break;
  }
  for (const s of start) {
    const h = sim.hostiles.find(x => x.id === s.id);
    if (h && dist(s.x, s.z, h.x, h.z) > 2) seen.moved++;
  }
  return { sim, fullPool, ...seen };
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
  // The whole pool, not just the flesh. Since the Instance buffer landed
  // this exact assertion read zero on `health` alone — everything the
  // tutorial's cell managed to do was absorbed, which is the buffer
  // working rather than the AI failing, and the test could not tell the
  // difference until it was asked the right question.
  const damage = r.fullPool - r.lowestPool;
  ok(damage > 0, `the squad was ${Math.round(damage)} down at its worst`);
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

// ---------------------------------------------------------------------------
// The rest of gap 7: a cell that talks, and a professional who leaves.
//
// What was still missing after cover-seeking shipped was everything
// *between* hostiles. Each of them solved its own problem, which meant a
// patient player could stand outside one man's aggro range and take a
// room apart one at a time while the rest of it did nothing — and a
// hostile on four health walked into the squad that had just done it to
// them, because closing was all the model knew how to do.
// ---------------------------------------------------------------------------

suite('the cell');

/** A hostile standing somewhere specific, with the defaults. */
function planted(x, z, opts = {}) {
  const h = new Hostile(x, z, opts);
  h.id = opts.id ?? 1;
  return h;
}

test('one of them seeing you is all of them knowing', () => {
  const caller = planted(0, 0, { id: 1 });
  const near = planted(CELL_RADIUS - 4, 0, { id: 2 });
  const far = planted(CELL_RADIUS + 30, 0, { id: 3 });
  caller.sawTarget = true;

  spreadAlert([caller, near, far], 1 / 60);
  gte(near.alertFor, 1, 'the man beside him is told');
  eq(far.alertFor, 0, 'and the one across the block is not — this is a shout');
});

test('a contact is not relayed across the map one man at a time', () => {
  // Otherwise stepping on any single hostile alerts the whole city, and
  // `aggroRange` already covers "they heard the shooting".
  const caller = planted(0, 0, { id: 1 });
  const middle = planted(CELL_RADIUS - 2, 0, { id: 2 });
  const end = planted((CELL_RADIUS - 2) * 2, 0, { id: 3 });
  caller.sawTarget = true;

  for (let i = 0; i < 30; i++) spreadAlert([caller, middle, end], 1 / 60);
  gte(middle.alertFor, 1);
  eq(end.alertFor, 0, 'one hop, not a flood');
});

test('a contact goes cold', () => {
  const caller = planted(0, 0, { id: 1 });
  const near = planted(4, 0, { id: 2 });
  caller.sawTarget = true;
  spreadAlert([caller, near], 1 / 60);
  gte(near.alertFor, 1);

  caller.sawTarget = false;
  for (let i = 0; i < 60 * (ALERT_SECONDS + 1); i++) spreadAlert([caller, near], 1 / 60);
  lt(near.alertFor, 0.001, 'nobody stays switched on forever');
});

test('being told extends how far they will come for you', () => {
  const h = planted(0, 0);
  eq(reachOf(h), h.aggroRange, 'on their own, their own eyes');
  h.alertFor = ALERT_SECONDS;
  gte(reachOf(h), h.aggroRange * 1.5, 'told, they come further');
});

test('the sleeping are not woken by a shout', () => {
  // Dormant loyalists are on your side until you make them otherwise, and
  // that has to stay a decision the player makes in as many words.
  const caller = planted(0, 0, { id: 1 });
  const loyal = planted(5, 0, { id: 2, dormant: true });
  caller.sawTarget = true;
  spreadAlert([caller, loyal], 1 / 60);
  eq(loyal.alertFor, 0);
});

test('the far one holds off, and the alerted one comes', () => {
  // The behaviour all of the above is for, driven through `update`.
  const city = buildCity({ seed: 77, cols: 8, rows: 8 });
  const agent = new Agent(0, 0, 0);
  const far = planted(0, 60, { id: 4, aggroRange: 40 });
  const start = far.z;

  for (let i = 0; i < 60; i++) far.update(1 / 60, city, [agent], []);
  eq(far.z, start, 'sixty metres away and nobody has told them anything');

  far.alertFor = ALERT_SECONDS;
  for (let i = 0; i < 60; i++) far.update(1 / 60, city, [agent], []);
  lt(far.z, start - 1, 'told, they close');
});

suite('breaking contact');

test('a hurt hostile stops walking into the squad that hurt it', () => {
  const city = buildCity({ seed: 77, cols: 8, rows: 8 });
  const agent = new Agent(0, 0, 0);

  const healthy = planted(0, 34, { id: 5, seeksCover: false });
  for (let i = 0; i < 90; i++) healthy.update(1 / 60, city, [agent], []);
  lt(healthy.z, 33, 'a whole one closes the distance');

  const hurt = planted(0, 34, { id: 6, seeksCover: false });
  hurt.health = hurt.maxHealth * (WITHDRAW_AT * 0.9);
  ok(isWithdrawing(hurt));
  const at = hurt.z;
  for (let i = 0; i < 90; i++) hurt.update(1 / 60, city, [agent], []);
  eq(hurt.z, at, 'and one on its last legs holds what it has');
});

/**
 * Every standoff on this block: an actor in the open beside a building,
 * with a threat that can see them.
 *
 * Built by search rather than by hand. A hand-placed pair depends on
 * whichever structure a seed happens to put first, and the two attempts
 * before this one asserted against a corner kiosk and a slab at the edge
 * of the map — both of which correctly returned "nowhere better", and
 * neither of which was the situation the test was about.
 */
function standoffs(city) {
  const out = [];
  for (const s of city.structures) {
    if (s.collapsed || Math.max(s.w, s.d) < 8) continue;
    const actor = {
      x: s.x + s.w / 2 + 5, z: s.z + s.d / 2 + 5, radius: 1.15, id: 1, range: 26,
    };
    const threat = { x: actor.x + 20, z: actor.z + 14 };
    if (isBlocked(city, actor.x, actor.z, 1.5)) continue;
    if (!hasLineOfSight(city, actor.x, actor.z, threat.x, threat.z)) continue;
    const hold = findCover(city, actor, threat, {});
    const leave = findCover(city, actor, threat, { withdrawing: true });
    if (hold && leave) out.push({ actor, threat, hold, leave });
  }
  return out;
}

test('somebody leaving is not solving the same problem as somebody staying', () => {
  const city = buildCity({ seed: 77, cols: 8, rows: 8 });
  const cases = standoffs(city);
  gte(cases.length, 4, `${cases.length} standoffs on this block`);

  let holdHidden = 0;
  let leaveHidden = 0;
  for (const { threat, hold, leave } of cases) {
    ok(dist(hold.x, hold.z, leave.x, leave.z) > 0.01,
      'the two answers are different points');
    // And the difference always runs one way: what they are breaking
    // contact into is either a wall, or further off. Never nearer.
    const covered = !hasLineOfSight(city, leave.x, leave.z, threat.x, threat.z);
    const further = dist(leave.x, leave.z, threat.x, threat.z)
      >= dist(hold.x, hold.z, threat.x, threat.z);
    ok(covered || further, 'a wall, or more ground — not less');
    if (covered) leaveHidden++;
    if (!hasLineOfSight(city, hold.x, hold.z, threat.x, threat.z)) holdHidden++;
  }

  // The half of it that "further off" alone does not pin. Concealment is
  // scored *above* the best cover you can shoot from, but only for
  // somebody leaving — so the two modes should disagree about walls, not
  // merely about distance. Deleting that preference and letting range do
  // all the work survives every assertion above.
  gt(leaveHidden, holdHidden,
    `${leaveHidden} of ${cases.length} break line of sight, against ${holdHidden} holding`);
});

test('two of them do not walk to the same corner', () => {
  const city = buildCity({ seed: 77, cols: 8, rows: 8 });
  const cases = standoffs(city);
  let checked = 0;
  for (const { actor, threat, hold } of cases) {
    const second = findCover(city, actor, threat, { taken: [hold] });
    if (!second) continue;   // nowhere else worth standing is a fair answer
    checked++;
    gte(dist(hold.x, hold.z, second.x, second.z), CLAIM_SPACING,
      'the second man goes somewhere else');
  }
  gte(checked, 1, `${checked} of ${cases.length} had a second spot to take`);
});

test('the sim tells each of them where the others are going', () => {
  // The unit test above proves `findCover` respects a claim; this proves
  // the sim hands it one, which is a single line and therefore exactly
  // the kind of thing that gets quietly deleted.
  //
  // Asserted on the wiring rather than on the spacing, because the
  // spacing almost never bites: measured over six missions, a claim
  // rejects a candidate seventeen times in a forty-second engagement on
  // `run-south` and not once anywhere else. Hostiles are simply rarely
  // near enough to want the same corner. It is worth keeping — seventeen
  // is not zero, and two men standing inside each other reads as a bug —
  // but no assertion about distances between cover spots can see it.
  const sim = createSim('sector-7');
  let sawOthers = false;
  for (let i = 0; i < 60 * 30 && !sawOthers; i++) {
    if (i % 40 === 0 && sim.hostiles.length) {
      sim.squad.issueMove({ x: sim.hostiles[0].x, z: sim.hostiles[0].z }, sim.city);
    }
    step(sim, 1 / 60, idle);
    for (const h of sim.hostiles) {
      if (!h.claimed?.length) continue;
      ok(!h.claimed.includes(h.coverSpot), 'nobody is told to avoid their own spot');
      sawOthers = true;
    }
  }
  ok(sawOthers, 'somebody was told where somebody else was going');
});

test('a cell in play alerts itself', () => {
  // Walk the squad in, the way `engage` does — a squad standing on the
  // deploy point is not a contact anybody has to call.
  const sim = createSim('sector-7');
  const told = new Set();
  for (let i = 0; i < 60 * 40; i++) {
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
    for (const h of sim.hostiles) if (h.alertFor > 0) told.add(h.id);
    if (told.size) break;
  }
  gte(told.size, 1, 'somebody heard about the squad from somebody else');
});
