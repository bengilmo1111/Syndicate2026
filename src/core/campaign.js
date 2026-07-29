// Campaign state: what the player has completed, and what that unlocks.
//
// Pure and serialisable. Persistence is the UI layer's problem — `src/core/`
// cannot touch localStorage any more than it can touch the DOM, and keeping
// it that way is what lets the whole progression system be tested in Node.
//
// Gating matters more than it looks. The Act I→II turn only lands if the
// player walked Act I in order and watched the briefings get more
// euphemistic mission by mission; shuffled, it is four disconnected
// firefights.

export const SAVE_VERSION = 2;

export function newCampaign() {
  return {
    version: SAVE_VERSION,
    /** Mission ids the player has won, in the order they won them. */
    completed: [],
    /** Narrative branch flags — bravoCalibrated, defectedAtRefusal, … */
    flags: {},
    /** Best result per mission, for the briefing card. */
    records: {},
  };
}

/** Accept an old or foreign save without letting it corrupt anything. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return newCampaign();
  const c = newCampaign();
  if (Array.isArray(raw.completed)) c.completed = raw.completed.filter(id => typeof id === 'string');
  if (raw.flags && typeof raw.flags === 'object') c.flags = { ...raw.flags };
  if (raw.records && typeof raw.records === 'object') c.records = { ...raw.records };
  return c;
}

export function isComplete(campaign, id) {
  return campaign.completed.includes(id);
}

/**
 * A mission is available when every prerequisite is complete.
 * Missions with no `requires` are always open — that is how Act I·1 starts
 * and how a debug or sandbox mission would opt out.
 */
export function isUnlocked(campaign, def) {
  const needs = def.requires ?? [];
  return needs.every(id => isComplete(campaign, id));
}

/** Why a mission is locked, in the player's language. */
export function lockReason(campaign, def, lookup) {
  const missing = (def.requires ?? []).filter(id => !isComplete(campaign, id));
  if (!missing.length) return null;
  const names = missing.map(id => lookup(id)?.name ?? id);
  return `REQUIRES ${names.join(' · ')}`;
}

/** Record a win. Idempotent — replaying a mission keeps the better record. */
export function recordWin(campaign, id, result = {}) {
  if (!isComplete(campaign, id)) campaign.completed.push(id);
  const prev = campaign.records[id];
  const better = !prev || (result.civilianDeaths ?? 0) < (prev.civilianDeaths ?? Infinity);
  if (better) {
    campaign.records[id] = {
      elapsed: Math.round(result.elapsed ?? 0),
      kills: result.kills ?? 0,
      aligned: result.aligned ?? 0,
      civilianDeaths: result.civilianDeaths ?? 0,
    };
  }
  return campaign;
}

export function setFlag(campaign, key, value) {
  campaign.flags[key] = value;
  return campaign;
}

/** The first unlocked mission the player has not finished, or null. */
export function nextMission(campaign, defs) {
  return defs.find(d => isUnlocked(campaign, d) && !isComplete(campaign, d.id)) ?? null;
}

export function progress(campaign, defs) {
  return { done: campaign.completed.length, total: defs.length };
}
