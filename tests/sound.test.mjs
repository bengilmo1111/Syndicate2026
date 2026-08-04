// The mix.
//
// Almost every mistake in game audio is a mixing mistake: forty rounds a
// second all at full gain, a kiosk and a nine-floor tower delivered
// identically, a firefight across the block as loud as one at your feet.
// Those are decisions about numbers, which is why they live in `kit.js`
// and are testable here. Only the timbre needs an ear, and that half is in
// `sound.js` where Node cannot reach it.

import { suite, test, ok, notOk, eq, near, lt, gt, gte } from './lib/harness.mjs';
import {
  cueFor, place, mix, sizeOf, bedFor, CUE, EARSHOT, CLOSE,
} from '../src/audio/kit.js';

const here = { x: 0, z: 0, yaw: 0 };
const at = (x, z, type = 'shot', extra = {}) => ({ type, x, z, ...extra });

suite('sound cues');

test('the events that are sounds have one, and the rest do not', () => {
  eq(cueFor({ type: 'shot', friendly: true }), CUE.SHOT);
  eq(cueFor({ type: 'shot', friendly: false }), CUE.SHOT_ENEMY);
  eq(cueFor({ type: 'collapse' }), CUE.COLLAPSE);
  eq(cueFor({ type: 'strike' }), CUE.STRIKE);
  eq(cueFor({ type: 'refused' }), CUE.REFUSED);
  eq(cueFor({ type: 'interlude' }), CUE.CHANNEL);
  eq(cueFor({ type: 'line' }), null, 'a subtitle is not a sound');
  eq(cueFor({ type: 'nonsense' }), null, 'and neither is an event we never added');
});

test('a kill is deliberately silent', () => {
  // The round that did it already played a HIT on the same body at the
  // same instant. A second voice there reads as a glitch, not emphasis.
  eq(cueFor({ type: 'kill' }), null);
});

test('the squad and the opposition do not sound the same', () => {
  // You have to be able to tell who is shooting with your eyes on the far
  // side of the block.
  ok(cueFor({ type: 'shot', friendly: true }) !== cueFor({ type: 'shot', friendly: false }));
});

suite('sound placement');

test('close is loud, far is quiet, and past the block is nothing', () => {
  eq(place(at(0, 0), here).gain, 1, 'at your feet');
  eq(place(at(CLOSE - 1, 0), here).gain, 1, 'and anywhere inside the close radius');
  const mid = place(at(60, 0), here).gain;
  lt(mid, 1, 'across the street it is quieter');
  gt(mid, 0, 'but still there');
  eq(place(at(EARSHOT + 40, 0), here).gain, 0, 'past earshot, nothing');
});

test('panning follows the camera, not the world', () => {
  // This game lets you spin the city. Panning on raw world X would send a
  // shot to the left ear and leave it there while the player rotates the
  // block 180° around it.
  const east = at(40, 0);
  gt(place(east, { x: 0, z: 0, yaw: 0 }).pan, 0.5, 'to the right, unrotated');
  lt(place(east, { x: 0, z: 0, yaw: Math.PI }).pan, -0.5, 'and to the left once you turn around');
});

test('something happening on top of you is not panned anywhere', () => {
  near(place(at(0.2, 0.1), here).pan, 0, 0.05, 'no side to be on');
});

test('an event with no position is centre and full volume', () => {
  // The alert banner and a channel opening are not *somewhere*.
  const p = place({ type: 'alert' }, here);
  eq(p.gain, 1);
  eq(p.pan, 0);
});

suite('the mix');

test('a firefight is capped, and the cap keeps the nearest rounds', () => {
  // Eight rounds a step is normal for four agents. Without a cap the mix
  // turns to white noise — which is not "loud", it is quiet, because
  // everything cancels and nothing reads.
  const events = [];
  for (let i = 0; i < 8; i++) events.push(at(90 - i, 0, 'shot', { friendly: true }));
  const out = mix(events, here);
  eq(out.length, CUE.SHOT.limit, 'three of eight got through');

  // And they are the three nearest, not the three that happened to be
  // pushed first — otherwise a distant firefight drowns out one at the
  // squad's feet.
  ok(out.every(c => c.event.x <= 85), 'and they are the three nearest');
  gt(out[0].gain, out[out.length - 1].gain, 'loudest first');
});

test('the caps are per voice, so a collapse is never crowded out', () => {
  const events = [];
  for (let i = 0; i < 8; i++) events.push(at(4 + i, 0, 'shot', { friendly: true }));
  events.push({ type: 'collapse', x: 6, z: 0, structure: { maxHp: 3800 } });
  const out = mix(events, here);
  ok(out.some(c => c.id === 'COLLAPSE'), 'the building still comes down audibly');
  eq(out.filter(c => c.id === 'SHOT').length, CUE.SHOT.limit, 'and the rounds are still capped');
});

test('a kiosk and a tower do not land the same', () => {
  // Ninety Free-tier tenants versus a vending kiosk. The cost model says
  // these are different and the mix has to agree.
  const kiosk = { type: 'collapse', x: 0, z: 0, structure: { maxHp: 140 } };
  const tower = { type: 'collapse', x: 0, z: 0, structure: { maxHp: 3800 } };
  gt(sizeOf(tower), sizeOf(kiosk) * 1.5, 'the tower is much bigger');
  gt(mix([tower], here)[0].gain, mix([kiosk], here)[0].gain, 'and much louder');
});

