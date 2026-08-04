// The offensive strange tools.
//
// `GAP_ANALYSIS.md` §4 is precise about why these exist: the original's
// identity lives in psycho gas and razor wire and satellite rain, not in a
// fourth gun with better numbers, because those create *tactics* and a
// bigger gun creates a bigger number. So the tests here are mostly about
// the tactic being real — who gets dragged, who shoots whom, what a
// warning is worth — and about the rule every device is built to: all of
// them apply to the squad.

import '../src/missions/index.js';
import { suite, test, ok, notOk, eq, near, lt, gt, gte } from './lib/harness.mjs';
import { createSim, step } from '../src/core/sim.js';
import {
  DEVICE, DEVICE_IDS, devicesFor, newDeviceBelt, actIndex, Device, tickDevices,
  PSYCHO_FOR, GRAVITON_CORE, RAZOR_SPEED, RAIN_SPLASH,
} from '../src/core/devices.js';
import { retakeFor } from '../src/core/retake.js';
import { newCampaign } from '../src/core/campaign.js';
import { retakeId, sectorById } from '../src/core/territory.js';
import { dist } from '../src/core/math.js';

const idle = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };

/**
 * A sim with `keep` hostiles, nobody walking, and the squad's guns down.
 *
 * The accounting tests below are about one body and the counters attached
 * to it. A live firefight in the background adds kills from three other
 * sources and the numbers stop meaning anything.
 */
function quiet(missionId, keep = 1) {
  const sim = createSim(missionId);
  sim.hostiles.length = keep;
  for (const h of sim.hostiles) h.aggroRange = 0;
  for (const c of sim.civilians) { c.x = -sim.city.halfW; c.z = -sim.city.halfD; }
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }
  sim.squad.cycleStance();
  sim.squad.cycleStance();          // ENGAGE → RETURN FIRE → HOLD FIRE
  return sim;
}

/** Throw `id` at a point and let it arm. Returns the device. */
function place(sim, id, at, seconds = 2) {
  step(sim, 1 / 60, { ...idle, aimPoint: at, deployDevice: id });
  const d = sim.devices[sim.devices.length - 1];
  for (let i = 0; i < 60 * seconds; i++) step(sim, 1 / 60, idle);
  return d;
}

suite('the belt grows');

test('a tool arrives when the campaign is ready for it, not before', () => {
  // Six area-denial tools handed to a player in Act I is a menu, not a
  // toolkit — and the first ten missions were tuned against a belt of two.
  eq(devicesFor('ACT I').join(','), 'CHOKE,STANDDOWN', 'Act I deploys with two');
  ok(devicesFor('ACT II').includes('RAZOR'), 'wire by Act II');
  ok(devicesFor('ACT III').includes('PSYCHO'), 'the aerosol by Act III');
  ok(devicesFor('ACT IV').includes('GRAVITON'), 'the charge by Act IV');
  ok(devicesFor('ACT IV').includes('RAIN'), 'and the sky with it');
  eq(devicesFor('ACT IV').length, DEVICE_IDS.length, 'which is everything');

  gt(devicesFor('ACT IV').length, devicesFor('ACT II').length, 'and it only grows');
  gt(devicesFor('ACT II').length, devicesFor('ACT I').length, 'act by act');
});

test('a mission with a broken act gets the base kit, not the full one', () => {
  // A typo in a mission definition should quietly under-equip the squad.
  // The other way round hands somebody an orbital strike by accident.
  eq(actIndex('ACT XI'), 0, 'unrecognised reads as the beginning');
  eq(Object.keys(newDeviceBelt('ACT XI')).join(','), 'CHOKE,STANDDOWN', 'two tools');
});

test('the belt a mission deploys with matches its act', () => {
  const act1 = createSim('sector-7');
  eq(Object.keys(act1.belt).length, 2, 'Sector 7 carries two');
  eq(act1.belt.RAIN, undefined, 'and nothing it has not been issued');

  const act4 = createSim('reverse-the-gradient');
  eq(Object.keys(act4.belt).length, DEVICE_IDS.length, 'Act IV carries everything');
  eq(act4.belt.RAIN, DEVICE.RAIN.charges, 'including the sky');
});

test('a tool the squad does not carry cannot be thrown', () => {
  // The key exists from mission one; the tool does not. Pressing it has to
  // be a no-op rather than a free charge.
  const sim = createSim('sector-7');
  const at = { x: sim.city.deploy.x + 20, z: sim.city.deploy.z };
  step(sim, 1 / 60, { ...idle, aimPoint: at, deployDevice: 'RAIN' });
  eq(sim.devices.length, 0, 'nothing landed');
  eq(sim.belt.RAIN, undefined, 'and nothing appeared on the belt');
});

