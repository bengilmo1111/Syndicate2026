// What a frame of simulation events *sounds* like.
//
// Deliberately split from the thing that makes the noise. This half is
// pure — events in, cues out — which means the mix is testable in Node
// like everything else in this project, and the WebAudio half in
// `sound.js` only has to know how to realise a cue.
//
// The split matters more here than it looks. Almost every mistake in game
// audio is a *mixing* mistake: forty rounds a second all playing at full
// gain, a collapse that a kiosk and a nine-floor tower deliver identically,
// a firefight across the block that is as loud as one at your feet. Those
// are decisions about numbers, and numbers are testable. Only the timbre
// needs an ear.

/**
 * The voices, and what each one is for.
 *
 * `limit` is the hard cap on how many of that cue can start in a single
 * frame. Without it a four-agent firefight fires eight rounds a step and
 * the mix turns to white noise — which is not "loud", it is *quiet*,
 * because everything cancels and nothing reads.
 */
export const CUE = Object.freeze({
  SHOT: { id: 'SHOT', gain: 0.30, limit: 3 },
  SHOT_ENEMY: { id: 'SHOT_ENEMY', gain: 0.26, limit: 3 },
  HIT: { id: 'HIT', gain: 0.34, limit: 2 },
  RICOCHET: { id: 'RICOCHET', gain: 0.16, limit: 2 },
  // A structure taking damage is constant during a demolition; the
  // *warning* that it is about to come down is not, and it is the one the
  // player has to hear over the shooting.
  WARN: { id: 'WARN', gain: 0.5, limit: 1 },
  COLLAPSE: { id: 'COLLAPSE', gain: 0.85, limit: 2 },
  STRIKE: { id: 'STRIKE', gain: 0.9, limit: 5 },
  ALIGN: { id: 'ALIGN', gain: 0.3, limit: 2 },
  TURNED: { id: 'TURNED', gain: 0.45, limit: 1 },
  REFUSED: { id: 'REFUSED', gain: 0.55, limit: 1 },
  DEVICE: { id: 'DEVICE', gain: 0.45, limit: 2 },
  DOWNED: { id: 'DOWNED', gain: 0.4, limit: 2 },
  SECURED: { id: 'SECURED', gain: 0.5, limit: 1 },
  ALERT: { id: 'ALERT', gain: 0.6, limit: 1 },
  CHANNEL: { id: 'CHANNEL', gain: 0.5, limit: 1 },
  DEFECT: { id: 'DEFECT', gain: 0.7, limit: 1 },
  // A car going up on a street. Under a building coming down, over a gun.
  WRECK: { id: 'WRECK', gain: 0.8, limit: 2 },
});

/** Beyond this a thing is inaudible. Roughly the far side of the block. */
export const EARSHOT = 130;
/** Inside this, distance stops mattering — it is happening to you. */
export const CLOSE = 12;

/**
 * Which cue an event is, before any mixing.
 *
 * Returns `null` for events that are not sounds. `kill` is the loudest
 * omission: the round that did it already played a HIT, and stacking a
 * second voice on the same body at the same instant reads as a glitch
 * rather than as emphasis.
 */
export function cueFor(event) {
  switch (event.type) {
    case 'shot': return event.friendly ? CUE.SHOT : CUE.SHOT_ENEMY;
    case 'hit': return CUE.HIT;
    case 'impact': return CUE.RICOCHET;
    case 'structural': return CUE.WARN;
    case 'collapse': return CUE.COLLAPSE;
    case 'strike': return CUE.STRIKE;
    case 'align': return CUE.ALIGN;
    case 'turned': return CUE.TURNED;
    case 'refused': return CUE.REFUSED;
    case 'device': return CUE.DEVICE;
    case 'downed': return CUE.DOWNED;
    case 'secured': return CUE.SECURED;
    case 'alert': return CUE.ALERT;
    case 'interlude': return CUE.CHANNEL;
    case 'defect': return CUE.DEFECT;
    case 'wreck': return CUE.WRECK;
    default: return null;
  }
}

/**
 * How loud and how far left something is, from where the player is sitting.
 *
 * The listener carries the camera's yaw, not just its position, because
 * this game lets you spin the city. Panning on raw world X would send a
 * shot to the left ear and then leave it there while the player rotates
 * the block 180° around it.
 */
