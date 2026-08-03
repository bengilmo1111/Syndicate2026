// Campaign progression: gating, records, and save migration.
//
// Gating is not cosmetic. The Act I→II turn only lands if the player walked
// Act I in order and watched the briefings get more euphemistic mission by
// mission. Shuffled, it is four disconnected firefights.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gte, gt, lt, includes } from './lib/harness.mjs';
import { createSim } from '../src/core/sim.js';
import { autoplay } from './lib/autopilot.mjs';
import {
  newCampaign, migrate, isComplete, isUnlocked, lockReason,
  recordWin, setFlag, nextMission, progress, SAVE_VERSION, recordCasualties,
} from '../src/core/campaign.js';
import { getAllMissions, getMissionDef } from '../src/core/mission.js';
import {
  SQUAD_SIZE, deployed, byId, researchFor, canFit, fit, fitBlocker, CYBERNETICS,
  CYBERNETIC_IDS,
} from '../src/core/roster.js';
import {
  SECTORS, THROTTLE, THROTTLE_ORDER, heldSectors, setThrottle, income,
  statusOf, UNREST_ON_CLAIM, RIVALS, rivalStrength, leadingRival, pressureOn,
  REVOLT_AT, claim, sectorById,
} from '../src/core/territory.js';

const MISSIONS = getAllMissions();
const def = id => getMissionDef(id);

suite('campaign');

test('a fresh campaign opens exactly one mission', () => {
  const c = newCampaign();
  const open = MISSIONS.filter(m => isUnlocked(c, m));
  eq(open.length, 1, 'only the first is available');
  eq(open[0].id, MISSIONS[0].id, 'and it is the first one');
});

test('Act I is a chain — each mission opens the next and nothing else', () => {
  const c = newCampaign();
  // Act I only — later acts chain off it and are checked separately.
  const order = ['sector-7', 'district-12', 'sable-campus', 'the-bracket'];
  for (let i = 0; i < order.length; i++) {
    const open = MISSIONS.filter(m => isUnlocked(c, m) && !isComplete(c, m.id));
    eq(open.length, 1, `step ${i}: exactly one mission is available`);
    eq(open[0].id, order[i], `step ${i}: it is ${order[i]}`);
    recordWin(c, order[i], {});
  }
  eq(progress(c, MISSIONS).done, order.length, 'Act I is complete');
  const next = nextMission(c, MISSIONS);
  if (next) eq(next.act, 'ACT II', 'and the next thing open is Act II');
});

test('every mission after the first declares a prerequisite', () => {
  // A mission with no `requires` is reachable from a cold save. That is
  // correct for Act I·1 and a mistake for anything else.
  for (const m of MISSIONS.slice(1)) {
    gte((m.requires ?? []).length, 1, `${m.id} is gated`);
  }
});

test('every prerequisite names a mission that exists', () => {
  const ids = new Set(MISSIONS.map(m => m.id));
  for (const m of MISSIONS) {
    for (const r of m.requires ?? []) {
      ok(ids.has(r), `${m.id} requires ${r}, which exists`);
    }
  }
});

test('prerequisites cannot form a cycle', () => {
  // A cycle would lock the campaign permanently and silently.
  const seen = new Map();
  const visit = (id, stack) => {
    if (stack.includes(id)) ok(false, `cycle through ${id}: ${stack.join(' -> ')}`);
    if (seen.get(id)) return;
    seen.set(id, true);
    for (const r of def(id).requires ?? []) visit(r, [...stack, id]);
  };
  for (const m of MISSIONS) visit(m.id, []);
  ok(true, 'the prerequisite graph is acyclic');
});

test('a locked mission explains itself in the player\'s language', () => {
  const c = newCampaign();
  const locked = MISSIONS.find(m => !isUnlocked(c, m));
  const why = lockReason(c, locked, def);
  ok(why, 'there is a reason');
  includes(why, 'REQUIRES', 'phrased as a requirement');
  includes(why, def(locked.requires[0]).name.split(' — ')[0], 'naming what to do first');
  eq(lockReason(c, MISSIONS[0], def), null, 'an open mission has no reason');
});

test('completing a mission is idempotent', () => {
  const c = newCampaign();
  recordWin(c, 'sector-7', {});
  recordWin(c, 'sector-7', {});
  eq(c.completed.filter(id => id === 'sector-7').length, 1, 'recorded once');
});

