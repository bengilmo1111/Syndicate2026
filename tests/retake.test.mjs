// Deployments the map writes.
//
// The strategic layer had been feeding the campaign for two chunks with no
// way for the campaign to answer it: a sector taken off you by Google could
// only be won back by replaying the mission that took it the first time.
// These tests are mostly about the *difference* between a retake and a
// replay — different people, different paint, different record — because if
// that difference is not real the whole thing is a relabelled button.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, gt, gte, lt, includes } from './lib/harness.mjs';
import { autoplay } from './lib/autopilot.mjs';
import { createSim, step } from '../src/core/sim.js';
import {
  newCampaign, migrate, recordWin, recordCasualties, progress,
} from '../src/core/campaign.js';
import { getAllMissions, getMissionDef, isFieldMission } from '../src/core/mission.js';
import { ALIGNER } from '../src/core/squad.js';
import {
  SECTORS, sectorById, sectorFor, retakeId, isRetakeId, sectorOfRetake,
  RIVALS, UNREST_ON_CLAIM,
} from '../src/core/territory.js';
import {
  retakeFor, retakeTargets, canRetake, holderOf, REVOLT_CROWD, REINFORCEMENT_CAP,
} from '../src/core/retake.js';

const MISSIONS = getAllMissions();

/**
 * A campaign that has taken `sectorId` and then lost it to `owner`.
 * `owner: null` is the revolt case — the people threw you out and nobody
 * else has walked in yet.
 */
function lostSector(sectorId, owner) {
  const c = newCampaign();
  const sector = sectorById(sectorId);
  c.completed.push(sector.from);
  const t = c.territory[sectorId];
  t.held = false;
  t.owner = owner;
  t.lostTo = owner ?? 'revolt';
  t.unrest = 0;
  t.contest = 0;
  return c;
}

suite('retake');

test('the map only writes deployments for blocks you took and lost', () => {
  const c = newCampaign();
  eq(retakeTargets(c.territory, c.completed).length, 0,
    'a fresh campaign has nothing to take back');

  // Taken, held: nothing to retake.
  recordWin(c, 'sector-7', {});
  recordCasualties(c, 'sector-7', { squadAlive: 4 });
  ok(c.territory['sector-7'].held, 'sector 7 is yours');
  notOk(canRetake(c.territory, 'sector-7', c.completed), 'and you cannot retake what you hold');

  // A block you have never taken is not offered either. That one still has
  // an authored mission with a briefing that means something, and replacing
  // it with a generated one would be a downgrade.
  notOk(canRetake(c.territory, 'relay-4', c.completed),
    'a sector you never took is not a retake, it is a mission');
  eq(retakeFor(c.territory, 'sector-7'), null, 'and a held sector generates nothing');

  c.territory['sector-7'].held = false;
  c.territory['sector-7'].owner = 'google';
  ok(canRetake(c.territory, 'sector-7', c.completed), 'lose it and the map offers it back');
});

test('lostTo is transient, so it is not what decides a retake', () => {
  // A revolted sector is picked up by its native syndicate on the next
  // deployment, which clears `lostTo`. Gating retakes on that flag would
  // make a lost sector unrecoverable one deployment after losing it.
  const c = lostSector('sector-7', null);
  c.territory['sector-7'].lostTo = null;
  c.territory['sector-7'].owner = 'amazon';
  ok(canRetake(c.territory, 'sector-7', c.completed),
    'still offered after the flag has been cleared');
});

test('a revolted sector survives a reload still belonging to nobody', () => {
  // Found in a screenshot, not by an assertion: NODE 7 had revolted and the
  // card said AMAZON held it. The save is written on every debrief, so the
  // "nobody holds it" beat lasted exactly as long as the player stayed on
  // the page — and the deployment generated for it was against a garrison
  // that was not there.
  const c = lostSector('node-7', null);
  const reloaded = migrate(JSON.parse(JSON.stringify(c)));
  eq(reloaded.territory['node-7'].owner, null, 'still nobody\'s');
  eq(reloaded.territory['node-7'].lostTo, 'revolt', 'and still because of what happened');
  eq(holderOf(reloaded.territory, 'node-7'), null, 'so the map still knows to say so');
  const def = retakeFor(reloaded.territory, 'node-7');
  eq(def.retake.holder, null, 'and the deployment is a return, not a retake');
  includes(def.name, 'RETURN', 'named as one');

  // The defensive fallback it must not have broken: a foreign syndicate id
  // on an unheld sector still resolves to that sector's own rival.
  const foreign = lostSector('node-7', null);
  foreign.territory['node-7'].owner = 'weyland';
  foreign.territory['node-7'].lostTo = 'weyland';
  eq(migrate(JSON.parse(JSON.stringify(foreign))).territory['node-7'].owner, 'spacex',
    'a syndicate we never heard of still falls back');
});