test('a retake deploys with the full kit', () => {
  // By the time the map is writing you work, you have the tools. The act
  // string on a generated deployment has to resolve, not fall through.
  const c = newCampaign();
  c.completed.push(sectorById('sector-7').from);
  c.territory['sector-7'].held = false;
  c.territory['sector-7'].owner = 'google';
  retakeFor(c.territory, 'sector-7');
  eq(Object.keys(createSim(retakeId('sector-7')).belt).length, DEVICE_IDS.length,
    'everything');
});

// ------------------------------------------------------------- razor wire

suite('razor wire');

test('crossing wire is slow and it costs — whoever is crossing it', () => {
  const sim = createSim('okafor-contract');
  const agent = sim.squad.agents[0];
  const h = sim.hostiles[0];
  h.x = agent.x + 3;
  h.z = agent.z;
  // Enough health to still be standing in it at the end — this is a test
  // about what the wire does to you, not about how long you last in it.
  h.health = 900;
  const health = { agent: agent.health, hostile: h.health };

  place(sim, 'RAZOR', { x: agent.x, z: agent.z }, 3);

  lt(agent.health, health.agent, 'it does not ask whose wire it is');
  lt(h.health, health.hostile, 'and it costs them too');
  ok(agent.snared, 'anyone standing in it is snared');
  near(h.speed, (h.baseSpeed ?? h.speed) * RAZOR_SPEED, 0.01, 'and crossing it is slow');
});

test('wire outlasts a firefight — it is the thing you place before one', () => {
  gt(DEVICE.RAZOR.lifetime, DEVICE.CHOKE.lifetime * 2, 'it does not disperse');
});

test('a civilian who dies in your wire is a civilian you killed', () => {
  const sim = createSim('okafor-contract');
  const c = sim.civilians.find(x => !x.isAsset && !x.isQuarry);
  c.health = 10;
  const at = { x: c.x, z: c.z };
  const before = { deaths: sim.civilianDeaths, heat: sim.heat };

  place(sim, 'RAZOR', at, 3);

  ok(c.dead, 'the wire killed them');
  eq(sim.civilianDeaths, before.deaths + 1, 'counted against the deployment');
  gt(sim.heat, before.heat, 'and the sector noticed');
});

// -------------------------------------------------- misalignment aerosol

suite('misalignment aerosol');

test('a cell caught in it fights itself', () => {
  const sim = createSim('gradient-relay-4');
  // Two of them close together and a long way from the squad, so the only
  // thing either can reach is the other.
  const [a, b] = sim.hostiles;
  a.x = sim.city.halfW - 30; a.z = sim.city.halfD - 30;
  b.x = a.x + 6; b.z = a.z;
  for (const other of sim.hostiles.slice(2)) { other.x = -sim.city.halfW; other.z = -sim.city.halfD; }
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }
  const health = b.health;

  place(sim, 'PSYCHO', { x: a.x + 3, z: a.z }, 1.5);
  ok(a.psycho > 0, 'they are carrying it');

  for (let i = 0; i < 60 * 6; i++) step(sim, 1 / 60, idle);
  lt(b.health, health, 'and one of them shot the other');
  eq(sim.civilianDeaths, 0, 'without the squad firing a round');
});

test('it reaches your own suits too', () => {
  const sim = createSim('gradient-relay-4');
  const [one, two] = sim.squad.agents;
  for (const h of sim.hostiles) { h.x = -sim.city.halfW; h.z = -sim.city.halfD; }
  two.x = one.x + 5;
  two.z = one.z;
  const health = two.health;

  place(sim, 'PSYCHO', { x: one.x + 2, z: one.z }, 1.5);
  ok(one.psycho > 0, 'the agent is carrying it');

  for (let i = 0; i < 60 * 6; i++) step(sim, 1 / 60, idle);
  lt(two.health, health, 'and their own squadmate shot them');
});