test('the record keeps the run with fewest civilian losses', () => {
  const c = newCampaign();
  recordWin(c, 'sector-7', { elapsed: 60, kills: 5, civilianDeaths: 3 });
  recordWin(c, 'sector-7', { elapsed: 200, kills: 5, civilianDeaths: 0 });
  eq(c.records['sector-7'].civilianDeaths, 0, 'the cleaner run is kept');
  eq(c.records['sector-7'].elapsed, 200, 'even though it was slower');

  recordWin(c, 'sector-7', { elapsed: 10, kills: 5, civilianDeaths: 9 });
  eq(c.records['sector-7'].civilianDeaths, 0, 'a faster but bloodier run does not overwrite it');
});

test('narrative flags persist on the campaign', () => {
  const c = newCampaign();
  setFlag(c, 'bravoCalibrated', true);
  eq(c.flags.bravoCalibrated, true, 'the flag is stored');
});

// ------------------------------------------------------------------- saves

suite('saves');

test('a campaign round-trips through JSON intact', () => {
  const c = newCampaign();
  recordWin(c, 'sector-7', { elapsed: 61, kills: 5, civilianDeaths: 1 });
  setFlag(c, 'bravoCalibrated', false);
  const back = migrate(JSON.parse(JSON.stringify(c)));
  eq(back.completed.join(), c.completed.join(), 'completions survive');
  eq(back.flags.bravoCalibrated, false, 'flags survive');
  eq(back.records['sector-7'].elapsed, 61, 'records survive');
});

test('a corrupt or hostile save degrades to a fresh campaign', () => {
  // A broken save should cost the player their progress, not the game.
  for (const junk of [null, undefined, 42, 'nope', [], { completed: 'not-an-array' }]) {
    const c = migrate(junk);
    ok(Array.isArray(c.completed), `${JSON.stringify(junk)} yields a usable campaign`);
    eq(c.version, SAVE_VERSION, 'stamped with the current version');
  }
});

test('migration drops junk entries rather than trusting them', () => {
  const c = migrate({ completed: ['sector-7', 7, null, 'ghost-mission'] });
  eq(c.completed.length, 2, 'non-strings are dropped');
  ok(c.completed.includes('sector-7'), 'real ids survive');
  // An id for a mission that no longer exists is harmless — it simply
  // never satisfies anything.
  notOk(MISSIONS.some(m => m.id === 'ghost-mission'), 'and a stale id gates nothing');
});

// ------------------------------------------------------------- branch gating

suite('branch gating');

test('a mission can require a decision, not just a completion', () => {
  // The Refusal is the first mission whose *outcome* changes what comes
  // after. Completion-only gating cannot express that.
  const c = newCampaign();
  const fake = { requires: [], requiresFlags: { defectedAtRefusal: true } };
  notOk(isUnlocked(c, fake), 'locked while the flag is unset');

  setFlag(c, 'defectedAtRefusal', false);
  notOk(isUnlocked(c, fake), 'and locked when the flag says otherwise');

  setFlag(c, 'defectedAtRefusal', true);
  ok(isUnlocked(c, fake), 'open once the decision matches');
});

test('a flag-locked mission says it needs a different decision', () => {
  const c = newCampaign();
  const fake = { requires: [], requiresFlags: { defectedAtRefusal: true } };
  eq(lockReason(c, fake, () => null), 'REQUIRES A DIFFERENT DECISION',
    'not "go finish something", because there is nothing to go finish');
});

test('flags recorded by a mission survive into the campaign', () => {
  // The shell copies mission.flags onto the campaign on a win; this is the
  // contract that makes branch gating work across a save.
  const c = newCampaign();
  Object.assign(c.flags, { defectedAtRefusal: true, playerSuspicion: true });
  const back = migrate(JSON.parse(JSON.stringify(c)));
  eq(back.flags.defectedAtRefusal, true, 'defection survives a save');
  eq(back.flags.playerSuspicion, true, 'so does suspicion');
});

// ------------------------------------------------------------------ roster

suite('roster');

