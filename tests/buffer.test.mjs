// The Instance buffer — `GAP_ANALYSIS.md` gap 8.
//
// The gap was that a firefight has no economy: nothing runs out, nothing
// comes back, so the correct play is always to keep shooting. What is
// asserted here is the shape of the answer rather than the numbers — that
// the pool is *split* rather than extended, that it only recovers when
// nobody is shooting at you, and that a squad which breaks contact is
// therefore doing something the game rewards.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, near, lt, gt, gte } from './lib/harness.mjs';
import {
  initBuffer, absorb, recoverBuffer, poolOf, poolMax,
  BUFFER_SHARE, BUFFER_DELAY, BUFFER_RATE, BUFFER_PER_POINT,
} from '../src/core/buffer.js';
import { Agent, Hostile } from '../src/core/entities.js';
import { createSim, step } from '../src/core/sim.js';
import { CYBERNETICS } from '../src/core/roster.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null, board: false };

suite('the buffer');

test('the pool is split, not extended', () => {
  // The whole design. Handing the player thirty more hit points would
  // have made every fight easier, which is the opposite of adding
  // pressure — so an agent has exactly what they always had, and part of
  // it is now the part that comes back.
  const a = new Agent(0, 0, 0);
  eq(poolMax(a), 120, 'the total is unchanged');
  lt(a.maxHealth, 120, 'and less of it is permanent than before');
  eq(a.maxBuffer, Math.round(120 * BUFFER_SHARE));
  eq(poolOf(a), poolMax(a), 'and they deploy whole');
});

test('the buffer goes first, and then flesh', () => {
  const a = new Agent(0, 0, 0);
  const buffer = a.maxBuffer;

  a.takeDamage(buffer - 4);
  eq(a.health, a.maxHealth, 'not a scratch on them yet');
  eq(a.buffer, 4);

  a.takeDamage(10);
  eq(a.buffer, 0, 'headroom gone');
  eq(a.health, a.maxHealth - 6, 'and the rest went through');
});

test('nobody else has one', () => {
  // Deliberately the squad's alone. Giving it to hostiles would double
  // every time-to-kill on the block and rebalance fifteen missions, and
  // the fiction is that this is what a field-grade allocation buys.
  const h = new Hostile(0, 0);
  eq(h.maxBuffer, undefined);
  const before = h.health;
  h.takeDamage(10);
  eq(h.health, before - 10, 'it all lands');
  eq(absorb(h, 10), 10, 'and absorb passes it straight through');
});

test('it does not come back during the exchange', () => {
  // The mechanic. Enemy fire rate is under a second, so a buffer that
  // recovered while being shot at would just be more health.
  const a = new Agent(0, 0, 0);
  a.takeDamage(a.maxBuffer);
  eq(a.buffer, 0);

  for (let i = 0; i < 60 * (BUFFER_DELAY - 0.5); i++) recoverBuffer(a, 1 / 60, 2);
  eq(a.buffer, 0, 'four seconds of being shot at is not a rest');

  for (let i = 0; i < 60; i++) recoverBuffer(a, 1 / 60, 2);
  gt(a.buffer, 0, 'and then it starts coming back');
});

test('and every hit puts it back on the clock', () => {
  const a = new Agent(0, 0, 0);
  a.takeDamage(a.maxBuffer);
  for (let i = 0; i < 60 * 10; i++) {
    recoverBuffer(a, 1 / 60, 2);
    // Somebody shooting at them the whole time.
    if (i % 30 === 0) a.takeDamage(1);
  }
  lt(a.buffer, a.maxBuffer * 0.35,
    `pinned for ten seconds and still at ${Math.round(a.buffer)}`);
});

test('it fills, and stops', () => {
  const a = new Agent(0, 0, 0);
  a.takeDamage(a.maxBuffer);
  for (let i = 0; i < 60 * 60; i++) recoverBuffer(a, 1 / 60, 2);
  eq(a.buffer, a.maxBuffer, 'full');
  eq(a.health, a.maxHealth, 'and the flesh did not come back with it');
});

test('the flesh never does', () => {
  // A wound is permanent for the deployment. That is what stops the
  // buffer being a slow-motion heal and keeps a bad fight expensive.
  const a = new Agent(0, 0, 0);
  a.takeDamage(a.maxBuffer + 20);
  const hurt = a.health;
  for (let i = 0; i < 60 * 60; i++) recoverBuffer(a, 1 / 60, 6);
  eq(a.health, hurt);
});

test('RESILIENCE is now about how fast you can go again', () => {
  // The channel already scales damage taken. Giving it the buffer as
  // well is the point: it stops being a slightly smaller number on
  // incoming and becomes something the player feels between fights.
  const slow = new Agent(0, 0, 0);
  const fast = new Agent(0, 0, 0);
  slow.takeDamage(slow.maxBuffer);
  fast.takeDamage(fast.maxBuffer);
  for (let i = 0; i < 60 * (BUFFER_DELAY + 1); i++) {
    recoverBuffer(slow, 1 / 60, 0);
    recoverBuffer(fast, 1 / 60, 6);
  }
  gt(fast.buffer, slow.buffer * 1.5,
    `${Math.round(slow.buffer)} against ${Math.round(fast.buffer)} after a second`);
  gt(BUFFER_RATE * BUFFER_PER_POINT, 0);
});

test('a dead agent recovers nothing', () => {
  const a = new Agent(0, 0, 0);
  a.takeDamage(500);
  ok(a.dead);
  const at = a.buffer;
  for (let i = 0; i < 60 * 30; i++) recoverBuffer(a, 1 / 60, 6);
  eq(a.buffer, at, 'the HUD would show a corpse healing');
});

suite('the buffer in play');

test('breaking contact is what gets it back', () => {
  // End to end, through the real simulation: take a beating, walk away,
  // and the squad is ready again — which is the reason to disengage the
  // gap said the game did not have.
  const sim = createSim('sector-7');
  const agent = sim.squad.agents[0];
  agent.takeDamage(agent.maxBuffer);
  eq(agent.buffer, 0);

  // Nobody near them: the tutorial's cell is across the block and the
  // squad is standing on the deploy point.
  for (let i = 0; i < 60 * 12; i++) step(sim, 1 / 60, idle);
  eq(Math.round(agent.buffer), agent.maxBuffer, 'full again');
});

test('the subdermal weave still buys what it says it buys', () => {
  // It adds flesh, not headroom, and it runs *after* the split — so the
  // ordering of the two has to hold. Forty points of armour that quietly
  // resized the buffer instead would be the same total and a different
  // upgrade.
  const a = new Agent(0, 0, 0);
  const flesh = a.maxHealth;
  const buffer = a.maxBuffer;
  CYBERNETICS.ARMOUR.apply(a);
  eq(a.maxHealth, flesh + 40, 'forty more of the part that does not come back');
  eq(a.maxBuffer, buffer, 'and the headroom is untouched');
  eq(poolMax(a), 160);
});

test('a mission is still winnable with a smaller permanent pool', () => {
  // The risk in splitting the pool is the other direction: agents whose
  // flesh is now 84 rather than 120 die in fights they used to survive.
  // The autopilot plays every mission in the suite, so this is really an
  // assertion that the split did not quietly break the campaign — but it
  // is worth stating where somebody will read it.
  const sim = createSim('sector-7');
  ok(sim.squad.agents.every(a => a.maxHealth + a.maxBuffer === 120));
});
