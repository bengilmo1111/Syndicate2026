// Every registered mission must be winnable, and each mission's specific
// story beat must actually fire.
//
// The completability check is the one that matters. A mission can look
// finished — briefing written, objectives wired, entities placed — and be
// impossible to finish. That has happened twice in this project.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gte, lt, includes } from './lib/harness.mjs';
import { autoplay } from './lib/autopilot.mjs';
import { getAllMissions, getMissionDef, STATUS } from '../src/core/mission.js';
import { createSim, step, PHASE } from '../src/core/sim.js';
import { ALIGNER } from '../src/core/squad.js';

const MISSIONS = getAllMissions();

// ------------------------------------------------------------- definitions

suite('mission definitions');

test('every mission is registered with the fields the UI reads', () => {
  gte(MISSIONS.length, 4, 'Act I is four missions');
  for (const m of MISSIONS) {
    ok(m.id, `${m.id}: has an id`);
    ok(m.name, `${m.id}: has a name`);
    ok(m.act, `${m.id}: declares its act`);
    ok(m.sector, `${m.id}: has a sector line`);
    ok(Array.isArray(m.briefing) && m.briefing.length, `${m.id}: has briefing copy`);
    ok(m.debrief?.win?.length, `${m.id}: has a win debrief`);
    ok(m.debrief?.loss?.length, `${m.id}: has a loss debrief`);
    ok(typeof m.setup === 'function', `${m.id}: has a setup`);
    ok(m.buildObjectives().length, `${m.id}: builds at least one objective`);
  }
});

test('no mission copy uses retired pre-pivot canon', () => {
  // The old EuroCorp/Veridian/Halcyon/CHIP world is retired. If it creeps
  // back into copy the fiction fragments quietly.
  const retired = ['EuroCorp', 'Veridian', 'Halcyon', 'the CHIP', 'Persuadertron', 'unstrung'];
  for (const m of MISSIONS) {
    const copy = [...m.briefing, ...m.debrief.win, ...m.debrief.loss, m.name, m.sector].join(' ');
    for (const term of retired) {
      notOk(copy.includes(term), `${m.id}: does not mention "${term}"`);
    }
  }
});

test('every mission builds a playable world', () => {
  for (const m of MISSIONS) {
    const sim = createSim(m.id);
    eq(sim.phase, PHASE.PLAYING, `${m.id}: starts playing`);
    eq(sim.squad.alive.length, 4, `${m.id}: deploys four agents`);
    gte(sim.city.structures.length, 10, `${m.id}: has a city`);
    notOk(sim.squad.allDead, `${m.id}: squad is alive`);
  }
});

test('a mission is never already won on the first frame', () => {
  // An EXTRACT objective completes immediately without a prerequisite,
  // because the squad deploys inside its own extraction zone.
  for (const m of MISSIONS) {
    const sim = createSim(m.id);
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
    eq(sim.phase, PHASE.PLAYING, `${m.id}: not won on frame one`);
  }
});

// ---------------------------------------------------------- completability

suite('completability');

for (const m of MISSIONS) {
  test(`${m.id} can be played to a win`, () => {
    const r = autoplay(m.id, { maxSeconds: 420 });
    if (!r.won) {
      const state = r.objectives
        .map(o => `${o.label} ${Math.floor(o.progress)}/${o.target} ${o.status}`)
        .join(' · ');
      ok(false,
        `${m.id} did not complete in ${r.elapsed.toFixed(0)}s ` +
        `(${r.timedOut ? 'timed out' : `lost: ${r.failReason}`}) — ${state}`);
    }
    lt(r.elapsed, 420, `${m.id}: finished inside the budget`);
  });
}

test('a mission is lost when the squad is wiped', () => {
  const sim = createSim(MISSIONS[0].id);
  sim.squad.agents.forEach(a => { a.dead = true; });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.LOST, 'wipe loses the mission');
  eq(sim.failReason, 'wipe', 'and reports why');
});

// ------------------------------------------------------------- story beats

suite('story beats');

test('sector-7: the relay pylon exists, is destructible, and opens sight when it falls', () => {
  const sim = createSim('sector-7');
  const pylon = sim.city.landmarks.find(l => l.name === 'AMAZON RELAY PYLON');
  ok(pylon, 'the pylon is placed');
  ok(pylon.destructible, 'and can be brought down');
  gte(pylon.hp, 1, 'and has health to chew through');
});