test('voices of one cue stack the way a mixer sums, not the way arithmetic does', () => {
  // Satellite rain lands five impacts on a single frame. At full gain each
  // that is a device putting 4.5 of headroom into one step: everything
  // else in the frame disappears under it, or it clips — and a clipped
  // barrage sounds *smaller* than a clean one, which is the opposite of
  // what the tool is for.
  const one = mix([{ type: 'strike', x: 0, z: 0 }], here);
  const five = mix([0, 1, 2, 3, 4].map(i => ({ type: 'strike', x: i, z: 0 })), here);
  eq(five.length, 5, 'all five land');
  const total = five.reduce((s2, c) => s2 + c.gain, 0);
  gt(total, one[0].gain, 'five is louder than one');
  lt(total, one[0].gain * 5, 'but not five times louder');
});

test('something too quiet to hear is not played at all', () => {
  // Not a purity argument: every voice is a handful of WebAudio nodes, and
  // spawning them for shots on the far side of the map costs the frame
  // rate for nothing anybody can hear.
  eq(mix([at(EARSHOT - 2, 0, 'shot', { friendly: true })], here).length, 0,
    'below the floor, no voice');
  eq(mix([at(3, 0, 'shot', { friendly: true })], here).length, 1,
    'at your feet, one');
});

test('a whole frame of a bad firefight stays bounded', () => {
  // The worst case the game can actually produce: everyone shooting,
  // everyone hit, a strike landing and a block coming down on top of it.
  const events = [];
  for (let i = 0; i < 12; i++) events.push(at(i, 0, 'shot', { friendly: i % 2 === 0 }));
  for (let i = 0; i < 6; i++) events.push(at(i, 2, 'hit'));
  for (let i = 0; i < 5; i++) events.push(at(i * 4, 4, 'strike'));
  events.push({ type: 'collapse', x: 2, z: 2, structure: { maxHp: 3800 } });
  events.push(at(1, 1, 'impact'));

  const out = mix(events, here);
  lt(out.length, 16, `${out.length} voices in the worst frame the game has`);
  const total = out.reduce((sum, c) => sum + c.gain, 0);
  lt(total, 6, `and ${total.toFixed(1)} total gain, not thirty`);
});

test('no cue is louder than the ones that matter most', () => {
  // A gunshot is the most common sound in the game by two orders of
  // magnitude. If it is also the loudest, nothing else is ever heard.
  for (const id of ['SHOT', 'SHOT_ENEMY', 'HIT', 'RICOCHET', 'ALIGN']) {
    lt(CUE[id].gain, CUE.COLLAPSE.gain, `${id} sits under a building coming down`);
    lt(CUE[id].gain, CUE.ALERT.gain, `${id} sits under the alert`);
  }
  gte(CUE.STRIKE.gain, CUE.COLLAPSE.gain, 'and orbital rain is the loudest thing there is');
});

test('every cue the table can emit has a gain and a cap', () => {
  for (const [id, cue] of Object.entries(CUE)) {
    eq(cue.id, id, `${id}: knows its own name`);
    gt(cue.gain, 0, `${id}: is audible`);
    lt(cue.gain, 1.01, `${id}: does not clip on its own`);
    gte(cue.limit, 1, `${id}: can play at all`);
  }
});

suite('the room');

test('a quiet block and a block on fire do not sound the same', () => {
  const calm = bedFor(0);
  const hot = bedFor(1);
  gt(hot.gain, calm.gain, 'busier is louder');
  gt(hot.cutoff, calm.cutoff * 3, 'and much brighter');
});

test('what heat opens is the filter, not the volume', () => {
  // A bed that only gets louder reads as a volume bug. A bed that gets
  // brighter reads as a street getting nervous, which is the thing the
  // heat meter is actually about.
  const calm = bedFor(0);
  const hot = bedFor(1);
  const louder = hot.gain / calm.gain;
  const brighter = hot.cutoff / calm.cutoff;
  gt(brighter, louder * 2, `×${brighter.toFixed(1)} brighter vs ×${louder.toFixed(1)} louder`);
  lt(hot.gain, 0.2, 'and it never gets loud enough to compete with the guns');
});

test('most of the change happens at the top of the meter', () => {
  // Enforcement arriving should be audible before it is visible, which
  // means the curve has to be back-loaded rather than linear.
  const low = bedFor(0.5).cutoff - bedFor(0).cutoff;
  const high = bedFor(1).cutoff - bedFor(0.5).cutoff;
  gt(high, low, `${Math.round(high)}Hz in the top half vs ${Math.round(low)}Hz in the bottom`);
});

test('the room is silent off the field', () => {
  // Briefing cards, the debrief, an interlude. A room tone under a card
  // somebody is reading is just a hum.
  eq(bedFor(1, { playing: false }).gain, 0, 'nothing while a card is up');
  gt(bedFor(0, { playing: true }).gain, 0, 'and something the moment it is not');
});

test('heat outside the meter does not break the room', () => {
  eq(bedFor(-4).gain, bedFor(0).gain, 'clamped low');
  eq(bedFor(99).gain, bedFor(1).gain, 'and clamped high');
});