test('a retake is a different deployment, not a replay of the same one', () => {
  const c = lostSector('sector-7', 'google');
  const def = retakeFor(c.territory, 'sector-7');

  ok(def, 'the map wrote one');
  eq(def.id, retakeId('sector-7'), 'under its own id');
  ok(isRetakeId(def.id), 'which reads as a retake');
  eq(sectorOfRetake(def.id).id, 'sector-7', 'and resolves back to the sector');
  eq(sectorFor(def.id).id, 'sector-7', 'so claiming works without knowing it exists');

  // Read live, not from the snapshot taken at import — the point is that
  // generating one never grows the authored list, and a snapshot could not
  // tell the difference.
  notOk(getAllMissions().some(m => m.id === def.id), 'it is not in the authored fifteen');
  eq(getAllMissions().length, MISSIONS.length, 'which has not grown');
  eq(getMissionDef(def.id).id, def.id, 'but createSim can find it');
  ok(isFieldMission(def), 'and it is a field mission like any other');

  const source = getMissionDef('sector-7');
  ok(def.briefing.join(' ') !== source.briefing.join(' '), 'the copy is not the original memo');
  includes(def.briefing.join(' '), 'GOOGLE', 'and it names who is holding the block');
});

test('the block is the one the player already fought down', () => {
  const c = lostSector('sector-7', 'google');
  retakeFor(c.territory, 'sector-7');

  const original = createSim('sector-7');
  const retake = createSim(retakeId('sector-7'));

  eq(retake.city.seed, original.city.seed, 'same seed');
  eq(retake.city.structures.length, original.city.structures.length, 'same number of buildings');
  eq(retake.city.deploy.x, original.city.deploy.x, 'same deployment point');
  const drift = original.city.structures.reduce(
    (max, s, i) => Math.max(max, Math.hypot(s.x - retake.city.structures[i].x, s.z - retake.city.structures[i].z)),
    0,
  );
  eq(drift, 0, 'and every building is standing exactly where it was');
});

test('but it is painted by whoever holds it now', () => {
  const c = lostSector('sector-7', 'google');
  retakeFor(c.territory, 'sector-7');

  const original = createSim('sector-7');
  const retake = createSim(retakeId('sector-7'));

  eq(original.city.syndicate, 'amazon', 'Sector 7 was an Amazon block');
  eq(retake.city.syndicate, 'google', 'and it is a Google block now');
  ok(retake.city.palette.trim !== original.city.palette.trim, 'different accent');

  const repainted = retake.city.structures.filter(
    (s, i) => s.color !== original.city.structures[i].color,
  ).length;
  gt(repainted, 0, 'and the buildings actually changed colour');
});

test('reskinning leaves a landmark its own accent', () => {
  // A landmark can carry a `syndicateTrim` of its own — the relay pylon is
  // Amazon orange because it is an Amazon pylon, not because the block is.
  // Remapping by palette lookup must not swallow it.
  const c = lostSector('sector-7', 'spacex');
  retakeFor(c.territory, 'sector-7');
  const retake = createSim(retakeId('sector-7'));
  const pylon = retake.city.landmarks.find(l => l.name === 'AMAZON RELAY PYLON');
  ok(pylon, 'the pylon is still there');
  eq(pylon.trim, 0xffab4a, 'and it is still Amazon orange');
});