test('a fresh campaign has the four the story is about', () => {
  const c = newCampaign();
  const crew = deployed(c.roster);
  eq(crew.length, SQUAD_SIZE, 'four of them');
  eq(crew.map(o => o.designation).join('/'), 'ALPHA/BRAVO/CHARLIE/DELTA', 'in order');
  eq(crew.map(o => o.name).join('/'), 'IDRIS/MAREN-TWO/VEY/SONA', 'and they have names');
  eq(c.roster.research, 0, 'nothing banked yet');
  ok(crew.every(o => !o.implants.length), 'and nothing fitted');
});

test('a v2 save keeps its progress and gains a roster', () => {
  // A player mid-campaign must not lose everything to a feature landing
  // behind them.
  const c = migrate({
    version: 2,
    completed: ['sector-7', 'district-12'],
    flags: { bravoCalibrated: true },
    records: { 'sector-7': { elapsed: 90, kills: 5 } },
  });
  eq(c.version, SAVE_VERSION, 'stamped current');
  eq(c.completed.length, 2, 'progress survives');
  eq(c.flags.bravoCalibrated, true, 'and so do the flags');
  eq(deployed(c.roster).length, SQUAD_SIZE, 'and there is a roster now');
});

test('a save with a corrupt roster does not take the campaign down with it', () => {
  for (const junk of [null, 'nonsense', 42, { operatives: 'no' }, { operatives: [] }]) {
    const c = migrate({ version: 3, completed: ['sector-7'], roster: junk });
    eq(deployed(c.roster).length, SQUAD_SIZE, `${JSON.stringify(junk)}: still four`);
    eq(c.completed.length, 1, 'and the progress is intact');
  }
  // An implant we retired must not survive as a dangling id.
  const c = migrate({
    version: 3,
    roster: {
      research: 5,
      operatives: [{ id: 'alpha', implants: ['LEGS', 'RETIRED_THING'], deployments: 3, slot: 0 }],
    },
  });
  eq(byId(c.roster, 'alpha').implants.join(), 'LEGS', 'the unknown implant is dropped');
  eq(c.roster.research, 5, 'research survives');
});

test('losing someone is permanent, and the suit gets a stranger in it', () => {
  const c = newCampaign();
  const bravo = byId(c.roster, 'bravo');
  const { lost, drawn } = recordCasualties(c, 'the-refusal', {
    squadAlive: 3, civilianDeaths: 2, deadSlots: [1],
  });

  eq(lost.length, 1, 'one did not come back');
  eq(lost[0].id, 'bravo', 'and it was her');
  ok(bravo.lost, 'marked lost');
  eq(bravo.lostOn, 'the-refusal', 'and where');

  eq(drawn.length, 1, 'the mesh finds somebody');
  eq(drawn[0].designation, 'BRAVO', 'who inherits the designation');
  notOk(drawn[0].name === 'MAREN-TWO', 'but not the person');
  eq(drawn[0].deployments, 0, 'and starts from nothing');

  const crew = deployed(c.roster);
  eq(crew.length, SQUAD_SIZE, 'still four deploy');
  notOk(crew.some(o => o.id === 'bravo'), 'and she is not one of them, ever again');
});

test('deployments and kills accumulate on the people who survive', () => {
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4, killsBySlot: { 0: 3, 2: 1 } });
  recordCasualties(c, 'district-12', { squadAlive: 4 });
  const alpha = byId(c.roster, 'alpha');
  eq(alpha.deployments, 2, 'two deployments');
  eq(alpha.kills, 3, 'and a record');
  eq(byId(c.roster, 'bravo').kills, 0, 'somebody else\'s kills are not hers');
});

test('research rewards bringing everyone home and killing no civilians', () => {
  eq(researchFor({ squadAlive: 4, civilianDeaths: 0 }), 4, 'clean and whole');
  eq(researchFor({ squadAlive: 4, civilianDeaths: 3 }), 3, 'whole but messy');
  eq(researchFor({ squadAlive: 2, civilianDeaths: 0 }), 3, 'clean but costly');
  eq(researchFor({ squadAlive: 2, civilianDeaths: 5 }), 2, 'neither');
  // The floor must be above zero or a bad run leaves the player stuck.
  ok(researchFor({ squadAlive: 0, civilianDeaths: 99 }) > 0, 'a bad run still pays something');
});

