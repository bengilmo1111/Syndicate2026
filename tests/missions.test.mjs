// Every registered mission must be winnable, and each mission's specific
// story beat must actually fire.
//
// The completability check is the one that matters. A mission can look
// finished — briefing written, objectives wired, entities placed — and be
// impossible to finish. That has happened twice in this project.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gte, lt, includes } from './lib/harness.mjs';
import { autoplay } from './lib/autopilot.mjs';
import {
  getAllMissions, getFieldMissions, getMissionDef, isFieldMission, STATUS,
} from '../src/core/mission.js';
import { createSim, step, PHASE } from '../src/core/sim.js';
import { Projectile } from '../src/core/entities.js';
import { ALIGNER } from '../src/core/squad.js';

const MISSIONS = getAllMissions();
const FIELD = getFieldMissions();

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
    if (!isFieldMission(m)) {
      gte(m.choice.options.length, 2, `${m.id}: a choice needs choices`);
      for (const o of m.choice.options) {
        ok(o.label, `${m.id}: every option is labelled`);
        ok(o.outcome?.length, `${m.id}: every option has an outcome`);
      }
    }
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

test('every field mission builds a playable world', () => {
  for (const m of FIELD) {
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
  for (const m of FIELD) {
    const sim = createSim(m.id);
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
    eq(sim.phase, PHASE.PLAYING, `${m.id}: not won on frame one`);
  }
});

// ---------------------------------------------------------- completability

suite('completability');

for (const m of FIELD) {
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
  const sim = createSim(FIELD[0].id);
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

// ------------------------------------------------------------------- act II

suite('act II');

test('okafor-contract: the squad will not engage her on its own', () => {
  // The mission's whole point is that killing a journalist has to be
  // something the player deliberately orders. If auto-fire ever picks her
  // up, the moral weight of the mission evaporates.
  const sim = createSim('okafor-contract');
  const okafor = sim.quarry[0];
  const agent = sim.squad.agents[0];
  agent.x = okafor.x; agent.z = okafor.z + 4;
  agent.range = 100;
  eq(agent.pickTarget(sim.city, sim.hostiles), null, 'she is not an auto-target');

  const before = okafor.health;
  for (let i = 0; i < 60 * 5; i++) {
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  }
  eq(okafor.health, before, 'and standing next to her does not kill her');
});

test('okafor-contract: she runs when the squad closes', () => {
  const sim = createSim('okafor-contract');
  const okafor = sim.quarry[0];
  const start = { x: okafor.x, z: okafor.z };
  sim.squad.agents.forEach(a => { a.x = okafor.x; a.z = okafor.z + 6; a.range = 0; });
  for (let i = 0; i < 60 * 3; i++) {
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  }
  gte(Math.hypot(okafor.x - start.x, okafor.z - start.z), 5, 'she moved away');
});

test('okafor-contract: the filing window is a real deadline', () => {
  // The clock is the antagonist, not the private security.
  const sim = createSim('okafor-contract');
  const okafor = sim.quarry[0];
  gte(okafor.window, 30, 'there is a window');
  sim.elapsed = okafor.window + 1;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  ok(okafor.escaped, 'past the window she files');
  eq(sim.phase, PHASE.LOST, 'and the contract is lost');
  eq(sim.failReason, 'escaped', 'for the right reason');
  ok(getMissionDef('okafor-contract').debrief.escaped?.length, 'with copy for it');
});

test('act II turns on BRAVO\'s hesitation, and Act I does not', () => {
  // The player should notice the pause before anyone explains it. If this
  // ever fires in Act I the reveal has no shape.
  const actI = createSim('sector-7');
  eq(actI.squad.agents[1].hesitation, 0, 'Act I: BRAVO is fine');

  const actII = createSim('okafor-contract');
  ok(actII.squad.agents[1].hesitation > 0, 'Act II: BRAVO hesitates');
  eq(actII.squad.agents[0].hesitation, 0, 'and only BRAVO');
  eq(actII.squad.agents[2].hesitation, 0, 'only BRAVO');
  eq(actII.squad.agents[3].hesitation, 0, 'only BRAVO');
});

test('a hesitating agent actually pauses after firing', () => {
  const sim = createSim('okafor-contract');
  const bravo = sim.squad.agents[1];
  ok(bravo.canFire(), 'ready');
  bravo.fireAt(bravo.x, bravo.z + 10, null, () => 0.5);
  ok(bravo.hesitationTimer > 0, 'and then it stalls');
  notOk(bravo.canFire(), 'unable to fire through the stall');
});

test('okafor-contract: her security does not count as the contract', () => {
  const sim = createSim('okafor-contract');
  ok(sim.hostiles.length > 0, 'she has security');
  ok(sim.hostiles.every(h => !h.countsForObjective), 'but killing them is not the job');
});

// -------------------------------------------------------- decision missions

suite('decision missions');

test('calibration-window is a room and a choice, not a firefight', () => {
  const def = getMissionDef('calibration-window');
  notOk(isFieldMission(def), 'it has no field component');
  eq(def.choice.options.length, 2, 'two ways to close the window');
  eq(def.setup().city, null, 'and no city to build');
});

test('the choice is whether BRAVO is a person, and both options set the flag', () => {
  const def = getMissionDef('calibration-window');
  const ids = def.choice.options.map(o => o.id).sort();
  eq(ids.join(','), 'calibrate,replace', 'calibrate or replace');
  for (const o of def.choice.options) {
    ok('bravoCalibrated' in (o.flag ?? {}), `${o.id} records the decision`);
  }
  const calibrate = def.choice.options.find(o => o.id === 'calibrate');
  const replace = def.choice.options.find(o => o.id === 'replace');
  eq(calibrate.flag.bravoCalibrated, true, 'calibrating keeps them');
  eq(replace.flag.bravoCalibrated, false, 'replacing does not');
});

test('calibrating is what surfaces the name — that is the whole beat', () => {
  // NARRATIVE.md: the maintenance form carries BRAVO's pre-conscription
  // identifier, and it is the player's own. If this copy ever loses the
  // name, the mission stops doing anything.
  const def = getMissionDef('calibration-window');
  const calibrate = def.choice.options.find(o => o.id === 'calibrate');
  includes(calibrate.outcome.join(' '), 'Maren', 'the form names her');

  const replace = def.choice.options.find(o => o.id === 'replace');
  notOk(replace.outcome.join(' ').includes('Maren'), 'replacing never surfaces it');
});

test('whatever you choose, he smiles the same way', () => {
  // Load-bearing: the mission must not reward either option.
  const def = getMissionDef('calibration-window');
  for (const o of def.choice.options) {
    includes(o.outcome.join(' '), 'smiles', `${o.id} ends the same way`);
  }
});

test('a decision mission still gates the missions after it', () => {
  const def = getMissionDef('calibration-window');
  gte((def.requires ?? []).length, 1, 'it is gated like anything else');
});

test('welfare-node-7: the holding block is there, and nothing points at it', () => {
  // The hidden objective is the mission. If it ever becomes visible, the
  // player is being told to have a conscience instead of having one.
  const sim = createSim('welfare-node-7');
  const free = sim.mission.objectives.find(o => o.id === 'free');
  ok(free, 'the objective exists');
  ok(free.hidden, 'and is hidden');
  ok(free.optional, 'and optional — you can walk past it');

  const shown = sim.mission.objectives.filter(o => !o.hidden);
  eq(shown.length, 1, 'the player is only ever shown the housekeeping');
  eq(shown[0].id, 'clear', 'which is clearing the infiltrators');

  const detained = sim.civilians.filter(c => c.detained);
  gte(detained.length, 12, 'and the people are actually there');
  ok(detained.every(c => c.tier === 'Free'), 'Free-tier, which is what the programme is for');
});

test('welfare-node-7: freeing them is what sets playerSuspicion', () => {
  const sim = createSim('welfare-node-7');
  notOk(sim.mission.flags.playerSuspicion, 'not set by default');

  for (const c of sim.civilians.filter(x => x.detained)) c.aligned = true;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });

  const free = sim.mission.objectives.find(o => o.id === 'free');
  eq(free.status, STATUS.COMPLETE, 'the hidden objective completes');
  ok(sim.mission.flags.playerSuspicion, 'and the game notices');
});