test('the four syndicates garrison a block four different ways', () => {
  const seen = new Map();
  for (const id of ['amazon', 'google', 'spacex', 'anthropic']) {
    const c = lostSector('sector-7', id);
    retakeFor(c.territory, 'sector-7');
    const sim = createSim(retakeId('sector-7'));
    const g = sim.hostiles[0];
    seen.set(id, {
      count: sim.hostiles.length,
      health: g.maxHealth,
      damage: g.damage,
      cover: g.seeksCover,
      label: g.label,
    });
    includes(g.label, RIVALS[id].name, `${id}: the garrison says who it is`);
    eq(g.syndicate, id, `${id}: and reads as theirs`);
  }

  const a = seen.get('amazon');
  const g = seen.get('google');
  const s = seen.get('spacex');
  const n = seen.get('anthropic');

  gt(a.count, g.count, 'Amazon posts more people than Google');
  gt(g.health, a.health, 'Google posts tougher ones');
  gt(s.damage, g.damage, 'SpaceX hits hardest');
  notOk(s.cover, 'and does not take cover, because it does not think it needs to');
  ok(g.cover, 'Google very much does');
  lt(n.count, a.count, 'Anthropic barely garrisons at all');
});

test('an Anthropic block is off the update channel, and the Aligner says so', () => {
  const c = lostSector('sable', 'anthropic');
  retakeFor(c.territory, 'sable');
  const sim = createSim(retakeId('sable'));

  ok(sim.unthrottled, 'they talked to the sector rather than taking it');
  const street = sim.civilians.filter(c2 => !c2.isAsset);
  ok(street.length && street.every(c2 => c2.unthrottled), 'everyone in it is off the cap');

  // The one defence in the game the Aligner cannot answer. Their doctrine
  // on the strategic map is people rather than ground; this is the same
  // sentence said in the field.
  sim.squad.cycleAligner();
  eq(sim.squad.alignerMode, ALIGNER.BIND, 'the Aligner engages');
  // Walk the squad into the middle of the block with it running.
  sim.squad.selectAll();
  sim.squad.issueMove({ x: sim.holdZone.x, z: sim.holdZone.z }, sim.city);
  for (let i = 0; i < 60 * 30; i++) {
    step(sim, 1 / 60, { moveX: 0, moveZ: 0, firing: false, aimPoint: null });
  }
  eq(sim.alignedCount, 0, 'and there is nobody on the channel to bind');
});

test('a leading syndicate reinforces, but only so far', () => {
  const base = lostSector('sector-7', 'amazon');
  retakeFor(base.territory, 'sector-7');
  const thin = createSim(retakeId('sector-7')).hostiles.length;

  // Amazon holding most of Austin.
  const wide = lostSector('sector-7', 'amazon');
  for (const s of SECTORS) {
    if (s.id === 'sector-7') continue;
    wide.territory[s.id].held = false;
    wide.territory[s.id].owner = 'amazon';
  }
  retakeFor(wide.territory, 'sector-7');
  const thick = createSim(retakeId('sector-7')).hostiles.length;

  gt(thick, thin, 'a syndicate winning the wider argument posts more people');
  lte(thick - thin, REINFORCEMENT_CAP,
    'but the player who most needs a retake is the one already losing');
});

test('a sector that threw you out is defended by the people who live there', () => {
  const c = lostSector('district-12', null);
  eq(holderOf(c.territory, 'district-12'), null, 'nobody holds it');
  retakeFor(c.territory, 'district-12');
  const sim = createSim(retakeId('district-12'));

  eq(sim.hostiles.length, REVOLT_CROWD, 'a crowd, not a garrison');
  ok(sim.hostiles.every(h => h.faction === 'unquantized'), 'and they are not anybody\'s operatives');
  ok(sim.hostiles.every(h => h.label === 'RESIDENT'), 'they live here');
  notOk(sim.hostiles.some(h => h.alignable), 'the Aligner has nothing to talk to');

  // The Bracket's cell is pleading to be left alone. These people are not.
  // Handing them that script would have them begging for their lives while
  // walking toward the squad.
  const lines = sim.hostiles[0].lines.join(' ');
  notOk(lines.includes('we never touched your racks'), 'and they do not have the Bracket\'s script');
  includes(lines, 'this is our block', 'they have their own');

  // No ELIMINATE objective at all: nothing here has to die.
  const labels = sim.mission.objectives.map(o => o.label).join(' ');
  notOk(labels.includes('CLEAR'), 'nothing is asked to be cleared');
  includes(labels, 'HOLD THE BLOCK', 'you are asked to stand in it');
});

