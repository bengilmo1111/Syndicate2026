// Following somebody through a city, rather than at them.
//
// Agents have routed properly since `nav.js` shipped. Everybody who
// *follows* an agent did not: aligned civilians, turned operatives and
// escorted assets all pointed themselves at the squad centroid and walked,
// which works right up until a building is in the way — and then they
// press into the facade and slide along it, and the escort mission the
// whole of Act I·3 is built on turns into shepherding somebody around a
// corner they cannot see.
//
// The fix is the pathfinder that already exists, used sparingly. A
// follower walks straight at the person they are following whenever they
// can see them, and only asks `findPath` when they cannot.
//
// How often that is depends entirely on who is following. A single
// escorted asset a few metres behind the squad almost always has a clear
// line; a crowd of thirty aligned civilians spread across a block does
// not — measured, four in five of them are holding a route at any given
// instant. That is the case this exists for, so the gating below is not
// an optimisation for a rare path, it is what keeps the common one
// affordable.
//
// Pure core: no Three.js, no DOM.

import { dist } from './math.js';
import { hasLineOfSight, resolveCollision } from './city.js';
import { findPath } from './nav.js';

/**
 * Seconds between route rebuilds while the way is blocked.
 *
 * A\* over the street graph is cheap but not free, and a crowd of thirty
 * aligned civilians asking for one every frame is thirty searches a
 * frame. At this interval a follower is at most a second behind a squad
 * that changed its mind, which is what following looks like anyway.
 */
export const REPATH_AFTER = 1.1;

/** How far the person being followed may drift before the route is stale. */
export const REPATH_MOVED = 7;

/** Close enough to a waypoint to take the next one. */
export const ARRIVE = 1.4;

/**
 * Walk one step toward `goal`, around whatever is in the way.
 *
 * Returns true if a route was used — the tests read it, and it is the
 * only way to tell the two behaviours apart from outside, since both of
 * them just move the actor.
 */
export function follow(actor, dt, city, goal, speed) {
  // The common case, and deliberately checked first: the squad walks
  // streets, so most of the time the way to somebody is a straight line
  // and no search is worth doing.
  if (hasLineOfSight(city, actor.x, actor.z, goal.x, goal.z)) {
    actor.route = null;
    actor.routeGoal = null;
    walk(actor, dt, city, goal, speed);
    return false;
  }

  actor.repathIn = (actor.repathIn ?? 0) - dt;
  const stale = !actor.routeGoal
    || dist(actor.routeGoal.x, actor.routeGoal.z, goal.x, goal.z) > REPATH_MOVED;
  if (!actor.route?.length || actor.repathIn <= 0 || stale) {
    actor.route = findPath(city, actor, goal, actor.radius);
    actor.routeGoal = { x: goal.x, z: goal.z };
    actor.repathIn = REPATH_AFTER;
  }

  // Waypoints get consumed as they are reached; the last one is the goal
  // itself, so a follower that runs out of route has arrived.
  while (actor.route.length
    && dist(actor.x, actor.z, actor.route[0].x, actor.route[0].z) < ARRIVE) {
    actor.route.shift();
  }
  const next = actor.route[0] ?? goal;
  walk(actor, dt, city, next, speed);
  return true;
}

function walk(actor, dt, city, to, speed) {
  actor.turnToward(to.x, to.z, dt, 9);
  actor.x += Math.sin(actor.facing) * speed * dt;
  actor.z += Math.cos(actor.facing) * speed * dt;
  resolveCollision(city, actor);
}
