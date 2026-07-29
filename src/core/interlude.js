// Mid-mission dialog beats.
//
// Acts I–III put every word either in a briefing (before) or a debrief
// (after). Act IV needs words *during* — Yelin talks to the player while
// the player is standing in their building holding a gun, and the whole
// point is that the player has to keep standing there to hear it.
//
// A mission declares interludes; the sim fires one when its condition
// first becomes true, freezes the field, and waits. The player answers.
// Missions 12 through 15 are all partly dialog, so this is built to be
// used four times, not once.
//
// Engine-agnostic like everything else in core: an interlude is data,
// the UI decides what a "card" looks like, and the whole thing runs
// headless in the test suite.

/**
 * Declare a mid-mission beat.
 *
 * @param {object} spec
 * @param {string} spec.id          unique within the mission
 * @param {string} spec.speaker     who is talking, for the card header
 * @param {string[]} spec.lines     what they say
 * @param {(sim: object) => boolean} spec.when  fires the first time this is true
 * @param {object[]} spec.options   what the player may answer; each is
 *   `{ id, label, lines?, flag?, effect? }`. `lines` is the reply, `flag`
 *   is merged into mission flags, `effect(sim)` mutates the field.
 * @param {boolean} [spec.blocking] true (default) freezes the sim while
 *   the card is up. Set false for a beat that plays over live combat.
 */
export function interlude(spec) {
  if (!spec.id) throw new Error('interlude needs an id');
  if (!spec.options?.length) throw new Error(`interlude ${spec.id} needs options`);
  for (const o of spec.options) {
    if (!o.id || !o.label) throw new Error(`interlude ${spec.id}: every option needs an id and a label`);
  }
  return {
    blocking: true,
    lines: [],
    ...spec,
  };
}

/**
 * Check every declared interlude and raise the first one whose moment has
 * come. Called from `step` before anything else moves.
 *
 * Returns true if the field should be frozen this frame.
 */
export function pumpInterludes(sim) {
  if (sim.interlude) return sim.interlude.blocking;

  for (const def of sim.interludeDefs) {
    if (sim.interludesSeen.has(def.id)) continue;
    let due = false;
    try {
      due = !!def.when(sim);
    } catch {
      // A condition that reads state a mission variant never built is a
      // mission bug, not a crash. Skip it and let the tests find it.
      due = false;
    }
    if (!due) continue;
    sim.interludesSeen.add(def.id);
    sim.interlude = def;
    sim.events.push({ type: 'interlude', id: def.id, speaker: def.speaker });
    return def.blocking;
  }
  return false;
}

/**
 * Answer the interlude on screen.
 *
 * Returns the chosen option so the UI can show its reply, or null if
 * there was nothing to answer or the id was not on offer.
 */
export function answerInterlude(sim, optionId) {
  const current = sim.interlude;
  if (!current) return null;
  const option = current.options.find(o => o.id === optionId);
  if (!option) return null;

  sim.interlude = null;
  sim.interludeAnswers[current.id] = option.id;
  if (option.flag) Object.assign(sim.mission.flags ??= {}, option.flag);
  option.effect?.(sim);
  return option;
}

/** How the player answered a given beat, or undefined if it never fired. */
export function answerTo(sim, interludeId) {
  return sim.interludeAnswers[interludeId];
}