test('the cryovat spends research, and only research you have', () => {
  const c = newCampaign();
  // Exactly enough for the weave and not the governor, whatever those
  // cost this week — the point is the boundary, not the number.
  c.roster.research = CYBERNETICS.ARMOUR.cost;
  ok(CYBERNETICS.REFLEX.cost > CYBERNETICS.ARMOUR.cost, 'the governor is the dearest');

  notOk(canFit(c.roster, 'alpha', 'REFLEX'), 'cannot afford the governor');
  includes(fitBlocker(c.roster, 'alpha', 'REFLEX'),
    `NEEDS ${CYBERNETICS.REFLEX.cost}`, 'and it says why');

  ok(fit(c.roster, 'alpha', 'ARMOUR'), 'can afford the weave');
  eq(c.roster.research, 0, 'and it is spent');
  eq(byId(c.roster, 'alpha').implants.join(), 'ARMOUR', 'and fitted');

  notOk(fit(c.roster, 'alpha', 'ARMOUR'), 'not twice');
  notOk(fit(c.roster, 'alpha', 'LEGS'), 'and not on credit');
  eq(c.roster.research, 0, 'nothing leaked');
});

test('a lost operative cannot be fitted with anything', () => {
  const c = newCampaign();
  recordCasualties(c, 'run-south', { squadAlive: 3, deadSlots: [0] });
  c.roster.research = 99;   // set after: closing a deployment banks research
  notOk(canFit(c.roster, 'alpha', 'LEGS'), 'she is not in the vat, she is gone');
  eq(fitBlocker(c.roster, 'alpha', 'LEGS'), 'OPERATIVE LOST', 'and it says so');
  eq(c.roster.research, 99, 'and nothing was charged');
});

test('implants reach the body the sim simulates', () => {
  // The roster is a record and the Agent is a body in a city. This is the
  // only place they meet, so if it silently stops working the whole
  // progression system becomes a stats screen.
  const plain = createSim('sector-7').squad.agents[0];

  const c = newCampaign();
  c.roster.research = 99;
  fit(c.roster, 'alpha', 'LEGS');
  fit(c.roster, 'alpha', 'ARMOUR');
  fit(c.roster, 'alpha', 'OPTICS');
  const kitted = createSim('sector-7', { roster: c.roster }).squad.agents[0];

  gt(kitted.baseSpeed, plain.baseSpeed, 'the actuators are in');
  eq(kitted.speed, kitted.baseSpeed, 'and speed matches, not stale');
  gt(kitted.maxHealth, plain.maxHealth, 'the weave is in');
  eq(kitted.health, kitted.maxHealth, 'and it healed to the new maximum');
  gt(kitted.range, plain.range, 'the optics are in');

  eq(kitted.operativeId, 'alpha', 'and the agent knows who it is');
  eq(kitted.trueName, 'IDRIS', 'by name');
});

test('a sim built without a roster is still four working agents', () => {
  // Every test that does not care about progression relies on this, and
  // so does a first run before any save exists.
  const sim = createSim('sector-7');
  eq(sim.squad.agents.length, SQUAD_SIZE, 'four');
  ok(sim.squad.agents.every(a => a.health > 0 && a.range > 0), 'and functional');
  eq(sim.roster, null, 'with no roster attached');
});

test('a reflex governor is the in-fiction fix for what is wrong with BRAVO', () => {
  // Act II gives BRAVO a hesitation on every order. The governor
  // suppresses it, which is a real mechanical reward for spending four
  // research — and NARRATIVE is clear it does not fix her.
  const bare = createSim('okafor-contract');
  gt(bare.squad.agents[1].hesitation, 0, 'untreated, she hesitates');

  const c = newCampaign();
  c.roster.research = 99;
  ok(fit(c.roster, 'bravo', 'REFLEX'), 'fit the governor');
  const treated = createSim('okafor-contract', { roster: c.roster });
  eq(treated.squad.agents[1].hesitation, 0, 'and the pause is gone');
  eq(treated.squad.agents[1].trueName, 'MAREN-TWO', 'she is still herself');
});

