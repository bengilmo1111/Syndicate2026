// Campaign progression: gating, records, and save migration.
//
// Gating is not cosmetic. The Act I→II turn only lands if the player walked
// Act I in order and watched the briefings get more euphemistic mission by
// mission. Shuffled, it is four disconnected firefights.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gte, includes } from './lib/harness.mjs';
import {
  newCampaign, migrate, isComplete, isUnlocked, lockReason,
  recordWin, setFlag, nextMission, progress, SAVE_VERSION,
} from '../src/core/campaign.js';
import { getAllMissions, getMissionDef } from '../src/core/mission.js';

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
  const order = ['sector-7', 'district-12', 'sable-campus', 'the-bracket'];
  for (let i = 0; i < order.length; i++) {
    const open = MISSIONS.filter(m => isUnlocked(c, m) && !isComplete(c, m.id));
    eq(open.length, 1, `step ${i}: exactly one mission is available`);
    eq(open[0].id, order[i], `step ${i}: it is ${order[i]}`);
    recordWin(c, order[i], {});
  }
  eq(progress(c, MISSIONS).done, order.length, 'the act is complete');
  eq(nextMission(c, MISSIONS), null, 'and nothing is left');
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
