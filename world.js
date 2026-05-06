// Mission data model. Pure data + pure update functions — no DOM, no canvas.
// game.js owns a `mission` object built from makeMission() and asks this
// module to update progress each frame and to check completion.

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

/**
 * Build the only mission shipped today. Phase 2 will move mission
 * definitions into a `missions/` registry; for now one definition is fine.
 */
export function makeMission() {
  return {
    id: 'sector-7',
    name: 'Sector 7 — Reclamation',
    briefing: 'Eliminate the rival cell holding Sector 7 before the Hong Kong board convenes.',
    objectives: [
      {
        id: 'kill-guards',
        type: OBJECTIVE_TYPES.ELIMINATE,
        description: 'Eliminate rival guards',
        target: 5,
        progress: 0,
        status: OBJECTIVE_STATUS.PENDING,
      },
    ],
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