test('losing BRAVO changes what happens at the checkpoint under the campus', () => {
  // The payoff for permanent losses being permanent: Act IV·14's first
  // beat is her talking about a kitchen she cannot verify is hers. If she
  // is gone, somebody else is in the suit and the scene is the absence.
  const fired = (roster) => {
    const sim = createSim('the-core', roster ? { roster } : {});
    return sim.interludeDefs.filter(b => b.when({ ...sim, kills: 99 })).map(b => b.id);
  };

  ok(fired(null).includes('bravo'), 'no roster at all: she is there');
  ok(fired(newCampaign().roster).includes('bravo'), 'roster intact: she is there');

  const bereaved = newCampaign();
  recordCasualties(bereaved, 'the-refusal', { squadAlive: 3, deadSlots: [1] });
  const beats = fired(bereaved.roster);
  ok(beats.includes('bravo-gone'), 'she is gone: the other beat runs');
  notOk(beats.includes('bravo'), 'and hers does not');

  // Both versions must be written, or "she is gone" is a blank screen.
  const def = getMissionDef('the-core');
  for (const id of ['bravo', 'bravo-gone']) {
    gte(def.interludes.find(i => i.id === id).lines.join(' ').length, 300, `${id}: is written`);
  }
});

test('the campaign still finishes with a squad that has been rebuilt twice', () => {
  // A player who loses people must not hit an unwinnable wall. Wipe out
  // half the founding four and the missions must still be playable.
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 2, deadSlots: [0, 3] });
  recordCasualties(c, 'district-12', { squadAlive: 3, deadSlots: [2] });

  const crew = deployed(c.roster);
  eq(crew.length, SQUAD_SIZE, 'four still deploy');
  eq(crew.map(o => o.designation).sort().join('/'), 'ALPHA/BRAVO/CHARLIE/DELTA',
    'all four designations are filled');
  eq(crew.filter(o => o.id === 'bravo').length, 1, 'and the survivor is still herself');

  const r = autoplay('sector-7', { roster: c.roster });
  ok(r.won, 'and a rebuilt squad can still win');
});

// --------------------------------------------------------------- territory

suite('territory');

test('a fresh campaign holds nothing, and every sector is a real place', () => {
  const c = newCampaign();
  eq(heldSectors(c.territory).length, 0, 'you start with nothing');
  gte(SECTORS.length, 8, 'and there is a map to take');
  for (const s of SECTORS) {
    ok(s.name && s.detail, `${s.id}: is a named place`);
    gte(s.yield, 1, `${s.id}: is worth something`);
    ok(getMissionDef(s.from), `${s.id}: is taken by a real mission`);
  }
});

test('winning a mission takes its sector, once', () => {
  const c = newCampaign();
  const first = recordCasualties(c, 'sector-7', { squadAlive: 4 });
  eq(first.claimed?.id, 'sector-7', 'the sector is yours');
  ok(c.territory['sector-7'].held, 'and held');
  eq(c.territory['sector-7'].unrest, UNREST_ON_CLAIM, 'nobody is pleased about it');

  const again = recordCasualties(c, 'sector-7', { squadAlive: 4 });
  eq(again.claimed, null, 'replaying it does not re-take it');
  ok(c.territory['sector-7'].unrest > UNREST_ON_CLAIM, 'or reset how it feels');
});

test('the throttle is SURGE at the scale of a sector', () => {
  // Take more, pay for it socially. Same sentence as SURGE, different
  // font size — that is the whole reason this layer exists.
  const order = THROTTLE_ORDER.map(id => THROTTLE[id]);
  for (let i = 1; i < order.length; i++) {
    ok(order[i].yield > order[i - 1].yield,
      `${order[i].id} pays more than ${order[i - 1].id}`);
    ok(order[i].unrest > order[i - 1].unrest,
      `${order[i].id} costs more than ${order[i - 1].id}`);
  }
  ok(order[0].unrest < 0, 'the loosest ration actually calms a sector down');
  ok(order[order.length - 1].unrest > 0, 'and the tightest cannot hold');
});

test('a sector held at the hardest ration hands itself back', () => {
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  setThrottle(c.territory, 'sector-7', 'FREE');

  let cycles = 0;
  let revolt = null;
  while (cycles++ < 40 && !revolt) {
    const r = recordCasualties(c, 'nothing-in-particular', {});
    if (r.revolted.length) revolt = { at: cycles, sectors: r.revolted };
  }
  ok(revolt, `it revolts (after ${revolt?.at} deployments)`);
  eq(revolt.sectors[0].id, 'sector-7', 'the one you squeezed');
  notOk(c.territory['sector-7'].held, 'and it is off the map');
  eq(c.territory['sector-7'].lostTo, 'revolt', 'for a reason it can state');

  // Inside a single playthrough, on purpose. A punishment that arrives
  // after the credits is not a punishment.
  lt(revolt.at, 15, `${revolt.at} deployments is inside one campaign`);
});

