// Street-grid navigation.
//
// The city is a regular grid of avenues, so we don't need a navmesh — the
// street intersections *are* the graph. Nodes sit at every crossing;
// edges run along the streets between them. A* over that is enough to
// route a squad across a block without walking into a wall, and it costs
// nothing to build.
//
// Collapsed structures still block movement (rubble is cover you climb
// around, not through), so unlike line of sight, navigation cares about
// every structure regardless of state.

import { segmentHitsBox, dist } from './math.js';

/** Does a circle of `radius` sweeping from A to B clip any structure? */
export function movementBlocked(city, ax, az, bx, bz, radius = 1.2) {
  for (const s of city.structures) {
    if (segmentHitsBox(ax, az, bx, bz, {
      x: s.x, z: s.z, w: s.w + radius * 2, d: s.d + radius * 2,
    })) return true;
  }
  return false;
}

/**
 * Build (and cache) the intersection graph. Invalidated by collapses,
 * since rubble can close a street that used to be open.
 */
function navGrid(city, radius) {
  // Stamped on collapses, not on the structure count — collapsing does
  // not add or remove a structure, it widens one by 14% and drops it to
  // rubble height. Stamping on `structures.length` meant the comment
  // above was a lie and a route computed before a collapse could path
  // straight through the new footprint. It has not bitten yet only
  // because street cover is small; a tower's rubble field is not.
  const stamp = `${city.structures.length}:${city.collapses ?? 0}`;
  if (city._nav && city._nav.stamp === stamp && city._nav.radius === radius) {
    return city._nav;
  }

  const cols = city.streetsX.length;
  const rows = city.streetsZ.length;
  const nodes = [];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = city.streetsX[i];
      const z = city.streetsZ[j];
      nodes.push({
        i, j, x, z,
        // An intersection with a kiosk dumped in it is not a waypoint.
        open: !movementBlocked(city, x, z, x, z, radius),
        edges: null,
      });
    }
  }

  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? null : nodes[j * cols + i]);

  for (const n of nodes) {
    n.edges = [];
    if (!n.open) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = at(n.i + di, n.j + dj);
      if (!m || !m.open) continue;
      if (movementBlocked(city, n.x, n.z, m.x, m.z, radius)) continue;
      n.edges.push(m);
    }
  }

  city._nav = { stamp, radius, cols, rows, nodes };
  return city._nav;
}

/** Nearest open node that the point can actually reach in a straight line. */
function anchorNode(city, grid, x, z, radius) {
  let best = null;
  let bestD = Infinity;
  let fallback = null;
  let fallbackD = Infinity;

  for (const n of grid.nodes) {
    if (!n.open) continue;
    const d = dist(x, z, n.x, n.z);
    if (d < fallbackD) { fallbackD = d; fallback = n; }
    if (d >= bestD) continue;
    if (movementBlocked(city, x, z, n.x, n.z, radius)) continue;
    bestD = d;
    best = n;
  }
  return best ?? fallback;
}

/**
 * Waypoints from `from` to `to`, exclusive of the start.
 * Always returns at least `[to]` — a caller that can't path there should
 * still try, and slide along whatever it hits.
 */
export function findPath(city, from, to, radius = 1.2) {
  // The common case: nothing in the way, so don't build a route.
  if (!movementBlocked(city, from.x, from.z, to.x, to.z, radius)) {
    return [{ x: to.x, z: to.z }];
  }

  const grid = navGrid(city, radius);
  const start = anchorNode(city, grid, from.x, from.z, radius);
  const goal = anchorNode(city, grid, to.x, to.z, radius);
  if (!start || !goal) return [{ x: to.x, z: to.z }];
  if (start === goal) return [{ x: start.x, z: start.z }, { x: to.x, z: to.z }];

  const h = n => dist(n.x, n.z, goal.x, goal.z);
  const g = new Map([[start, 0]]);
  const cameFrom = new Map();
  const open = [start];
  const f = new Map([[start, h(start)]]);
  const closed = new Set();

  while (open.length) {
    // Small graphs — a linear scan beats the constant factor of a heap.
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (f.get(open[i]) < f.get(open[bi])) bi = i;
    }
    const current = open.splice(bi, 1)[0];
    if (current === goal) break;
    closed.add(current);

    for (const next of current.edges) {
      if (closed.has(next)) continue;
      const tentative = g.get(current) + dist(current.x, current.z, next.x, next.z);
      if (tentative >= (g.get(next) ?? Infinity)) continue;
      cameFrom.set(next, current);
      g.set(next, tentative);
      f.set(next, tentative + h(next));
      if (!open.includes(next)) open.push(next);
    }
  }

  if (!cameFrom.has(goal) && goal !== start) return [{ x: to.x, z: to.z }];

  const route = [];
  let node = goal;
  while (node && node !== start) {
    route.unshift({ x: node.x, z: node.z });
    node = cameFrom.get(node);
  }
  route.unshift({ x: start.x, z: start.z });

  // Trim leading waypoints we can already see past — stops the squad
  // walking backwards to an intersection it has already cleared.
  while (route.length > 1 && !movementBlocked(city, from.x, from.z, route[1].x, route[1].z, radius)) {
    route.shift();
  }

  route.push({ x: to.x, z: to.z });
  return route;
}