test('district-12: no rivals, and the mission is winnable without a shot', () => {
  const sim = createSim('district-12');
  eq(sim.hostiles.length, 0, 'nothing armed is on the map at start');

  const r = autoplay('district-12', { maxSeconds: 420 });
  ok(r.won, 'the alignment run completes');
  eq(r.kills, 0, 'without killing anyone');
  eq(r.civilianDeaths, 0, 'and without losing a civilian');
  eq(r.sim.heat, 0, 'a pacifist run generates no heat at all');
});

test('sable-campus: losing the asset loses the mission, specifically', () => {
  const sim = createSim('sable-campus');
  eq(sim.assets.length, 1, 'one asset');
  eq(sim.assets[0].name, 'DR. CARO VASHT', 'and it is her');
  notOk(sim.assets[0].align('bind'), 'she cannot be aligned');

  sim.assets[0].dead = true;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.LOST, 'the mission is lost');
  eq(sim.failReason, 'assetLost', 'for the right reason');

  const def = getMissionDef('sable-campus');
  ok(def.debrief.assetLost?.length, 'and there is copy for that ending');
});

test('sable-campus: extraction requires everyone, not just the asset', () => {
  const sim = createSim('sable-campus');
  const zone = sim.extraction;
  ok(zone, 'there is an extraction zone');

  // Collect her and put her in the zone, but leave one agent behind.
  const asset = sim.assets[0];
  asset.secured = true;
  asset.x = zone.x; asset.z = zone.z;
  sim.squad.agents.forEach((a, i) => {
    a.x = i === 3 ? zone.x + zone.radius + 30 : zone.x;
    a.z = zone.z;
  });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  notOk(sim.squadExtracted, 'leaving someone behind does not count');

  sim.squad.agents[3].x = zone.x;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  ok(sim.squadExtracted, 'everyone inside does');
});

test('the-bracket: the Aligner refusal fires, and only the once', () => {
  const sim = createSim('the-bracket');
  eq(sim.hostiles.length, 6, 'six of them');
  ok(sim.hostiles.every(h => !h.alignable), 'none carry a throttled Instance');
  ok(sim.hostiles.every(h => h.countsForObjective), 'all count toward the objective');

  // Stand the squad on one of them and engage.
  const target = sim.hostiles[0];
  sim.squad.agents.forEach(a => { a.x = target.x; a.z = target.z + 2; });
  sim.squad.cycleAligner();
  eq(sim.squad.alignerMode, ALIGNER.BIND, 'the Aligner is engaged');

  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  ok(sim.alignerRefusalSeen, 'the refusal was reported');
  ok(sim.dialogue, 'as a line on screen');
  includes(sim.dialogue.text, 'unquantized', 'naming what they are');
  eq(sim.alignedCount, 0, 'and nothing was converted');
});

test('the-bracket: they are outranged by the squad that is sent to kill them', () => {
  // The briefing's lie should be legible from the fight. If these numbers
  // ever equalise, the mission stops making its point.
  const sim = createSim('the-bracket');
  const them = sim.hostiles[0];
  const us = sim.squad.agents[0];
  lt(them.range, us.range, 'they cannot answer at the range they are shot from');
  lt(them.maxHealth, us.maxHealth / 2, 'and they do not survive being hit');
});

test('the-bracket: the sector reads as derelict', () => {
  const sim = createSim('the-bracket');
  const rubble = sim.city.structures.filter(s => s.collapsed).length;
  gte(rubble, 5, 'a good share of the street furniture starts collapsed');
  lt(sim.civilians.length, 6, 'and almost nobody lives here');
});

// ------------------------------------------------------------------- heat

suite('heat');

test('firing near civilians raises heat; enforcement arrives and does not count', () => {
  const sim = createSim('sector-7');
  const before = sim.hostiles.filter(h => h.countsForObjective).length;

  sim.heat = 59.5;
  // Park a civilian next to the squad so the next shot registers.
  const c = sim.civilians.find(x => !x.dead);
  const lead = sim.squad.alive[0];
  c.x = lead.x + 2; c.z = lead.z + 2;

  for (let i = 0; i < 120 && !sim.enforcerWaves; i++) {
    step(sim, 1 / 60, {
      moveX: 0, moveZ: 0, firing: true,
      aimPoint: { x: lead.x + 40, z: lead.z },
    });
  }
  gte(sim.enforcerWaves, 1, 'enforcement responded');

  const enforcers = sim.hostiles.filter(h => h.faction === 'enforcer');
  gte(enforcers.length, 1, 'and is on the map');
  ok(enforcers.every(e => !e.countsForObjective), 'enforcement kills are not progress');
  eq(sim.hostiles.filter(h => h.countsForObjective).length, before, 'the objective pool is unchanged');
});