test('the loosest ration pulls a sector back from the brink', () => {
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  // Just into STRAINING. Easing off here has to actually work, or the
  // throttle control loses half its meaning.
  c.territory['sector-7'].unrest = 72;
  setThrottle(c.territory, 'sector-7', 'FRONTIER');
  for (let i = 0; i < 10; i++) recordCasualties(c, 'nothing', {});
  ok(c.territory['sector-7'].held, 'still yours');
  lt(c.territory['sector-7'].unrest, 60, 'and calming down');
  notOk(statusOf(c.territory['sector-7']) === 'STRAINING', 'off the brink');

  // All the way back, given long enough. A sector you cannot ever calm
  // is a sector you may as well squeeze.
  for (let i = 0; i < 20; i++) recordCasualties(c, 'nothing', {});
  eq(statusOf(c.territory['sector-7']), 'QUIET', 'and eventually quiet');
});

test('the map pays into the same research the cryovat spends', () => {
  // The loop has to close, or the strategic layer is a spreadsheet
  // beside the game rather than part of it.
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4, civilianDeaths: 0 });
  const afterOne = c.roster.research;
  recordCasualties(c, 'district-12', { squadAlive: 4, civilianDeaths: 0 });
  const afterTwo = c.roster.research - afterOne;

  ok(afterTwo > afterOne - 1, 'holding two sectors pays better than holding one');
  ok(income(c.territory) > 0, 'the map has an income');
  ok(fit(c.roster, 'alpha', 'LEGS') || c.roster.research < CYBERNETICS.LEGS.cost,
    'and it is the currency the cryovat wants');
});

test('squeezing everything is not the winning move', () => {
  // The failure state for a tax mechanic is that maximum tax is always
  // correct. Playing the whole campaign at each ration must not make the
  // hardest one obviously best.
  const run = (mode) => {
    const c = newCampaign();
    let lost = 0;
    for (const m of getAllMissions()) {
      lost += recordCasualties(c, m.id, { squadAlive: 4, civilianDeaths: 0 }).revolted.length;
      for (const s of heldSectors(c.territory)) setThrottle(c.territory, s.id, mode);
    }
    return { research: c.roster.research, held: heldSectors(c.territory).length, lost };
  };
  const plus = run('PLUS');
  const free = run('FREE');

  ok(free.research > plus.research, 'squeezing does pay more');
  lt(free.held, plus.held, `but you lose the map (${free.held} vs ${plus.held} sectors)`);
  ok(free.research < plus.research * 1.5,
    `and not by enough to be obvious (${plus.research} vs ${free.research})`);
});

test('a campaign does not pay for a full kit, at any ration', () => {
  // If it did, the cryovat would stop being a question about who matters
  // and become a checklist you finish.
  const fullKit = CYBERNETIC_IDS.reduce((n, id) => n + CYBERNETICS[id].cost, 0) * SQUAD_SIZE;
  for (const mode of THROTTLE_ORDER) {
    const c = newCampaign();
    for (const m of getAllMissions()) {
      recordCasualties(c, m.id, { squadAlive: 4, civilianDeaths: 0 });
      for (const s of heldSectors(c.territory)) setThrottle(c.territory, s.id, mode);
    }
    lt(c.roster.research, fullKit,
      `${mode}: ${c.roster.research} banked against ${fullKit} to kit everyone`);
  }
});

test('a v3 save keeps everything and gains an empty map', () => {
  const c = migrate({
    version: 3,
    completed: ['sector-7', 'district-12'],
    flags: { ending: 'walk' },
    roster: { research: 7, operatives: [{ id: 'alpha', slot: 0, implants: ['LEGS'] }] },
  });
  eq(c.version, SAVE_VERSION, 'stamped current');
  eq(c.completed.length, 2, 'progress survives');
  eq(c.roster.research, 7, 'and so does the research');
  eq(heldSectors(c.territory).length, 0, 'the map starts empty rather than handing you ten sectors');
});