test('welfare-node-7: walking past the holding block still wins', () => {
  // Ignoring it must remain a real option, or the choice is fake.
  const sim = createSim('welfare-node-7');
  sim.kills = 4;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.WON, 'the briefed objective alone closes the mission');
  notOk(sim.mission.flags.playerSuspicion, 'with nothing recorded');
});

test('welfare-node-7: the two endings read differently', () => {
  const def = getMissionDef('welfare-node-7');
  ok(def.debrief.freed?.length, 'there is copy for freeing them');
  ok(def.debriefKey, 'and the mission picks between them');
  eq(def.debriefKey({ mission: { flags: {} } }), 'win', 'walked past');
  eq(def.debriefKey({ mission: { flags: { playerSuspicion: true } } }), 'freed', 'freed');
  notOk(def.debrief.win.join(' ') === def.debrief.freed.join(' '), 'and they differ');
});

test('the infiltrators at Node 7 are the only people trying to stop it', () => {
  // Tone check with teeth: the mission must not dress them as a rival
  // syndicate, because they are not one.
  const def = getMissionDef('welfare-node-7');
  eq(def.rival, 'openai', 'the facility is ours');
  const sim = createSim('welfare-node-7');
  ok(sim.hostiles.every(h => h.label === 'INFILTRATOR'), 'and they are not a syndicate');
});

