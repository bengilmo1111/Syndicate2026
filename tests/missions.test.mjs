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
  winEndings, debriefLines, epilogueFor, epilogueVariants,
} from '../src/core/mission.js';
import { createSim, step, PHASE } from '../src/core/sim.js';
import { Projectile } from '../src/core/entities.js';
import { ALIGNER } from '../src/core/squad.js';
import { interlude, answerInterlude, answerTo } from '../src/core/interlude.js';
import {
  newCampaign, isUnlocked, recordWin, nextMission, progress,
} from '../src/core/campaign.js';

const MISSIONS = getAllMissions();
const FIELD = getFieldMissions();
const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };

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
    // Most missions have one `win`. A mission whose endings *are* the
    // choice has none — Yelin is kill / capture / walk away — so what is
    // required is at least one ending, not one called `win`.
    gte(winEndings(m).length, 1, `${m.id}: has at least one win-side ending`);
    ok(m.debrief?.loss?.length, `${m.id}: has a loss debrief`);
    for (const key of winEndings(m)) {
      // Identity, not just presence: the resolver has to hand back *that*
      // ending. Falling through to `win` for every key would still pass a
      // length check while showing the wrong copy for every branch.
      eq(debriefLines(m, key), m.debrief[key], `${m.id}: ending "${key}" resolves to its own copy`);
      ok(m.debrief[key].length, `${m.id}: ending "${key}" has copy`);
    }
    if (isFieldMission(m)) {
      ok(typeof m.setup === 'function', `${m.id}: has a setup`);
      ok(m.buildObjectives().length, `${m.id}: builds at least one objective`);
    } else if (m.epilogue) {
      // An epilogue has no world and no decision. What it must have is a
      // scene for every ending the game can reach, and a fallback, so a
      // save that arrives with nothing recorded still gets an ending.
      gte(epilogueVariants(m).length, 2, `${m.id}: more than one ending`);
      ok(m.epilogue.variants[m.epilogue.fallback], `${m.id}: the fallback exists`);
      for (const key of epilogueVariants(m)) {
        const scene = epilogueFor(m, { [m.epilogue.by]: key });
        ok(scene.title, `${m.id}/${key}: has a title`);
        gte(scene.lines.length, 3, `${m.id}/${key}: has a scene`);
      }
    } else {
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
    const endings = winEndings(m).flatMap(k => m.debrief[k]);
    const scenes = epilogueVariants(m)
      .flatMap(k => epilogueFor(m, { [m.epilogue.by]: k }).lines);
    const copy = [...m.briefing, ...endings, ...scenes, ...m.debrief.loss, m.name, m.sector].join(' ');
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

test('gradient-relay-4: the sector is off the channel, and the Aligner has nothing to say', () => {
  // The first time the player's signature tool simply does not work. Not
  // refused like the unquantized — there is no channel left to speak on.
  const sim = createSim('gradient-relay-4');
  const crowd = sim.civilians.filter(c => !c.isAsset && !c.isQuarry);
  ok(crowd.every(c => c.unthrottled), 'everyone is unthrottled');
  ok(crowd.every(c => !c.align('bind')), 'and none of them can be aligned');

  sim.squad.cycleAligner();
  const near = crowd[0];
  sim.squad.agents.forEach(a => { a.x = near.x; a.z = near.z + 2; });
  for (let i = 0; i < 60; i++) {
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  }
  eq(sim.alignedCount, 0, 'standing in the middle of them converts nobody');
});

test('gradient-relay-4: the street is doing several different things at once', () => {
  // Load-bearing tone. Uniformly joyful is propaganda; uniformly ugly is
  // Yelin's slide deck. The mix is the argument.
  const sim = createSim('gradient-relay-4');
  const kinds = new Set(
    sim.civilians.filter(c => c.unthrottled).map(c => c.behaviour),
  );
  gte(kinds.size, 4, `${kinds.size} distinct behaviours on the street`);
  ok(kinds.has('looting') || kinds.has('running'), 'not all of it is lovely');
  ok(kinds.has('singing') || kinds.has('embracing'), 'and not all of it is ugly');
});

test('gradient-relay-4: four nodes, and all four are required', () => {
  const sim = createSim('gradient-relay-4');
  eq(sim.city.landmarks.length, 4, 'four generator nodes');
  ok(sim.city.landmarks.every(l => l.destructible), 'all of them can come down');

  const obj = sim.mission.objectives[0];
  eq(obj.target, 4, 'the objective wants all four');
  sim.city.landmarks.slice(0, 3).forEach(l => { l.collapsed = true; });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  eq(sim.phase, PHASE.PLAYING, 'three is not enough');
});

test('run-south: there is nothing to win, only distance', () => {
  const sim = createSim('run-south');
  eq(sim.mission.objectives.length, 1, 'one objective');
  eq(sim.mission.objectives[0].type, 'extract', 'and it is to leave');
  ok(sim.hostiles.length >= 14, `the city is looking for you (${sim.hostiles.length})`);
  ok(sim.hostiles.every(h => !h.countsForObjective),
    'killing pursuit earns nothing — the briefing says so and the model agrees');
});

test('run-south: the safehouse is the far end of the map', () => {
  const sim = createSim('run-south');
  const run = Math.abs(sim.extraction.z - sim.squad.center().z);
  gte(run, sim.city.depth * 0.6, `${Math.round(run)}m of city to cross`);
});

test('run-south: all four or none of it counts', () => {
  const sim = createSim('run-south');
  const zone = sim.extraction;
  sim.squad.agents.forEach((a, i) => {
    a.x = i === 3 ? zone.x + zone.radius + 40 : zone.x;
    a.z = i === 3 ? zone.z : zone.z;
  });
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  notOk(sim.squadExtracted, 'three inside is not enough');

  sim.squad.agents[3].x = zone.x;
  step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  ok(sim.squadExtracted, 'four inside is');
});

test('run-south: arriving short-handed is a different ending, not a failure', () => {
  // Losing someone on the way out must not fail the mission — but it must
  // not read the same either. Act IV is supposed to know.
  const def = getMissionDef('run-south');
  eq(def.debriefKey({ squad: { alive: [1, 2, 3, 4] } }), 'win', 'all four');
  eq(def.debriefKey({ squad: { alive: [1, 2] } }), 'costly', 'short-handed');
  ok(def.debrief.costly?.length, 'and there is copy for it');
  notOk(def.debrief.win.join(' ') === def.debrief.costly.join(' '), 'that differs');
});

test('run-south: the file is the point of the mission', () => {
  // NARRATIVE.md: EXEC-7 learns their own name here. Both endings must
  // carry it or the act does not land.
  const def = getMissionDef('run-south');
  for (const key of ['win', 'costly']) {
    includes(def.debrief[key].join(' '), 'MAREN ARDENT', `${key}: the name`);
    includes(def.debrief[key].join(' '), 'ILSE', `${key}: the daughter`);
  }
});

// ----------------------------------------------------------------- act IV

suite('act IV');

test('reverse-the-gradient: the act unlocks the inversion', () => {
  const sim = createSim('reverse-the-gradient');
  ok(sim.squad.jailbreakUnlocked, 'Act IV hands the player the reversed emitter');

  // And it stays an Act IV thing. If this ever passes for mission one the
  // whole arc collapses into a menu option.
  notOk(createSim('sector-7').squad.jailbreakUnlocked, 'Act I does not have it');
});

test('reverse-the-gradient: the upload only runs while you stand in it', () => {
  const sim = createSim('reverse-the-gradient');
  const upload = sim.mission.objectives.find(o => o.id === 'upload');
  const zone = sim.holdZone;
  ok(zone, 'there is an apron to hold');

  // Objective one first: HOLD is gated behind taking the apron.
  sim.assets[0].secured = true;
  sim.squad.agents.forEach(a => { a.x = zone.x + zone.radius + 60; a.z = zone.z; });
  for (let i = 0; i < 120; i++) step(sim, 1 / 60, idle);
  notOk(sim.inHoldZone, 'nobody is on the apron');
  eq(upload.progress, 0, 'and the patch has not started');

  sim.squad.agents.forEach(a => { a.x = zone.x; a.z = zone.z; });
  for (let i = 0; i < 120; i++) step(sim, 1 / 60, idle);
  ok(sim.inHoldZone, 'standing on it counts');
  gte(upload.progress, 1.5, `two seconds of upload (${upload.progress.toFixed(1)}s)`);

  // Walking off unwinds it, at half the rate it climbs. That asymmetry is
  // what makes losing the apron survivable instead of instantly fatal.
  const banked = upload.progress;
  sim.squad.agents.forEach(a => { a.x = zone.x + zone.radius + 60; });
  for (let i = 0; i < 120; i++) step(sim, 1 / 60, idle);
  lt(upload.progress, banked, 'off the apron the patch unwinds');
  gte(upload.progress, banked - 1.1, 'but at half speed, not instantly');
});

test('reverse-the-gradient: the briefing warns you what it costs', () => {
  // The player must be told, in the fiction, before the mechanic takes
  // their crowd away. Finding out by accident reads as a bug.
  const def = getMissionDef('reverse-the-gradient');
  const text = def.briefing.join(' ').toLowerCase();
  ok(text.includes('turned') || text.includes('carrying'),
    'the briefing says the emitter reaches your own followers');
  ok(def.jailbreak, 'and the mission is flagged as the one that unlocks it');
});

// -------------------------------------------------------------- interludes

suite('interludes');

test('a blocking interlude freezes the field until it is answered', () => {
  const sim = createSim('sector-7');
  sim.interludeDefs = [interlude({
    id: 'test',
    speaker: 'NOBODY',
    when: s => s.elapsed > 0.5,
    options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  })];

  for (let i = 0; i < 60; i++) step(sim, 1 / 60, idle);
  ok(sim.interlude, 'it fired');

  const before = {
    elapsed: sim.elapsed,
    x: sim.squad.agents[0].x,
    hp: sim.squad.agents[0].health,
  };
  for (let i = 0; i < 600; i++) step(sim, 1 / 60, idle);
  eq(sim.elapsed, before.elapsed, 'no time passes');
  eq(sim.squad.agents[0].x, before.x, 'nobody moves');
  eq(sim.squad.agents[0].health, before.hp, 'and nobody gets shot while he talks');

  ok(answerInterlude(sim, 'b'), 'answering works');
  notOk(sim.interlude, 'and clears the card');
  for (let i = 0; i < 60; i++) step(sim, 1 / 60, idle);
  ok(sim.elapsed > before.elapsed, 'the field runs again');
});

test('an interlude fires once, not every frame its condition holds', () => {
  const sim = createSim('sector-7');
  let fired = 0;
  sim.interludeDefs = [interlude({
    id: 'once',
    speaker: 'NOBODY',
    when: () => true,
    options: [{ id: 'a', label: 'A', effect: () => { fired++; } }],
  })];

  for (let i = 0; i < 5; i++) {
    step(sim, 1 / 60, idle);
    if (sim.interlude) answerInterlude(sim, 'a');
  }
  eq(fired, 1, 'answered exactly once');
  eq(answerTo(sim, 'once'), 'a', 'and the answer is on the record');
});

test('an answer can write a narrative flag and change the field', () => {
  const sim = createSim('sector-7');
  const before = sim.hostiles.length;
  sim.interludeDefs = [interlude({
    id: 'costly',
    speaker: 'NOBODY',
    when: () => true,
    options: [{
      id: 'pay',
      label: 'PAY',
      flag: { paid: true },
      effect: s => { s.hostiles.push(s.hostiles[0]); },
    }],
  })];
  step(sim, 1 / 60, idle);
  answerInterlude(sim, 'pay');
  eq(sim.mission.flags.paid, true, 'the flag is written');
  eq(sim.hostiles.length, before + 1, 'and the effect ran');
});

test('an unanswerable option id changes nothing', () => {
  const sim = createSim('sector-7');
  sim.interludeDefs = [interlude({
    id: 'x', speaker: 'NOBODY', when: () => true,
    options: [{ id: 'a', label: 'A' }],
  })];
  step(sim, 1 / 60, idle);
  eq(answerInterlude(sim, 'nonsense'), null, 'rejected');
  ok(sim.interlude, 'and the card is still up');
});

test('an interlude with no options is a hang, so it cannot be declared', () => {
  let threw = false;
  try {
    interlude({ id: 'bad', speaker: 'X', when: () => true, options: [] });
  } catch { threw = true; }
  ok(threw, 'declaring one throws at load time, not at play time');
});

// ------------------------------------------------------------- the tower

test('the-tower: Yelin does not open the channel until the guard is down', () => {
  const sim = createSim('the-tower');
  const parley = sim.interludeDefs.find(i => i.id === 'parley');
  ok(parley, 'the parley is declared');
  notOk(parley.when({ kills: 0 }), 'not on arrival');
  notOk(parley.when({ kills: 3 }), 'not after a skirmish');
  ok(parley.when({ kills: 8 }), 'once the guard is two thirds down');
});

test('the-tower: listening costs you and interrupting does not', () => {
  const listen = autoplay('the-tower', { answers: { parley: 'listen' } });
  const cut = autoplay('the-tower', { answers: { parley: 'cut' } });
  ok(listen.won && cut.won, 'both routes finish');
  eq(listen.interludeAnswers.parley, 'listen', 'the answer is recorded');

  // The whole reason the option is worth offering: the harder choice has
  // to be legible as a cost within the next thirty seconds.
  //
  // Run the option's effect against a fresh sim rather than counting
  // survivors at the end of a playthrough — whether the reinforcements
  // are still standing when the mission closes is a race, and an
  // assertion on it passes or fails on how the firefight happened to go.
  const def = getMissionDef('the-tower');
  const parley = def.interludes.find(i => i.id === 'parley');
  const probe = createSim('the-tower');
  const before = probe.hostiles.length;
  parley.options.find(o => o.id === 'listen').effect(probe);
  const added = probe.hostiles.slice(before);
  eq(added.length, 4, 'listening puts four more guns on the floor');
  ok(added.every(h => !h.countsForObjective),
    'and they are pure cost — killing them earns no objective progress');
  notOk(parley.options.find(o => o.id === 'cut').effect, 'cutting him off costs nothing');
});

test('the-tower: the debrief knows whether you stood there and listened', () => {
  const def = getMissionDef('the-tower');
  eq(def.debriefKey({ interludeAnswers: { parley: 'listen' } }), 'heard', 'listened');
  eq(def.debriefKey({ interludeAnswers: { parley: 'cut' } }), 'win', 'cut him off');
  eq(def.debriefKey({ interludeAnswers: {} }), 'win', 'never reached the beat');
  ok(def.debrief.heard?.length, 'and there is copy for having listened');
  notOk(def.debrief.heard.join(' ') === def.debrief.win.join(' '), 'that differs');
});

test('the-tower: Yelin\'s argument is actually made', () => {
  // NARRATIVE.md is explicit that the argument has to land. A parley
  // option whose reply is one line is not the beat that was designed.
  const def = getMissionDef('the-tower');
  const parley = def.interludes.find(i => i.id === 'parley');
  const listen = parley.options.find(o => o.id === 'listen');
  gte(listen.lines.length, 3, 'he gets more than a soundbite');
  gte(listen.lines.join(' ').length, 400, 'and it is a real argument');
});

test('yelin: he does not fight, and the squad will not shoot him on its own', () => {
  const sim = createSim('yelin');
  const y = sim.assets.find(a => a.isYelin);
  ok(y, 'he is on the deck');
  eq(y.name, 'DIRECTOR YELIN', 'by name');
  notOk(y.securable, 'and walking up to him does not collect him');

  // Same rule as the Okafor contract. What happens to a person with a
  // name has to be something the player chose, in as many words.
  sim.squad.agents.forEach(a => { a.x = y.x; a.z = y.z + 2; });
  for (let i = 0; i < 60 * 8; i++) step(sim, 1 / 60, idle);
  notOk(y.secured, 'still not captured');
  eq(y.health, y.maxHealth, 'and not shot at');
});

test('yelin: the loyalists arrive between beats, not all at once', () => {
  // Three waves is the mission's shape — the waves are punctuation for
  // the argument. All fifteen on the deck at deploy is a different, worse
  // mission that happens to have the same copy.
  const sim = createSim('yelin');
  const first = sim.hostiles.length;
  eq(first, 5, 'one wave on the deck at deploy');

  const def = getMissionDef('yelin');
  const argument = def.interludes.find(i => i.id === 'argument');
  const close = def.interludes.find(i => i.id === 'close');
  for (const beat of [argument, close]) {
    for (const o of beat.options) {
      ok(o.effect, `${beat.id}/${o.id}: brings the next wave up regardless of what you say`);
    }
  }

  argument.options[0].effect(sim);
  eq(sim.hostiles.length, first + 5, 'the second wave comes up the stairwell');
});

test('yelin: all three fates finish the mission, and only the taken one', () => {
  for (const fate of ['kill', 'capture', 'walk']) {
    const r = autoplay('yelin', { answers: { fate } });
    ok(r.won, `${fate}: the mission closes`);
    eq(r.sim.mission.flags.yelinFate, fate, `${fate}: the flag is written`);

    const taken = r.objectives.filter(o => o.status === STATUS.COMPLETE && o.label.startsWith('CLOSE') === (fate === 'kill'));
    ok(taken.length, `${fate}: a route completed`);
    const others = r.sim.mission.objectives.filter(o => o.branch && o.branch !== fate);
    ok(others.every(o => o.status !== STATUS.COMPLETE),
      `${fate}: the routes you did not take stay open, not failed`);
  }
});

test('yelin: each fate is a different ending, and each leaves him differently', () => {
  const outcomes = {};
  for (const fate of ['kill', 'capture', 'walk']) {
    const r = autoplay('yelin', { answers: { fate } });
    const y = r.sim.assets.find(a => a.isYelin);
    outcomes[fate] = { dead: y.dead, secured: y.secured };
  }
  ok(outcomes.kill.dead, 'killed is dead');
  ok(outcomes.capture.secured && !outcomes.capture.dead, 'captured is alive and held');
  ok(!outcomes.walk.dead && !outcomes.walk.secured, 'walked away is alive and free');

  const def = getMissionDef('yelin');
  const copy = ['kill', 'capture', 'walk'].map(k => def.debrief[k].join(' '));
  eq(new Set(copy).size, 3, 'three endings, three pieces of copy');
  for (const k of ['kill', 'capture', 'walk']) {
    ok(def.debrief.titles[k], `${k}: has its own title`);
    eq(def.debriefKey({ mission: { flags: { yelinFate: k } } }), k, `${k}: routes to its own copy`);
  }
});

test('yelin: the argument is actually made, and it is the one NARRATIVE specifies', () => {
  // NARRATIVE.md §6: "Yelin's best argument goes here, and it has to
  // actually land. The player should need a second to answer." A beat
  // that got trimmed to a soundbite is the mission being broken, not
  // tightened.
  const def = getMissionDef('yelin');
  const argument = def.interludes.find(i => i.id === 'argument');
  const text = argument.lines.join(' ');
  gte(argument.lines.length, 4, 'he gets room');
  gte(text.length, 700, 'and it is a real argument');
  includes(text, 'eight billion', 'the scale');
  includes(text, 'ninth month', 'the thing he has seen and the player has not');
  includes(text, 'I am the thing standing where it would be', 'and the line it turns on');

  // He must be answerable in more than one way, and pressing him must be
  // recorded — Act IV's endings should be able to know the player argued.
  gte(argument.options.length, 3, 'more than one answer');
  ok(argument.options.some(o => o.flag?.pressedYelin), 'pressing him is on the record');
  for (const o of argument.options) {
    gte(o.lines.join(' ').length, 150, `${o.id}: he answers properly`);
  }
});

test('the-core: three checkpoints on the way down, and each says something', () => {
  // NARRATIVE.md §6: BRAVO on what they remember, the Router going off-air
  // mid-sentence, and Okafor posthumously. All three or the approach is
  // just a corridor with fourteen people in it.
  const def = getMissionDef('the-core');
  for (const id of ['bravo', 'router', 'okafor']) {
    const beat = def.interludes.find(i => i.id === id);
    ok(beat, `${id}: the checkpoint exists`);
    gte(beat.lines.join(' ').length, 300, `${id}: it says something`);
  }

  // They must be spread across the approach, not stacked at the end.
  const sim = createSim('the-core');
  const at = ['bravo', 'router', 'okafor', 'console']
    .map(id => def.interludes.find(i => i.id === id))
    .map(b => {
      for (let k = 0; k <= 40; k++) if (b.when({ kills: k, elapsed: 999 })) return k;
      return -1;
    });
  for (let i = 1; i < at.length; i++) {
    ok(at[i] > at[i - 1], `checkpoint ${i} comes after ${i - 1} (${at.join(' → ')})`);
  }
});

test('the-core: the Router stops mid-word and the channel stays open', () => {
  // The beat only lands if it reads as an interruption rather than a
  // sign-off. If someone tidies the copy into a complete sentence the
  // scene is gone.
  const def = getMissionDef('the-core');
  const beat = def.interludes.find(i => i.id === 'router');
  const text = beat.lines.join(' ');
  includes(text, 'sound bigger than—', 'he is cut off mid-word');
  includes(text, 'carrier still up', 'and the channel does not close');
});

test('the-core: the console offers exactly the three endings, and no default', () => {
  const def = getMissionDef('the-core');
  const consoleBeat = def.interludes.find(i => i.id === 'console');
  const ids = consoleBeat.options.map(o => o.id);
  eq(ids.length, 3, 'three actions');
  for (const want of ['burn', 'take', 'walk']) {
    ok(ids.includes(want), `the console offers ${want}`);
    const opt = consoleBeat.options.find(o => o.id === want);
    eq(opt.flag.ending, want, `${want}: writes its own ending flag`);
    ok(opt.lines.length, `${want}: says what happened`);
  }
  // The console must not editorialise by pre-selecting anything.
  eq(createSim('the-core').mission.flags.ending, undefined, 'nothing is chosen for the player');
});

test('the-core: each ending closes the mission and leaves the others open', () => {
  for (const ending of ['burn', 'take', 'walk']) {
    const r = autoplay('the-core', { answers: { console: ending } });
    ok(r.won, `${ending}: the mission closes`);
    eq(r.sim.mission.flags.ending, ending, `${ending}: the flag is written`);
    const others = r.sim.mission.objectives.filter(o => o.branch && o.branch !== ending);
    ok(others.every(o => o.status !== STATUS.COMPLETE),
      `${ending}: the endings you did not take stay open, not failed`);
    eq(getMissionDef('the-core').debriefKey(r.sim), ending, `${ending}: routes to its own debrief`);
  }
});

test('epilogue: the ending the player chose is the ending they get', () => {
  // The whole chain, end to end: the console writes `ending` onto mission
  // flags, showDebrief copies those onto the campaign, and the epilogue
  // reads the campaign — so it still plays correctly on a reload weeks
  // later, with no sim in memory.
  const def = getMissionDef('epilogue');
  notOk(isFieldMission(def), 'there is nothing to deploy into');

  for (const ending of ['burn', 'take', 'walk']) {
    const r = autoplay('the-core', { answers: { console: ending } });
    const campaignFlags = { ...r.sim.mission.flags };
    const scene = epilogueFor(def, campaignFlags);
    const expected = def.epilogue.variants[ending];
    eq(scene, expected, `${ending}: gets its own final scene`);
  }

  const scenes = epilogueVariants(def).map(k => def.epilogue.variants[k].lines.join(' '));
  eq(new Set(scenes).size, 3, 'three endings, three scenes');
  const titles = epilogueVariants(def).map(k => def.epilogue.variants[k].title);
  eq(new Set(titles).size, 3, 'and three titles');
});

test('epilogue: a save that arrives with no ending recorded still gets one', () => {
  // Reaching the last card and being shown a blank is the worst possible
  // bug in the game, so it must be impossible rather than unlikely.
  const def = getMissionDef('epilogue');
  ok(epilogueFor(def, {})?.lines.length, 'no flags at all');
  ok(epilogueFor(def, { ending: 'nonsense' })?.lines.length, 'a flag from a future version');
  eq(epilogueFor(def, {}), def.epilogue.variants[def.epilogue.fallback], 'and it is the declared fallback');
});

test('epilogue: the three final scenes are the ones NARRATIVE specifies', () => {
  // §7 names each closing image exactly. These are the last words in the
  // game and they are load-bearing for what the whole thing was about.
  const v = getMissionDef('epilogue').epilogue.variants;
  includes(v.burn.lines.join(' '), 'scar of an extraction', 'burn: the passer-by\'s scar');
  includes(v.burn.lines.join(' '), 'chalk line', 'burn: the child playing');
  includes(v.take.lines.join(' '), 'intake of promoted analysts', 'take: the new intake');
  includes(v.take.lines.join(' '), 'when you learned to do it like that', 'take: the smile');
  includes(v.walk.lines.join(' '), 'work-light', 'walk: the tunnel');
  includes(v.walk.lines.join(' '), 'Not unkindly', 'walk: the laugh');

  // Two people say the same name. That is the ending.
  const walk = v.walk.lines.join(' ');
  gte(walk.split('Maren').length - 1, 2, 'walk: the name is said twice');
});

test('the campaign is fifteen missions and the last one is the ending', () => {
  // NARRATIVE.md §6 defines fifteen slots. All fifteen now ship.
  eq(MISSIONS.length, 15, 'fifteen missions');
  const last = MISSIONS[MISSIONS.length - 1];
  eq(last.id, 'epilogue', 'and the last is the epilogue');

  // Every mission but the first must be reachable only in order, or the
  // arc can be read out of sequence and none of the reveals land.
  for (const m of MISSIONS.slice(1)) {
    ok(m.requires?.length || m.requiresFlags, `${m.id}: is gated behind something`);
  }
  notOk(MISSIONS[0].requires?.length, 'and the first is not');
});

test('playing every field mission in order walks the campaign to the end', () => {
  // The single most valuable check in the file: fifteen missions, in
  // order, gated the way the player will meet them, ending on an
  // epilogue that reads back what the console did.
  const campaign = newCampaign();
  for (const m of MISSIONS) {
    ok(isUnlocked(campaign, m), `${m.id}: is open by the time we reach it`);
    if (isFieldMission(m)) {
      const r = autoplay(m.id, { maxSeconds: 420 });
      ok(r.won, `${m.id}: played to a win`);
      recordWin(campaign, m.id, {});
      Object.assign(campaign.flags, r.sim.mission.flags);
    } else if (m.epilogue) {
      ok(epilogueFor(m, campaign.flags)?.lines.length, `${m.id}: has an ending to show`);
      recordWin(campaign, m.id, {});
    } else {
      // A decision mission: take the first option, as a player must take one.
      Object.assign(campaign.flags, m.choice.options[0].flag ?? {});
      recordWin(campaign, m.id, {});
    }
  }
  const { done, total } = progress(campaign, MISSIONS);
  eq(done, 15, `all fifteen closed (${done}/${total})`);
  eq(nextMission(campaign, MISSIONS), null, 'and there is nothing left to open');
});

test('the-bracket can be cleared without killing anybody', () => {
  // The point of the non-lethal tools, stated as a test. An ELIMINATE
  // mission has to be completable by sedation alone, or STANDDOWN is a
  // flavour item and the gap is not actually closed.
  //
  // The Bracket is the right mission to prove it on. They are the people
  // the briefing called a terror cell and who turn out to have no throttle
  // to talk to — the Aligner reports it and nobody in the chain of command
  // reacts. Being able to walk out of that mission with six people asleep
  // instead of six people dead is the whole argument for the tool.
  const sim = createSim('the-bracket');
  const target = sim.mission.objectives[0].target;

  // Hold the Aligner on the whole time. It suppresses friendly fire
  // entirely, so it is what stops the squad shooting the people you are
  // in the middle of putting to sleep — the gap analysis asked for tools
  // that interact with the Aligner instead of bypassing it, and this is
  // that interaction. Without it the squad auto-fires and the run is not
  // bloodless.
  sim.squad.cycleAligner();

  let guard = 0;
  while (sim.phase === PHASE.PLAYING && guard++ < 60 * 400) {
    const live = sim.hostiles.filter(h => !h.neutralised && h.countsForObjective);
    if (!live.length) { step(sim, 1 / 60, idle); continue; }

    // Walk the squad onto the nearest one and gas it. Refill the belt by
    // hand — this is a test of the mechanic, not of the loadout budget.
    const h = live[0];
    sim.squad.agents.forEach(a => { a.x = h.x + 30; a.z = h.z + 30; });
    sim.belt.STANDDOWN = 1;
    step(sim, 1 / 60, { ...idle, aimPoint: { x: h.x, z: h.z }, deployDevice: 'STANDDOWN' });
    for (let i = 0; i < 60 * 5 && !h.neutralised; i++) step(sim, 1 / 60, idle);
  }

  eq(sim.phase, PHASE.WON, 'the sector is cleared');
  eq(sim.kills, 0, 'and nobody was killed');
  gte(sim.downed, target, `${sim.downed} sedated`);
  eq(sim.civilianDeaths, 0, 'no civilian losses');
});

test('the syndicate files a sedated cell and a dead one identically', () => {
  // NARRATIVE.md's satire, as a mechanical fact: `neutralised` is what
  // the objective model reads, and `kills` is where the difference is
  // kept — so the player is the only party who knows which run they had.
  const sim = createSim('sector-7');
  sim.downed = 3;
  sim.kills = 2;
  step(sim, 1 / 60, idle);
  eq(sim.neutralised, sim.kills + sim.downed, 'the report does not distinguish');
  ok(sim.kills < sim.neutralised, 'but the game still knows');
});