test('but it never turns the squad on a civilian', () => {
  // "The squad does not auto-target a civilian" is an absolute the
  // contract missions are built on. This must not become its exception.
  const sim = createSim('okafor-contract');
  const agent = sim.squad.agents[0];
  agent.psycho = PSYCHO_FOR;
  const c = sim.civilians.find(x => !x.isAsset);
  c.x = agent.x + 3;
  c.z = agent.z;
  for (const h of sim.hostiles) { h.x = -sim.city.halfW; h.z = -sim.city.halfD; }

  const before = sim.civilianDeaths;
  for (let i = 0; i < 60 * 8; i++) step(sim, 1 / 60, idle);
  eq(sim.civilianDeaths, before, 'nobody unarmed was shot');
});

test('holding fire is a real answer to being gassed', () => {
  // It costs the player their own guns for as long as it lasts, which is
  // the trade. A device with no counter is a cutscene.
  const sim = createSim('gradient-relay-4');
  const [one, two] = sim.squad.agents;
  for (const h of sim.hostiles) { h.x = -sim.city.halfW; h.z = -sim.city.halfD; }
  two.x = one.x + 5;
  two.z = one.z;
  sim.squad.cycleStance();
  sim.squad.cycleStance();          // ENGAGE → RETURN FIRE → HOLD FIRE
  const health = two.health;

  place(sim, 'PSYCHO', { x: one.x + 2, z: one.z }, 1.5);
  for (let i = 0; i < 60 * 6; i++) step(sim, 1 / 60, idle);
  eq(two.health, health, 'nobody fired on anybody');
});

test('it wears off, and walking out is what starts the clock', () => {
  const sim = createSim('gradient-relay-4');
  const h = sim.hostiles[0];
  place(sim, 'PSYCHO', { x: h.x, z: h.z }, 1.5);
  eq(h.psycho, PSYCHO_FOR, 'topped up while you stand in it');

  h.x = sim.city.halfW - 4;
  h.z = sim.city.halfD - 4;
  for (let i = 0; i < 60 * (PSYCHO_FOR + 1); i++) step(sim, 1 / 60, idle);
  eq(h.psycho, 0, 'and gone a while after leaving');
});

// -------------------------------------------------------- graviton charge

suite('graviton charge');

test('it drags everything inside to one place', () => {
  // On the deployment intersection, which is open street, with everyone
  // else out of the way. A charge centred inside a building drags people
  // to its facade and stops — that is the collision system doing its job
  // and it tells us nothing about the charge. A charge centred on the rest
  // of the squad is worse: bodies shove each other apart faster than it
  // pulls, so the target gets ejected from the middle of its own effect.
  const sim = quiet('reverse-the-gradient', 1);
  const at = { x: sim.city.deploy.x, z: sim.city.deploy.z };
  const agent = sim.squad.agents[0];
  agent.x = at.x + 11;
  agent.z = at.z;
  const h = sim.hostiles[0];
  h.x = at.x - 13;
  h.z = at.z;
  const before = { agent: dist(agent.x, agent.z, at.x, at.z), h: dist(h.x, h.z, at.x, at.z) };

  place(sim, 'GRAVITON', at, 3);

  lt(dist(h.x, h.z, at.x, at.z), before.h, 'the hostile was pulled in');
  lt(dist(agent.x, agent.z, at.x, at.z), before.agent, 'and so was your agent');
  lt(dist(h.x, h.z, at.x, at.z), GRAVITON_CORE + 2, 'right to the middle of it');
});

test('it stops at a pile, not a point', () => {
  // Everybody converging on one coordinate is a single blob of overlapping
  // bodies, which is neither readable nor shootable.
  const sim = createSim('reverse-the-gradient');
  const at = { x: sim.city.deploy.x, z: sim.city.deploy.z - 14 };
  const crowd = sim.hostiles.slice(0, 4);
  crowd.forEach((h, i) => { h.x = at.x + 8 + i; h.z = at.z + i; });

  place(sim, 'GRAVITON', at, 4);
  for (const h of crowd) {
    gte(dist(h.x, h.z, at.x, at.z), GRAVITON_CORE - 0.6, `${h.id} stopped short of the centre`);
  }
});

test('the charge stops short of the centre on its own account', () => {
  // Not because bodies shove each other apart — they do that anyway, which
  // is why the crowd test above cannot tell us this. The charge itself has
  // to stop, or a lone target ends up standing on the exact coordinate and
  // everything stacked there reads as one pixel.
  const d = new Device(DEVICE.GRAVITON, 0, 0);
  d.arming = 0;
  const lone = { x: 12, z: 0, radius: 1, dead: false, downed: false };
  for (let i = 0; i < 60 * 4; i++) tickDevices([d], [lone], 1 / 60);
  near(Math.hypot(lone.x, lone.z), GRAVITON_CORE, 0.01, 'it settles on the core radius');
});