test('a retake is decided by standing in the block, not only by shooting', () => {
  const c = lostSector('sector-7', 'google');
  retakeFor(c.territory, 'sector-7');
  const sim = createSim(retakeId('sector-7'));

  ok(sim.holdZone, 'there is ground to hold');
  gte(sim.holdZone.radius, 8, 'and enough of it to fight in');
  const hold = sim.mission.objectives.find(o => o.id === 'stand');
  eq(hold.after, 'garrison', 'after the garrison is down');
  gt(hold.target, 10, 'and for long enough to be a decision');
});

test('taking it back puts it on the ledger and pays like any other sector', () => {
  const c = lostSector('sector-7', 'google');
  const before = c.roster.research;

  const closed = recordCasualties(c, retakeId('sector-7'), { squadAlive: 4 });
  eq(closed.claimed?.id, 'sector-7', 'the sector is yours again');
  ok(c.territory['sector-7'].held, 'and held');
  eq(c.territory['sector-7'].owner, null, 'Google is off it');
  eq(c.territory['sector-7'].contest, 0, 'and whatever push there was is spent');
  eq(c.territory['sector-7'].unrest, UNREST_ON_CLAIM, 'nobody is pleased about it, same as the first time');
  gt(c.roster.research, before, 'and the deployment paid');
});

test('a retake is not campaign progress', () => {
  const c = lostSector('sector-7', 'google');
  const donebefore = c.completed.length;

  recordWin(c, retakeId('sector-7'), { elapsed: 40 });
  eq(c.completed.length, donebefore, 'the arc is fifteen missions and stays fifteen');
  notOk(c.completed.includes(retakeId('sector-7')), 'a generated mission is not on the record');

  const { done, total } = progress(c, MISSIONS);
  lte(done, total, 'and the deployment counter never passes its own total');
});

test('the deployment is written against whoever holds the block now', () => {
  // A sector that changed hands twice while the player was elsewhere is a
  // different fight. A cached def would send them after the wrong syndicate.
  const c = lostSector('sector-7', 'amazon');
  const first = retakeFor(c.territory, 'sector-7');
  eq(first.retake.holder, 'amazon', 'Amazon had it');

  c.territory['sector-7'].owner = 'spacex';
  const second = retakeFor(c.territory, 'sector-7');
  eq(second.retake.holder, 'spacex', 'SpaceX has it now');
  eq(second.id, first.id, 'same slot');
  ok(second.briefing.join(' ') !== first.briefing.join(' '), 'different briefing');
  eq(getMissionDef(second.id).retake.holder, 'spacex', 'and the registry has the current one');
});

// ------------------------------------------------------------- playable?

for (const owner of ['amazon', 'google', 'spacex', 'anthropic']) {
  test(`a block held by ${owner} can be taken back`, () => {
    const c = lostSector('sector-7', owner);
    retakeFor(c.territory, 'sector-7');
    const r = autoplay(retakeId('sector-7'), { maxSeconds: 420 });
    ok(r.won, `${owner}: winnable — ${r.failReason ?? (r.timedOut ? 'timed out' : '')} `
      + r.objectives.map(o => `${o.label} ${Math.floor(o.progress)}/${o.target}`).join(' · '));
  });
}

test('a sector that threw you out can be walked back into', () => {
  const c = lostSector('district-12', null);
  retakeFor(c.territory, 'district-12');
  const r = autoplay(retakeId('district-12'), { maxSeconds: 420 });
  ok(r.won, 'winnable — ' + r.objectives.map(o => `${o.label} ${Math.floor(o.progress)}/${o.target}`).join(' · '));
});

test('every sector on the map can have a deployment written for it', () => {
  // Ten sectors, ten authored missions behind them, and the generator has
  // to cope with all of them — including the ones whose setup builds
  // assets, extraction zones and interludes it is going to throw away.
  for (const s of SECTORS) {
    const c = lostSector(s.id, 'amazon');
    const def = retakeFor(c.territory, s.id);
    ok(def, `${s.id}: has a deployment`);
    const sim = createSim(def.id);
    gt(sim.hostiles.length, 0, `${s.id}: with somebody in it`);
    ok(sim.holdZone, `${s.id}: and ground to hold`);
    notOk(sim.assets.length, `${s.id}: and none of the original's cast`);
    eq(sim.city.syndicate, 'amazon', `${s.id}: painted by its holder`);
  }
});

function lte(a, b, msg = 'expected <=') {
  ok(a <= b, `${msg} — ${a} vs ${b}`);
}
