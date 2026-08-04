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
  SUNSET: 'sunset',         // kill a named non-combatant, on the record
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

/**
 * Register a mission the *map* wrote, rather than one an author did.
 *
 * Two differences from `registerMission`, both load-bearing:
 *
 * - It replaces instead of throwing on a duplicate id. The retake of
 *   Sector 7 is a different deployment every time the block changes hands,
 *   and it is the same deployment slot each time.
 * - It stays out of `order`, so a generated mission never appears in the
 *   tab strip, never counts toward campaign progress, and is never swept
 *   up by the suite's "every authored mission is completable" pass. The
 *   fifteen are the campaign. These are what the campaign does afterwards.
 */
export function registerGenerated(def) {
  const stored = { ...def, generated: true };
  registry.set(stored.id, stored);
  return stored;
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
  return !def.choice && !def.epilogue;
}

/**
 * The copy an epilogue shows, chosen by a campaign flag.
 *
 * An epilogue is neither a field mission nor a choice — the player has
 * already chosen, several missions ago, and this is the consequence being
 * read back to them. `def.epilogue.by` names the flag; `variants` holds a
 * `{ title, lines }` per value, and `fallback` covers a save that somehow
 * reaches the end with nothing recorded.
 */
export function epilogueFor(def, flags = {}) {
  const spec = def.epilogue;
  if (!spec) return null;
  const key = flags[spec.by] ?? spec.fallback;
  return spec.variants[key] ?? spec.variants[spec.fallback];
}

/** Every ending an epilogue can deliver. */
export function epilogueVariants(def) {
  return def.epilogue ? Object.keys(def.epilogue.variants) : [];
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
    /**
     * Completion by predicate rather than by counter, on the same state
     * snapshot. For objectives whose condition is a decision rather than
     * a tally — which route through the ending the player took, which
     * button they pressed on the console. Checked before the type switch,
     * so the type is only there to say what the objective *is*.
     */
    done: opts.done ?? null,
    // Key into the mission's debrief copy when this objective is what lost it.
    failReason: opts.failReason ?? null,
    status: STATUS.PENDING,
    /**
     * Mutually exclusive route through the mission. A mission completes
     * when every unbranched required objective is done AND every
     * objective of at least one branch is done. This is how The Refusal
     * offers "carry out the order" and "refuse it" as the same mission,
     * and it is the shape Act IV's three endings will need.
     */
    branch: opts.branch ?? null,
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

    if (obj.done) {
      if (obj.done(s)) obj.progress = obj.target;
      // A predicate objective is entirely described by its predicate.
      // Falling through would let the type switch overwrite it.
      if (obj.progress >= obj.target) {
        obj.status = STATUS.COMPLETE;
        if (obj.flag) Object.assign(mission.flags ??= {}, obj.flag);
      }
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
      case OBJECTIVE.SUNSET:
        obj.progress = s.assetsLost ?? 0;
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

/**
 * Required objectives only. Optional ones are score, not gating.
 *
 * With branches: every unbranched required objective must complete, and
 * then any *one* branch must complete in full. Taking one route does not
 * fail the other — it simply leaves it unfinished.
 */
/** Keys in a `debrief` object that are not ending copy. */
const DEBRIEF_META = new Set(['titles']);

/** Every ending a mission can show on a win. */
export function winEndings(def) {
  return Object.entries(def.debrief)
    .filter(([k, v]) => k !== 'loss' && !DEBRIEF_META.has(k) && Array.isArray(v) && v.length)
    .map(([k]) => k);
}

/**
 * The copy for an ending.
 *
 * Most missions have a single `win`. A mission whose endings *are* the
 * choice — Yelin is kill / capture / walk away — has no `win` at all, so
 * fall through to whatever ending it does declare rather than handing the
 * overlay `undefined` and blanking the card.
 */
export function debriefLines(def, key) {
  const d = def.debrief;
  return d[key] ?? d.win ?? d[winEndings(def)[0]] ?? d.loss;
}

export function isMissionComplete(mission) {
  const required = mission.objectives.filter(o => !o.optional);
  const done = o => o.status === STATUS.COMPLETE;

  if (!required.filter(o => !o.branch).every(done)) return false;

  const branches = [...new Set(required.filter(o => o.branch).map(o => o.branch))];
  if (!branches.length) return true;
  return branches.some(b => required.filter(o => o.branch === b).every(done));
}

/**
 * A failed required objective loses the mission even with the squad alive.
 * Branch objectives are exempt: refusing one route is not failing.
 */
export function failedObjective(mission) {
  return mission.objectives.find(
    o => !o.optional && !o.branch && o.status === STATUS.FAILED,
  ) ?? null;
}

/** Which branch, if any, the player actually took. */
export function takenBranch(mission) {
  const required = mission.objectives.filter(o => !o.optional && o.branch);
  const branches = [...new Set(required.map(o => o.branch))];
  return branches.find(
    b => required.filter(o => o.branch === b).every(o => o.status === STATUS.COMPLETE),
  ) ?? null;
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
