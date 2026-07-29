// Mission and objective model. Pure data + pure update functions.
// Concrete missions live under `src/missions/` and register here.
//
// Narrative canon for every mission slot is NARRATIVE.md §6. Do not invent
// parallel missions — pick the corresponding slot.

export const OBJECTIVE = Object.freeze({
  ELIMINATE: 'eliminate',   // kill N rivals
  ALIGN: 'align',           // convert N civilians with the Aligner
  DEMOLISH: 'demolish',     // collapse a named landmark structure
  EXTRACT: 'extract',       // get the squad into an extraction zone
  HOLD: 'hold',             // stay in a zone for N seconds
  RETRIEVE: 'retrieve',     // reach an asset and keep it alive to extraction
  DECIDE: 'decide',         // a briefing-room choice, no field component
});

export const STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

const registry = new Map();
const order = [];

export function registerMission(def) {
  if (registry.has(def.id)) throw new Error(`Duplicate mission id: ${def.id}`);
  registry.set(def.id, def);
  order.push(def.id);
  return def;
}

export function getMissionDef(id) {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown mission: ${id}`);
  return def;
}

export function getAllMissions() {
  return order.map(id => registry.get(id));
}

/**
 * Missions with a field component. A decision mission is a briefing room
 * and a choice — there is no city to build and nothing to simulate, so
 * anything that drives `createSim` needs to know the difference.
 */
export function isFieldMission(def) {
  return !def.choice;
}

export function getFieldMissions() {
  return getAllMissions().filter(isFieldMission);
}

export function objective(type, opts = {}) {
  return {
    id: opts.id ?? `${type}-${order.length}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: opts.label ?? type.toUpperCase(),
    target: opts.target ?? 1,
    progress: 0,
    optional: !!opts.optional,
    hidden: !!opts.hidden,
    // Id of an objective that must complete before this one starts counting.
    // Without it an EXTRACT objective completes on frame one, because the
    // squad is usually standing in the extraction zone when it deploys.
    after: opts.after ?? null,
    // Optional predicate on the same state snapshot updateMissionStatus gets.
    failed: opts.failed ?? null,
    // Key into the mission's debrief copy when this objective is what lost it.
    failReason: opts.failReason ?? null,
    status: STATUS.PENDING,
    // Narrative flags written onto mission.flags when this completes.
    // A hidden objective is how the game notices what the player chose to
    // do when nothing asked them to.
    flag: opts.flag ?? null,
    // Free-form payload the mission setup fills in (landmark name, zone, …).
    meta: opts.meta ?? {},
  };
}

export function buildMission(id) {
  const def = getMissionDef(id);
  return {
    id: def.id,
    name: def.name,
    sector: def.sector,
    rival: def.rival,
    act: def.act,
    briefing: def.briefing,
    debrief: def.debrief,
    objectives: def.buildObjectives(),
    flags: {},
  };
}

/**
 * Advance every pending objective against a snapshot of game state.
 * Adding an objective type means handling it here and nowhere else.
 */
export function updateMissionStatus(mission, s) {
  const byId = new Map(mission.objectives.map(o => [o.id, o]));

  for (const obj of mission.objectives) {
    if (obj.status !== STATUS.PENDING) continue;
    if (obj.after && byId.get(obj.after)?.status !== STATUS.COMPLETE) continue;

    // A mission can fail an objective outright — the escorted asset dies,
    // the target escapes. Failing a required objective ends the mission.
    if (obj.failed?.(s)) {
      obj.status = STATUS.FAILED;
      continue;
    }

    switch (obj.type) {
      case OBJECTIVE.ELIMINATE:
        obj.progress = Math.min(s.kills, obj.target);
        break;
      case OBJECTIVE.ALIGN:
        obj.progress = Math.min(s.aligned, obj.target);
        break;
      case OBJECTIVE.DEMOLISH:
        obj.progress = s.landmarks.filter(
          l => l.collapsed && (!obj.meta.name || l.name === obj.meta.name),
        ).length;
        break;
      case OBJECTIVE.HOLD:
        if (s.inZone) obj.progress = Math.min(obj.progress + s.dt, obj.target);
        else obj.progress = Math.max(0, obj.progress - s.dt * 0.5);
        break;
      case OBJECTIVE.EXTRACT:
        obj.progress = s.squadExtracted ? obj.target : 0;
        break;
      case OBJECTIVE.RETRIEVE:
        obj.progress = s.assetsSecured ?? 0;
        break;
      case OBJECTIVE.DECIDE:
        obj.progress = s.decided ? obj.target : 0;
        break;
      default:
        break;
    }
    if (obj.progress >= obj.target) {
      obj.status = STATUS.COMPLETE;
      if (obj.flag) Object.assign(mission.flags ??= {}, obj.flag);
    }
  }
}

/** Required objectives only. Optional ones are score, not gating. */
export function isMissionComplete(mission) {
  return mission.objectives
    .filter(o => !o.optional)
    .every(o => o.status === STATUS.COMPLETE);
}

/** A failed required objective loses the mission even with the squad alive. */
export function failedObjective(mission) {
  return mission.objectives.find(o => !o.optional && o.status === STATUS.FAILED) ?? null;
}

export function activeObjective(mission) {
  return mission.objectives.find(o => o.status === STATUS.PENDING && !o.hidden)
    ?? mission.objectives.find(o => o.status === STATUS.PENDING)
    ?? null;
}

export function objectiveText(obj) {
  if (obj.target > 1) return `${obj.label} — ${Math.floor(obj.progress)}/${obj.target}`;
  return obj.label;
}
