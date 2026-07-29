// A bot that plays a mission headlessly, to completion, and reports whether
// it could.
//
// This exists because the same bug class has bitten this project twice:
//   - the Sable Campus escort was uncompletable, because agents walked into
//     the first building on the straight line and dropped the order;
//   - The Bracket's reveal was unreachable, because the cell fled faster
//     than the player could close to Aligner range.
// Both were found by hand. Neither would survive this file.
//
// The bot is deliberately dumb. It is not a difficulty benchmark — if a
// mission needs clever play, that is a design question, not a test failure.
// What it proves is that the mission has a reachable win state at all, and
// that every system a mission depends on still functions end to end.

import { createSim, step, PHASE } from '../../src/core/sim.js';
import { activeObjective, OBJECTIVE, STATUS } from '../../src/core/mission.js';
import { ALIGNER } from '../../src/core/squad.js';
import { dist } from '../../src/core/math.js';
import { structureInPath } from '../../src/core/city.js';

/** Re-issuing a move order every frame defeats pathfinding. Throttle it. */
const ORDER_INTERVAL = 0.55;

export function autoplay(missionId, opts = {}) {
  const {
    dt = 1 / 60,
    maxSeconds = 420,
    trace = false,
  } = opts;

  const sim = createSim(missionId);
  const log = [];
  let orderTimer = 0;
  let lastGoal = null;
  let elapsed = 0;

  while (sim.phase === PHASE.PLAYING && elapsed < maxSeconds) {
    orderTimer -= dt;
    const obj = activeObjective(sim.mission);
    const goal = goalFor(sim, obj);

    const intent = { moveX: 0, moveZ: 0, firing: false, aimPoint: null };

    // The Aligner is a mode, not an action: engage it only when the current
    // objective actually wants conversions, and drop it otherwise so the
    // squad can shoot.
    const wantAligner = obj?.type === OBJECTIVE.ALIGN;
    if (wantAligner && sim.squad.alignerMode === ALIGNER.OFF) sim.squad.cycleAligner();
    if (!wantAligner && sim.squad.alignerMode !== ALIGNER.OFF) sim.squad.alignerMode = ALIGNER.OFF;

    if (goal) {
      const moved = !lastGoal || dist(goal.x, goal.z, lastGoal.x, lastGoal.z) > 6;
      const idle = !sim.squad.agents.some(a => a.moveTarget);
      if (idle || (orderTimer <= 0 && moved)) {
        sim.squad.issueMove(goal, sim.city);
        orderTimer = ORDER_INTERVAL;
        lastGoal = { x: goal.x, z: goal.z };
      }

      // Structures are never auto-targeted — a DEMOLISH objective only
      // progresses if something deliberately shoots the thing.
      if (obj?.type === OBJECTIVE.DEMOLISH && goal.aim) {
        const lead = sim.squad.alive[0];
        // LOS *to* a standing structure is always false — the structure is
        // what blocks it. The right question is whether our own target is
        // the first thing a round would hit.
        if (lead && structureInPath(sim.city, lead.x, lead.z, goal.aim.x, goal.aim.z) === goal.aim) {
          intent.firing = true;
          intent.aimPoint = { x: goal.aim.x, z: goal.aim.z };
        }
      }
    }

    step(sim, dt, intent);
    elapsed += dt;

    if (trace && Math.floor(elapsed) !== Math.floor(elapsed - dt)) {
      log.push(`${elapsed.toFixed(0)}s ${obj?.label ?? '—'} ${obj?.progress ?? 0}/${obj?.target ?? 0}`);
    }
  }

  return {
    sim,
    won: sim.phase === PHASE.WON,
    lost: sim.phase === PHASE.LOST,
    timedOut: sim.phase === PHASE.PLAYING,
    elapsed,
    failReason: sim.failReason,
    kills: sim.kills,
    aligned: sim.alignedCount,
    civilianDeaths: sim.civilianDeaths,
    objectives: sim.mission.objectives.map(o => ({
      label: o.label, status: o.status, progress: o.progress, target: o.target,
    })),
    trace: log,
  };
}

/** Where the bot should walk, given whatever it's currently being asked to do. */
function goalFor(sim, obj) {
  if (!obj) return null;
  const centre = sim.squad.center();
  if (!centre) return null;

  switch (obj.type) {
    case OBJECTIVE.ELIMINATE:
      return nearest(centre, sim.hostiles.filter(h => !h.dead && h.countsForObjective && !h.aligned));

    case OBJECTIVE.ALIGN:
      return nearest(centre, sim.civilians.filter(c => !c.dead && !c.aligned && !c.isAsset));

    case OBJECTIVE.DEMOLISH: {
      const target = sim.city.landmarks.find(
        l => !l.collapsed && (!obj.meta.name || l.name === obj.meta.name),
      );
      if (!target) return null;
      // Stand off a little; walking into the thing you're shooting is silly
      // and puts the squad inside its own impact effects.
      const a = Math.atan2(centre.x - target.x, centre.z - target.z);
      return { x: target.x + Math.sin(a) * 14, z: target.z + Math.cos(a) * 14, aim: target };
    }

    case OBJECTIVE.RETRIEVE:
      return nearest(centre, sim.assets.filter(a => !a.dead && !a.secured));

    case OBJECTIVE.EXTRACT:
      return sim.extraction ? { x: sim.extraction.x, z: sim.extraction.z } : null;

    default:
      return null;
  }
}

function nearest(from, candidates) {
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = dist(from.x, from.z, c.x, c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { x: best.x, z: best.z, ref: best } : null;
}

export { PHASE, STATUS, OBJECTIVE };