export function place(event, listener) {
  if (event.x === undefined || !listener) return { gain: 1, pan: 0 };
  const dx = event.x - listener.x;
  const dz = event.z - listener.z;
  const d = Math.hypot(dx, dz);

  // Linear rolloff past CLOSE. Not inverse-square: a city block is small,
  // and inverse-square makes everything past thirty metres inaudible,
  // which is where most of a firefight happens.
  const gain = d <= CLOSE ? 1 : Math.max(0, 1 - (d - CLOSE) / (EARSHOT - CLOSE));

  // Rotate into the listener's frame and take the sideways component.
  const yaw = listener.yaw ?? 0;
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const pan = d < 1 ? 0 : Math.max(-1, Math.min(1, right / 34));
  return { gain, pan };
}

/**
 * A frame of events, mixed.
 *
 * Sorted loudest-first *before* the per-cue cap is applied, so when three
 * of eight simultaneous rounds get through they are the three nearest the
 * player rather than the three that happened to be pushed first. Without
 * that the cap quietly makes a distant firefight drown out one at the
 * squad's feet.
 */
export function mix(events, listener, { floor = 0.02 } = {}) {
  const candidates = [];
  for (const e of events) {
    const cue = cueFor(e);
    if (!cue) continue;
    const { gain, pan } = place(e, listener);
    // Scaled by whatever the event itself says about size — a kiosk and a
    // nine-floor tower must not land identically.
    const weight = sizeOf(e);
    const level = cue.gain * gain * weight;
    if (level < floor) continue;
    candidates.push({ id: cue.id, gain: level, pan, cue, event: e });
  }

  candidates.sort((a, b) => b.gain - a.gain);
  const used = {};
  const out = [];
  for (const c of candidates) {
    const n = used[c.id] ?? 0;
    if (n >= c.cue.limit) continue;
    used[c.id] = n + 1;
    out.push(c);
  }

  // Voices of the same cue stack sub-linearly, the way a mixer sums
  // uncorrelated sources rather than the way arithmetic does. Satellite
  // rain lands five impacts on one frame; at full gain each that is 4.5 of
  // headroom from a single device, and everything else in the frame
  // disappears under it — or clips, which is worse, because a clipped
  // barrage sounds smaller than a clean one.
  for (const c of out) c.gain /= Math.sqrt(used[c.id]);
  return out;
}

/**
 * How big a thing was, where the event knows.
 *
 * Only collapses carry a size today. A kiosk coming down and a nine-floor
 * block coming down are the same event type and must not be the same
 * sound — the second one is ninety people.
 */
export function sizeOf(event) {
  if (event.type !== 'collapse') return 1;
  const mass = Math.min(1, (event.structure?.maxHp ?? 0) / 4000);
  return 0.45 + mass * 0.55;
}

// ------------------------------------------------------------- the room

/**
 * The bed under everything: what the block sounds like when nothing is
 * happening, and what it sounds like when something is.
 *
 * Austin at 2041 street level is a compute district — the ambience is
 * cooling plant, not traffic. So the bed is a low filtered rush that opens
 * up as the sector gets agitated, plus a sub drone that is only really
 * felt. It is deliberately not a music cue: the game has no score, and a
 * stinger arriving with enforcement would tell the player how to feel
 * about something the debrief is going to be dry about.
 *
 * `heat` is 0..1. What it opens is the *filter*, much more than the gain —
 * a bed that just gets louder reads as a volume bug, and a bed that gets
 * brighter reads as a street getting nervous.
 */
export const BED = Object.freeze({
  gain: 0.055,
  gainAtFull: 0.13,
  cutoff: 240,
  cutoffAtFull: 1500,
  drone: 44,
  droneGain: 0.35,
});

export function bedFor(heat = 0, { playing = true } = {}) {
  // Off the field entirely — briefing cards, the debrief, an interlude.
  // A room tone under a card the player is reading is just a hum.
  if (!playing) return { gain: 0, cutoff: BED.cutoff, drone: BED.drone };
  const h = Math.max(0, Math.min(1, heat));
  return {
    gain: BED.gain + (BED.gainAtFull - BED.gain) * h,
    // Exponential, so the top of the meter is where most of the change
    // happens. Enforcement arriving should be audible before it is visible.
    cutoff: BED.cutoff * Math.pow(BED.cutoffAtFull / BED.cutoff, h),
    drone: BED.drone,
  };
}
