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

export function objective(type, opts = {}) {
  return {
    id: opts.id ?? `${type}-${order.length}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: opts.label ?? type.toUpperCase(),
    target: opts.target ?? 1,
    progress: 0,
    optional: !!opts.optional,
    hidden: !!opts.hidden,
    status: STATUS.PENDING,
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
  for (const obj of mission.objectives) {
    if (obj.status !== STATUS.PENDING) continue;
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
      default:
        break;
    }
    if (obj.progress >= obj.target) obj.status = STATUS.COMPLETE;
  }
}

/** Required objectives only. Optional ones are score, not gating. */
export function isMissionComplete(mission) {
  return mission.objectives
    .filter(o => !o.optional)
    .every(o => o.status === STATUS.COMPLETE);
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
