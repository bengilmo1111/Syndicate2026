// Mission data model. Pure data + pure update functions — no DOM, no canvas.
// Concrete missions live under `missions/` and are registered in MISSIONS.

import { sector7 } from './missions/sector-7.js';

export const OBJECTIVE_TYPES = Object.freeze({
  ELIMINATE: 'eliminate',
  PERSUADE: 'persuade',
  RETRIEVE: 'retrieve',
  ESCORT: 'escort',
  ESCAPE: 'escape',
});

export const OBJECTIVE_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

const MISSIONS = {
  [sector7.id]: sector7,
};

export function getMissionDef(id) {
  const def = MISSIONS[id];
  if (!def) throw new Error(`Unknown mission: ${id}`);
  return def;
}

export function buildMission(id) {
  const def = getMissionDef(id);
  return {
    id: def.id,
    name: def.name,
    briefing: def.briefing,
    objectives: def.buildObjectives(),
  };
}

/**
 * Update objective progress against the current mission state.
 * `progressInputs` is the minimum slice of game state each objective type
 * needs. Adding a new type means handling it here.
 */
export function updateMissionStatus(mission, progressInputs) {
  for (const obj of mission.objectives) {
    if (obj.status !== OBJECTIVE_STATUS.PENDING) continue;
    switch (obj.type) {
      case OBJECTIVE_TYPES.ELIMINATE:
        obj.progress = Math.min(progressInputs.kills, obj.target);
        if (obj.progress >= obj.target) obj.status = OBJECTIVE_STATUS.COMPLETE;
        break;
      case OBJECTIVE_TYPES.PERSUADE:
        obj.progress = Math.min(progressInputs.followers, obj.target);
        if (obj.progress >= obj.target) obj.status = OBJECTIVE_STATUS.COMPLETE;
        break;
      // Other types land here as they're built.
    }
  }
}

export function isMissionComplete(mission) {
  return mission.objectives.every(o => o.status === OBJECTIVE_STATUS.COMPLETE);
}

export function activeObjective(mission) {
  return mission.objectives.find(o => o.status === OBJECTIVE_STATUS.PENDING) || null;
}