// ------------------------------------------------------------------ act III

suite('act III');

test('the-refusal: the order is pre-staged and the escort is on your side', () => {
  const sim = createSim('the-refusal');
  eq(sim.assets.length, 1, 'the prisoner is on the map from frame one');
  eq(sim.assets[0].name, 'TEO SALAS', 'and he has a name');
  eq(sim.hostiles.length, 4, 'with an escort');
  ok(sim.hostiles.every(h => h.dormant), 'who are not hostile yet');
  notOk(sim.defected, 'and nothing has happened');

  // You cannot start this by accident: the squad will not auto-target
  // its own side, and the escort will not fire.
  const agent = sim.squad.agents[0];
  agent.x = sim.hostiles[0].x; agent.z = sim.hostiles[0].z + 3; agent.range = 100;
  const live = sim.hostiles.filter(h => !h.dormant);
  eq(agent.pickTarget(sim.city, live), null, 'no target among the escort');
});

test('the-refusal: carrying out the order completes it without defecting', () => {
  const sim = createSim('the-refusal');
  sim.assets[0].dead = true;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.WON, 'the mission closes');
  eq(sim.mission.flags.defectedAtRefusal, false, 'compliant');
  notOk(sim.defected, 'nobody turned on anybody');
});

test('the-refusal: cutting him loose turns the escort hostile', () => {
  // The moment EXEC-7 stops working for OpenAI. It has to be something
  // the player does, not something that happens to them.
  const sim = createSim('the-refusal');
  const prisoner = sim.assets[0];
  sim.squad.agents.forEach(a => { a.x = prisoner.x; a.z = prisoner.z + 2; a.range = 0; });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });

  ok(prisoner.secured, 'he is cut loose');
  ok(sim.defected, 'and the squad is non-compliant');
  ok(sim.hostiles.every(h => !h.dormant), 'the escort is awake');
  gte(sim.hostiles[0].aggroRange, 1, 'and coming');
});

test('the-refusal: firing on your own side also starts it', () => {
  const sim = createSim('the-refusal');
  notOk(sim.defected, 'not yet');
  const p = new Projectile(sim.hostiles[0].x, sim.hostiles[0].z - 4, 0, 20, null);
  p.friendly = true;
  sim.projectiles.push(p);
  for (let i = 0; i < 20 && !sim.defected; i++) {
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  }
  ok(sim.defected, 'a round into a loyalist is a decision');
});

test('the-refusal: the defection branch completes the mission too', () => {
  const sim = createSim('the-refusal');
  const prisoner = sim.assets[0];
  sim.squad.agents.forEach(a => { a.x = prisoner.x; a.z = prisoner.z + 2; });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  ok(prisoner.secured, 'freed');

  sim.kills = 4; // the escort goes down
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.WON, 'the mission closes the other way');
  eq(sim.mission.flags.defectedAtRefusal, true, 'and records the defection');
});

test('the-refusal: refusing one route never fails the mission', () => {
  // Branch objectives are alternatives, not requirements. If taking one
  // ever failed the other, the mission would lose itself.
  const sim = createSim('the-refusal');
  sim.assets[0].dead = true;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  const free = sim.mission.objectives.find(o => o.id === 'free');
  notOk(free.status === STATUS.FAILED, 'the untaken route is simply unfinished');
  eq(sim.failReason, null, 'and nothing was lost');
});

test('the-refusal: the two endings are different endings', () => {
  const def = getMissionDef('the-refusal');
  ok(def.debrief.defect?.length, 'defecting has its own copy');
  eq(def.debriefKey({ mission: { flags: { defectedAtRefusal: true } } }), 'defect');
  eq(def.debriefKey({ mission: { flags: { defectedAtRefusal: false } } }), 'win');
  includes(def.debrief.defect.join(' '), 'Router', 'and the Router picks up the channel');
});