test('it does no damage, which is not the same as safe', () => {
  const sim = createSim('reverse-the-gradient');
  const h = sim.hostiles[0];
  h.x = sim.city.deploy.x + 10;
  h.z = sim.city.deploy.z - 20;
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }
  const health = h.health;

  place(sim, 'GRAVITON', { x: h.x - 8, z: h.z }, 4);
  eq(h.health, health, 'nobody was hurt by the charge itself');
});

// -------------------------------------------------------- satellite rain

suite('satellite rain');

test('the warning is the weapon', () => {
  // Three and a half seconds of a ring on the ground and nothing else:
  // long enough to walk out, long enough to be too late if you were told
  // to hold. Nothing may happen before it lands.
  const sim = createSim('reverse-the-gradient');
  const h = sim.hostiles[0];
  const at = { x: h.x, z: h.z };
  const health = h.health;

  step(sim, 1 / 60, { ...idle, aimPoint: at, deployDevice: 'RAIN' });
  const d = sim.devices[0];
  gte(d.arming, 3, 'seconds of warning');
  for (let i = 0; i < 60 * 3; i++) step(sim, 1 / 60, idle);
  eq(h.health, health, 'and not a scratch on anyone while it counts down');
  notOk(d.fired, 'it has not landed');
});

test('and then it lands, on whoever is still standing there', () => {
  const sim = createSim('reverse-the-gradient');
  const h = sim.hostiles[0];
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }
  const at = { x: h.x, z: h.z };

  place(sim, 'RAIN', at, 5);
  ok(h.dead, 'standing on an impact is fatal');
  eq(sim.kills, 1, 'and counted once');
});

test('walking out of the ring is the whole counterplay', () => {
  const sim = createSim('reverse-the-gradient');
  const h = sim.hostiles[0];
  const at = { x: h.x, z: h.z };
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }

  step(sim, 1 / 60, { ...idle, aimPoint: at, deployDevice: 'RAIN' });
  h.x = at.x + DEVICE.RAIN.radius * 3;
  const health = h.health;
  for (let i = 0; i < 60 * 5; i++) step(sim, 1 / 60, idle);
  eq(h.health, health, 'clear of it is clear of it');
});

test('it lands where the ring said it would, every time', () => {
  // A fixed pattern, not a scatter. The ring is a promise, and a player
  // who cleared it must not be killed by a roll.
  const strikes = ['reverse-the-gradient', 'reverse-the-gradient'].map(() => {
    const sim = createSim('reverse-the-gradient');
    const at = { x: sim.city.deploy.x, z: sim.city.deploy.z - 30 };
    for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }
    const seen = [];
    step(sim, 1 / 60, { ...idle, aimPoint: at, deployDevice: 'RAIN' });
    for (let i = 0; i < 60 * 5; i++) {
      step(sim, 1 / 60, idle);
      for (const e of sim.events) if (e.type === 'strike') seen.push(`${e.x.toFixed(2)},${e.z.toFixed(2)}`);
      sim.events.length = 0;
    }
    return seen.join(' | ');
  });
  eq(strikes[0], strikes[1], 'two runs, the same impacts');
  eq(strikes[0].split('|').length, 5, 'five of them');
});

test('an impact falls off from its own centre', () => {
  // The edge of an impact is survivable and standing on one is not. Flat
  // damage across the footprint would make the ring a binary — in or out —
  // and the interesting decision is how far out is far enough.
  const sim = quiet('reverse-the-gradient', 2);
  const at = { x: sim.city.deploy.x, z: sim.city.deploy.z };
  const [middle, edge] = sim.hostiles;
  middle.x = at.x; middle.z = at.z; middle.health = 900; middle.maxHealth = 900;
  edge.x = at.x + RAIN_SPLASH - 0.5; edge.z = at.z; edge.health = 900; edge.maxHealth = 900;

  place(sim, 'RAIN', at, 5);
  const took = { middle: 900 - middle.health, edge: 900 - edge.health };
  gt(took.middle, 0, 'the centre was hit');
  gt(took.edge, 0, 'and so was the edge');
  gt(took.middle, took.edge * 1.5, `standing on it costs far more (${took.middle.toFixed(0)} vs ${took.edge.toFixed(0)})`);
});

