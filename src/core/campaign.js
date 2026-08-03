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

import { newRoster, migrateRoster, researchFor, recordDeployment } from './roster.js';
import { newTerritory, migrateTerritory, settle } from './territory.js';

export const SAVE_VERSION = 4;

export function newCampaign() {
  return {
    version: SAVE_VERSION,
    /** Mission ids the player has won, in the order they won them. */
    completed: [],
    /** Narrative branch flags — bravoCalibrated, defectedAtRefusal, … */
    flags: {},
    /** Best result per mission, for the briefing card. */
    records: {},
    /**
     * The four people, their implants, and unspent research. Persisting
     * this is what makes a squad wipe cost something — see `roster.js`.
     */
    roster: newRoster(),
    /**
     * The strategic layer: which sectors are held, how hard each is
     * rationed, and how close each is to handing itself back. See
     * `territory.js` — the throttle is SURGE's argument one scale up.
     */
    territory: newTerritory(),
  };
}

/** Accept an old or foreign save without letting it corrupt anything. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return newCampaign();
  const c = newCampaign();
  if (Array.isArray(raw.completed)) c.completed = raw.completed.filter(id => typeof id === 'string');
  if (raw.flags && typeof raw.flags === 'object') c.flags = { ...raw.flags };
  if (raw.records && typeof raw.records === 'object') c.records = { ...raw.records };
  // A v2 save has no roster at all. It gets a fresh one rather than being
  // thrown away — a player mid-campaign should not lose their progress to
  // a feature being added behind them.
  c.roster = migrateRoster(raw.roster);
  // v3 and earlier have no map. They get an empty one and reclaim sectors
  // as they replay — the alternative is handing a returning player ten
  // sectors they never took.
  c.territory = migrateTerritory(raw.territory);
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
  if (!needs.every(id => isComplete(campaign, id))) return false;

  // Some missions depend on *how* an earlier one went, not just that it
  // happened. The Refusal is the first: what follows it differs depending
  // on whether the player carried out the order.
  const flags = def.requiresFlags ?? null;
  if (flags) {
    for (const [key, want] of Object.entries(flags)) {
      if ((campaign.flags[key] ?? false) !== want) return false;
    }
  }
  return true;
}

/** Why a mission is locked, in the player's language. */
export function lockReason(campaign, def, lookup) {
  const missing = (def.requires ?? []).filter(id => !isComplete(campaign, id));
  if (missing.length) {
    const names = missing.map(id => lookup(id)?.name ?? id);
    return `REQUIRES ${names.join(' · ')}`;
  }
  if (!isUnlocked(campaign, def)) return 'REQUIRES A DIFFERENT DECISION';
  return null;
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

/**
 * Close out a deployment: bank the research, mark the dead lost for good,
 * and draw replacements. Returns what it cost so the debrief can say so.
 */
export function recordCasualties(campaign, missionId, result = {}) {
  const roster = campaign.roster ??= newRoster();
  const territory = campaign.territory ??= newTerritory();

  // Two sources of research: what the deployment itself earned, and what
  // the map paid while it was happening. The second is the whole point of
  // holding ground.
  const earned = researchFor(result);
  const strategic = settle(territory, { missionId });
  roster.research += earned + strategic.paid;

  const { lost, drawn } = recordDeployment(roster, missionId, result);
  return { earned, lost, drawn, ...strategic };
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