test('a corrupt map does not take the campaign down with it', () => {
  const junkInputs = [
    null, 'nonsense', 42,
    { 'sector-7': 'yes' },
    { 'sector-7': { throttle: 'GONE' } },
    // A syndicate from a version that never shipped. Left as-is it would
    // hold a block of Austin that no rival can ever be seen to own, and
    // `leadingRival` would never count it.
    { 'sector-7': { owner: 'omnicorp' }, 'district-12': { owner: null } },
  ];
  for (const junk of junkInputs) {
    const c = migrate({ version: 4, completed: ['sector-7'], territory: junk });
    eq(Object.keys(c.territory).length, SECTORS.length, `${JSON.stringify(junk)}: a whole map`);
    eq(c.completed.length, 1, 'and the progress is intact');
    for (const s of SECTORS) {
      const t = c.territory[s.id];
      ok(THROTTLE[t.throttle], `${s.id}: has a throttle that exists`);
      ok(t.held || RIVALS[t.owner], `${s.id}: is held by you or by a syndicate that exists`);
    }
    // Every unheld block belongs to somebody, so the strength maths adds up.
    const unheld = SECTORS.filter(s => !c.territory[s.id].held).length;
    eq(Object.values(rivalStrength(c.territory)).reduce((a, b) => a + b, 0), unheld,
      'and the rival strengths account for the whole map');
  }
});

test('a real map round-trips through a save', () => {
  // The corrupt-input tests all pass if migration simply throws the map
  // away and hands back a fresh one, which would silently reset every
  // returning player's campaign.
  const before = newCampaign();
  recordCasualties(before, 'sector-7', { squadAlive: 4 });
  recordCasualties(before, 'relay-4-not-a-mission', {});
  setThrottle(before.territory, 'sector-7', 'FREE');
  before.territory['sector-7'].unrest = 64;

  const after = migrate(JSON.parse(JSON.stringify(before)));
  const t = after.territory['sector-7'];
  ok(t.held, 'still held');
  eq(t.throttle, 'FREE', 'at the ration you set');
  eq(t.unrest, 64, 'and as angry as you left it');
  eq(income(after.territory), income(before.territory), 'so it pays the same');
});

// ------------------------------------------------------------ rival syndicates

suite('rivals');

test('you start with none of the map and everyone else has all of it', () => {
  // The premise: five syndicates hold the world's compute. A strategic
  // layer where the map is empty until you fill it is a different game.
  const c = newCampaign();
  eq(heldSectors(c.territory).length, 0, 'you hold nothing');
  for (const s of SECTORS) {
    ok(RIVALS[c.territory[s.id].owner], `${s.id}: belongs to somebody`);
    ok(RIVALS[s.rival], `${s.id}: and it is one of the four`);
  }
  const strength = rivalStrength(c.territory);
  eq(Object.values(strength).reduce((a, b) => a + b, 0), SECTORS.length,
    'and between them they have Austin');
});

test('taking a sector takes it off whoever had it', () => {
  const c = newCampaign();
  const before = c.territory['sector-7'].owner;
  ok(RIVALS[before], `${before} had it`);
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  eq(c.territory['sector-7'].owner, null, 'now nobody but you');
  eq(rivalStrength(c.territory)[before], rivalStrength(newCampaign().territory)[before] - 1,
    'and they are one down');
});

test('rivals push through the opening your own ration made', () => {
  // The whole design. A rival does not conjure an opening — it walks into
  // one you left. Unrest and rival pressure are not two risks with
  // different names; they are the same risk arriving by two doors.
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });

  c.territory['sector-7'].unrest = 0;
  eq(pressureOn(c.territory, 'sector-7'), 0, 'a content sector is not pushable at all');

  c.territory['sector-7'].unrest = REVOLT_AT / 2;
  const half = pressureOn(c.territory, 'sector-7');
  c.territory['sector-7'].unrest = REVOLT_AT;
  const full = pressureOn(c.territory, 'sector-7');
  ok(full > half && half > 0, `pressure scales with unhappiness (${half.toFixed(1)} → ${full.toFixed(1)})`);
});

test('a quiet sector shrugs pressure off faster than anyone can apply it', () => {
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  setThrottle(c.territory, 'sector-7', 'FRONTIER');
  c.territory['sector-7'].contest = 60;

  for (let i = 0; i < 20; i++) recordCasualties(c, 'nothing', {});
  ok(c.territory['sector-7'].held, 'still yours');
  eq(c.territory['sector-7'].contest, 0, 'and nobody is pushing any more');
  eq(c.territory['sector-7'].contestedBy, null, 'nor claiming to be');
});