test('it can level a block, and the block still has people in it', () => {
  const sim = createSim('reverse-the-gradient');
  const cover = sim.city.structures.find(s => s.destructible && !s.landmark && s.hp < 400);
  ok(cover, 'there is street cover to flatten');
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }

  place(sim, 'RAIN', { x: cover.x, z: cover.z }, 5);
  ok(cover.collapsed, 'the rain brought it down');
});

test('but it is not a demolition button', () => {
  // The only thing in the game that levels a block without the squad
  // firing a round. It must not also be the cheapest way to do it, or the
  // collapse cost model stops being a decision.
  const sim = createSim('reverse-the-gradient');
  const tower = sim.city.structures
    .filter(s => s.kind === 'tower' && !s.collapsed)
    .sort((a, b) => b.maxHp - a.maxHp)[0];
  for (const g of sim.squad.agents) { g.x = -sim.city.halfW + 5; g.z = -sim.city.halfD + 5; }

  place(sim, 'RAIN', { x: tower.x, z: tower.z }, 5);
  notOk(tower.collapsed, 'one strike does not drop a nine-floor block');
});

// --------------------------------------------------------- what it fixed

suite('device accounting');

test('a choke field is half speed while you are in it, not forever', () => {
  // Every field that slows somebody writes `speed` directly, and nothing
  // restored it for anyone but the agents. A hostile who crossed a choke
  // field compounded to a fraction of a metre per second and stayed there
  // for the rest of the mission. The old tests all passed: slowing is what
  // it is supposed to do.
  const sim = createSim('sector-7');
  const h = sim.hostiles[0];
  step(sim, 1 / 60, idle);
  const full = h.baseSpeed;
  gt(full, 1, 'they had a speed to begin with');

  place(sim, 'CHOKE', { x: h.x, z: h.z }, 3);
  near(h.speed, full * 0.5, 0.01, 'halved while standing in it — not quartered, not zeroed');

  h.x = sim.city.halfW - 4;
  h.z = sim.city.halfD - 4;
  for (let i = 0; i < 30; i++) step(sim, 1 / 60, idle);
  near(h.speed, full, 0.01, 'and back to themselves once out of it');
});

test('a choke field reaches the people it is named after', () => {
  // "Drops every Instance in range to Free tier." A civilian's pace is not
  // `speed` at all — it is three tier-derived speeds read through
  // `throttled` — so the field's own note was false for the only people on
  // the street running a consumer Instance.
  const sim = createSim('sector-7');
  const c = sim.civilians.find(x => !x.isAsset);
  place(sim, 'CHOKE', { x: c.x, z: c.z }, 2);
  ok(c.throttled, 'the civilian standing in it is throttled');
});

test('a body is counted once, however it died', () => {
  // Dropping a building on a cell used to credit the player twice for
  // every body — once where it fell and once in the reaper — so an
  // ELIMINATE for six could close on three. Satellite rain reaches both
  // paths at once: it kills what it lands on and collapses what it lands
  // in, so anyone standing under the cover it flattens goes through the
  // exact code that was double counting.
  const sim = quiet('reverse-the-gradient', 2);
  const cover = sim.city.structures
    .find(s => s.destructible && !s.landmark && s.hp < 400 && s.occupancy === 0);
  ok(cover, 'there is street cover to flatten');
  sim.hostiles.forEach((h, i) => {
    h.x = cover.x + i * 0.6;
    h.z = cover.z;
    h.health = 40;
  });

  place(sim, 'RAIN', { x: cover.x, z: cover.z }, 5);
  ok(cover.collapsed, 'the cover came down on them');
  const dead = sim.hostiles.filter(h => h.dead).length + sim.kills;
  eq(sim.kills, 2, 'two bodies, two kills');
  eq(dead, 2, 'and nothing was counted twice on the way');
});

test('somebody sedated and then killed stops being a sedation', () => {
  // `neutralised` is kills + downed. Leaving both set on one body would
  // close an ELIMINATE off half the people it asked for.
  const sim = quiet('reverse-the-gradient', 1);
  const h = sim.hostiles[0];

  place(sim, 'STANDDOWN', { x: h.x, z: h.z }, 8);
  ok(h.downed, 'sedated first');
  eq(sim.downed, 1, 'counted as down');
  eq(sim.neutralised, 1, 'one person is out of the fight');

  place(sim, 'RAIN', { x: h.x, z: h.z }, 5);
  ok(h.dead, 'and then killed');
  eq(sim.kills, 1, 'counted as a kill');
  eq(sim.downed, 0, 'and no longer counted as sedated');
  eq(sim.neutralised, 1, 'still one person, not two');
});