test('a sector left unhappy long enough gets taken by somebody with a logo', () => {
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  setThrottle(c.territory, 'sector-7', 'PLUS');

  let taken = null;
  for (let i = 0; i < 40 && !taken; i++) {
    const r = recordCasualties(c, 'nothing', {});
    if (r.seized.length) taken = r.seized[0];
  }
  ok(taken, 'a rival takes it');
  eq(taken.sector.id, 'sector-7', 'the one you left unhappy');
  ok(RIVALS[c.territory['sector-7'].owner], 'and they hold it now');
  eq(c.territory['sector-7'].lostTo, c.territory['sector-7'].owner, 'the record says who');
  notOk(c.territory['sector-7'].held, 'it is not yours');
});

test('redeploying takes a seized sector back', () => {
  // Losing a sector has to be recoverable, or the map is a ratchet and
  // the only winning move is to under-ration everything forever.
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  c.territory['sector-7'].held = false;
  c.territory['sector-7'].owner = 'amazon';
  c.territory['sector-7'].contest = 0;

  const r = recordCasualties(c, 'sector-7', { squadAlive: 4 });
  eq(r.claimed?.id, 'sector-7', 'the deployment takes it back');
  ok(c.territory['sector-7'].held, 'held again');
  eq(c.territory['sector-7'].owner, null, 'and off them');
});

test('a revolted sector goes to nobody, then gets picked back up', () => {
  // A sector that has just thrown you out is in no mood to be
  // administered by Amazon either — but it does not stay nobody's, or the
  // rivals quietly evaporate over a long campaign.
  const c = newCampaign();
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  c.territory['sector-7'].unrest = REVOLT_AT;
  const r = recordCasualties(c, 'nothing', {});
  eq(r.revolted[0]?.id, 'sector-7', 'it revolts');
  eq(c.territory['sector-7'].owner, null, 'and nobody has it');

  const next = recordCasualties(c, 'nothing', {});
  eq(c.territory['sector-7'].owner, sectorById('sector-7').rival, 'its own syndicate walks back in');
  ok(next.moved.some(m => m.sector.id === 'sector-7'), 'and the debrief can say so');
});

test('the rivals never evaporate, even when you hold the whole map', () => {
  // Without off-map reach they would, and the strategic layer would
  // quietly revert to the player against a mood meter for exactly the run
  // most people will have.
  const c = newCampaign();
  for (const s of SECTORS) claim(c.territory, s.from);
  eq(heldSectors(c.territory).length, SECTORS.length, 'you hold Austin');
  eq(Object.values(rivalStrength(c.territory)).reduce((a, b) => a + b, 0), 0,
    'and they hold none of it');

  ok(leadingRival(c.territory), 'somebody is still the biggest of the four');
  c.territory['sector-7'].unrest = 90;
  ok(pressureOn(c.territory, 'sector-7') > 0,
    'and holding everything does not make you safe — it makes you a target');
});

test('the two ways to lose a sector arrive by different rations', () => {
  // The design in one test. Squeeze hardest and the people throw you out
  // before any rival gets the chance; ration at the Board rate forever
  // and a competitor walks into what you left unhappy.
  const play = (mode) => {
    const c = newCampaign();
    let revolts = 0;
    let seized = 0;
    for (const m of getAllMissions()) {
      const r = recordCasualties(c, m.id, { squadAlive: 4, civilianDeaths: 0 });
      revolts += r.revolted.length;
      seized += r.seized.length;
      for (const s of heldSectors(c.territory)) setThrottle(c.territory, s.id, mode);
    }
    return { revolts, seized, held: heldSectors(c.territory).length };
  };
  const pro = play('PRO');
  const plus = play('PLUS');
  const free = play('FREE');

  eq(pro.revolts + pro.seized, 0, 'rationing lightly loses you nothing');
  ok(plus.seized > 0, `the Board rate loses sectors to rivals (${plus.seized})`);
  ok(free.revolts > plus.revolts, `the hardest ration loses them to revolt (${free.revolts})`);
  lt(free.held, pro.held, 'and either way squeezing costs you the map');
});
