// City block generation and spatial queries.
//
// Engine-agnostic: a city is plain data. The renderer reads it and builds
// meshes; the simulation reads it for collision, line of sight, and pathing.
// Everything lives on the XZ plane with +Y up.

import {
  makeRng, range, pick, clamp, segmentHitsBox, segmentHitsVolume, pushOutOfBox, dist,
} from './math.js';

export const CELL = 22;
export const STREET = 10;

/** Structure kinds. `tower` and `slab` are permanent; the rest can come down. */
export const STRUCT = Object.freeze({
  TOWER: 'tower',
  SLAB: 'slab',
  DEPOT: 'depot',
  KIOSK: 'kiosk',
  PYLON: 'pylon',
});

const PALETTES = {
  // Each syndicate's sector reads differently. Trim colour is the accent
  // that shows up on roofs, signage bands, and tier badges.
  openai: { base: 0x49546c, roof: 0x5c6884, trim: 0x6fe3d0 },
  google: { base: 0x454d68, roof: 0x596286, trim: 0x8fa4ff },
  amazon: { base: 0x554e44, roof: 0x6b6357, trim: 0xffab4a },
  spacex: { base: 0x4a4e57, roof: 0x5e636e, trim: 0xd8dee9 },
  anthropic: { base: 0x574c46, roof: 0x6c5f57, trim: 0xd9a066 },
  // Unclaimed ground. Nobody's brand, nobody's maintenance budget.
  none: { base: 0x44443f, roof: 0x53534c, trim: 0x6b6a5e },
};

export function paletteFor(syndicate) {
  return PALETTES[syndicate] ?? PALETTES.openai;
}

let nextStructureId = 1;

function makeStructure({
  x, z, w, d, h, kind, color, roof, trim, destructible, hp,
  occupancy = 0, spread = 1.14,
}) {
  return {
    id: nextStructureId++,
    kind,
    x, z, w, d, h,
    color, roof, trim,
    destructible: !!destructible,
    hp: hp ?? 0,
    maxHp: hp ?? 0,
    collapsed: false,
    /**
     * How many people are inside. This is the cost model for levelling a
     * block: a tower is not scenery with a health bar, it is ninety
     * Free-tier tenants, and dropping it kills every one of them. See
     * `collapseCasualties()` in `sim.js`.
     */
    occupancy,
    /** How far the rubble field spreads past the footprint on collapse. */
    spread,
    // Rubble keeps a footprint that blocks movement but not line of fire.
    rubbleHeight: 1.6,
  };
}

/**
 * Build a hand-authored-feeling city block from a seed.
 *
 * `spec` shapes the sector: which syndicate holds it, how tall it builds,
 * and where the plaza sits. Same seed always yields the same block.
 */
export function buildCity(spec = {}) {
  const {
    seed = 20410728,
    cols = 9,
    rows = 9,
    syndicate = 'google',
    density = 0.72,
    maxFloors = 9,
    // How thickly the street-cover layer fills open lots. A logistics
    // district wants clutter; a campus wants lawn.
    coverDensity = 1.6,
    // Fraction of street cover that starts already collapsed. A sector
    // nobody has maintained in years should look like one.
    derelict = 0,
    /**
     * People per unit of building volume. This is the dial that decides
     * what levelling a block costs: a residential sector is full at 3am
     * and a campus substructure eleven metres down is not. Zero means
     * genuinely empty, and a mission that sets it should mean it.
     */
    occupancyScale = 3,
    plaza = { col: 4, row: 4, w: 2, h: 2 },
  } = spec;

  const rng = makeRng(seed);
  const pal = paletteFor(syndicate);
  const pitch = CELL + STREET;
  // A full street runs around the outside too, so the block never dead-ends
  // into the void and the squad always has a perimeter road to work along.
  const width = cols * pitch + STREET;
  const depth = rows * pitch + STREET;
  const halfW = width / 2;
  const halfD = depth / 2;

  // Street centrelines. Cell c sits between street c and street c+1.
  const streetsX = [];
  const streetsZ = [];
  for (let i = 0; i <= cols; i++) streetsX.push(-halfW + STREET / 2 + i * pitch);
  for (let i = 0; i <= rows; i++) streetsZ.push(-halfD + STREET / 2 + i * pitch);

  const cellCenterX = c => -halfW + STREET + c * pitch + CELL / 2;
  const cellCenterZ = r => -halfD + STREET + r * pitch + CELL / 2;

  const structures = [];
  const openCells = [];

  const inPlaza = (c, r) =>
    c >= plaza.col && c < plaza.col + plaza.w && r >= plaza.row && r < plaza.row + plaza.h;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = cellCenterX(c);
      const cz = cellCenterZ(r);

      if (inPlaza(c, r)) {
        openCells.push({ x: cx, z: cz });
        continue;
      }
      if (rng() > density) {
        openCells.push({ x: cx, z: cz });
        continue;
      }

      // Edge cells build lower so the skyline reads as a bowl and the
      // camera can see into the block from any yaw.
      const edge = Math.min(c, r, cols - 1 - c, rows - 1 - r);
      const floors = clamp(Math.round(range(rng, 1, maxFloors) * (0.35 + edge * 0.28)), 1, maxFloors);
      const h = 3.4 + floors * 3.1;
      const w = CELL * range(rng, 0.62, 0.9);
      const d = CELL * range(rng, 0.62, 0.9);
      const kind = h > 16 ? STRUCT.TOWER : STRUCT.SLAB;

      // Towers are destructible, and expensive in every sense. Health
      // scales with the building so a nine-floor block is a decision and
      // not a burst of minigun fire, and occupancy scales with it too, so
      // the decision has people in it.
      const volume = (w * d * floors) / 100;
      structures.push(makeStructure({
        x: cx + range(rng, -1, 1),
        z: cz + range(rng, -1, 1),
        w, d, h,
        kind,
        color: pal.base,
        roof: pal.roof,
        trim: pal.trim,
        destructible: true,
        hp: Math.round(700 + volume * 220),
        occupancy: Math.max(1, Math.round(volume * occupancyScale)),
        // More to put down than a kiosk has, so the rubble reaches
        // further — which is what makes dropping one near the squad a
        // bad idea rather than a free wall-removal.
        spread: 1.3,
      }));
    }
  }

  // Street-level destructibles: the cover layer. These are what collapse,
  // so an empty lot should never be genuinely empty — it's a firefight
  // waiting to happen and it needs something to fight over.
  const coverCount = Math.round(openCells.length * coverDensity) + 6;
  for (let i = 0; i < coverCount; i++) {
    const cell = pick(rng, openCells);
    const kind = rng() < 0.4 ? STRUCT.DEPOT : STRUCT.KIOSK;
    const big = kind === STRUCT.DEPOT;
    structures.push(makeStructure({
      x: cell.x + range(rng, -CELL * 0.3, CELL * 0.3),
      z: cell.z + range(rng, -CELL * 0.3, CELL * 0.3),
      w: big ? range(rng, 7, 11) : range(rng, 3.4, 5.2),
      d: big ? range(rng, 7, 11) : range(rng, 3.4, 5.2),
      h: big ? range(rng, 5, 7.5) : range(rng, 3, 4.2),
      kind,
      color: big ? pal.roof : pal.base,
      roof: pal.trim,
      trim: pal.trim,
      destructible: true,
      hp: big ? 260 : 140,
      occupancy: big ? 1 : 0,
    }));
  }

  if (derelict > 0) {
    // Street cover only. Towers became destructible when full building
    // destruction landed, and a derelict dial that also drops nine-floor
    // blocks at generation time is a different feature — it would rewrite
    // the skyline of every sector that sets it, and Gradient Relay 4 sets
    // it. Rubble on the street is what "nobody has maintained this in
    // years" is supposed to mean.
    for (const s of structures) {
      if (!s.destructible) continue;
      if (s.kind !== STRUCT.KIOSK && s.kind !== STRUCT.DEPOT) continue;
      if (rng() < derelict) damageStructure(s, s.hp);   // graph is built after
    }
  }

  const city = {
    seed,
    syndicate,
    palette: pal,
    cols,
    rows,
    pitch,
    width,
    depth,
    halfW,
    halfD,
    streetsX,
    streetsZ,
    structures,
    openCells,
    // Deploy on a street intersection one block in from the south edge, so
    // the squad starts inside the city with cover on every side — not
    // pressed against the map boundary staring at a wall.
    deploy: {
      x: streetsX[Math.floor(cols / 2)],
      z: streetsZ[Math.max(0, rows - 1)],
    },
  };

  city.landmarks = [];
  return city;
}

/**
 * Drop a named landmark into the city — a mission-critical destructible.
 * Placed on the open cell nearest the requested position.
 */
export function addLandmark(city, { name, near = { x: 0, z: 0 }, hp = 520, height = 22, syndicateTrim }) {
  let best = city.openCells[0];
  let bestD = Infinity;
  for (const cell of city.openCells) {
    const d = dist(cell.x, cell.z, near.x, near.z);
    if (d < bestD) { bestD = d; best = cell; }
  }
  const st = makeStructure({
    x: best.x,
    z: best.z,
    w: 6.5,
    d: 6.5,
    h: height,
    kind: STRUCT.PYLON,
    color: 0x1e2129,
    roof: syndicateTrim ?? city.palette.trim,
    trim: syndicateTrim ?? city.palette.trim,
    destructible: true,
    hp,
  });
  st.name = name;
  st.landmark = true;

  // Clear street cover out of the landmark's footprint so it reads as a
  // deliberate structure rather than a pile that happened to grow together.
  city.structures = city.structures.filter(
    s => !(s.destructible && !s.landmark && dist(s.x, s.z, st.x, st.z) < 11),
  );

  city.structures.push(st);
  city.landmarks.push(st);
  return st;
}

/**
 * Which structures stand between two points in space.
 *
 * The camera is the one thing in this game that can be *wrong* about the
 * world. Everything else — cover, line of sight, pathing — describes what
 * is actually true on the street. The camera describes what the player can
 * see, and when it drifts behind a tower the squad vanishes without
 * anything having happened to them. `src/render` fades whatever this
 * returns; the geometry is here because it is geometry, and because that
 * makes it testable in Node like everything else.
 *
 * Deliberately three-dimensional. A flat footprint test would fade every
 * building the squad happened to be standing behind, including the ones
 * the camera is comfortably looking over — which is most of them, since it
 * sits twenty-odd metres up.
 */
export function occludersBetween(city, from, to, { minHeight = 2 } = {}) {
  const out = [];
  for (const s of city.structures) {
    // Rubble is 1.6m of slumped concrete. It does not hide anybody, and
    // fading it would flicker the whole street every time something fell.
    if (s.collapsed || s.h < minHeight) continue;
    if (segmentHitsVolume(from, to, s)) out.push(s);
  }
  return out;
}

/** Structures that still stand at full height (block movement AND sight). */
export function standing(city) {
  return city.structures.filter(s => !s.collapsed);
}

export function isBlocked(city, x, z, radius) {
  for (const s of city.structures) {
    const minX = s.x - s.w / 2 - radius;
    const maxX = s.x + s.w / 2 + radius;
    const minZ = s.z - s.d / 2 - radius;
    const maxZ = s.z + s.d / 2 + radius;
    if (x > minX && x < maxX && z > minZ && z < maxZ) return true;
  }
  return false;
}

/** Slide a circle out of every structure it overlaps. Mutates {x,z} in place. */
export function resolveCollision(city, ent) {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const s of city.structures) {
      const fix = pushOutOfBox(ent.x, ent.z, ent.radius, s);
      if (fix) { ent.x = fix.x; ent.z = fix.z; moved = true; }
    }
    if (!moved) break;
  }
  ent.x = clamp(ent.x, -city.halfW + 1, city.halfW - 1);
  ent.z = clamp(ent.z, -city.halfD + 1, city.halfD - 1);
}

/**
 * Line of sight. Collapsed structures do NOT block — that is the whole
 * point of the collapse-to-cover mechanic: knock a depot down and you can
 * suddenly shoot across a street you couldn't before.
 */
export function hasLineOfSight(city, ax, az, bx, bz) {
  for (const s of city.structures) {
    if (s.collapsed) continue;
    if (segmentHitsBox(ax, az, bx, bz, s)) return false;
  }
  return true;
}

/** First standing structure a shot would hit, or null. */
export function structureInPath(city, ax, az, bx, bz) {
  let best = null;
  let bestD = Infinity;
  for (const s of city.structures) {
    if (s.collapsed) continue;
    if (!segmentHitsBox(ax, az, bx, bz, s)) continue;
    const d = dist(ax, az, s.x, s.z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** A random point on open street, at least `pad` from any structure. */
export function randomStreetPoint(city, rng, pad = 1.6) {
  for (let i = 0; i < 60; i++) {
    const x = (rng() * 2 - 1) * (city.halfW - 4);
    const z = (rng() * 2 - 1) * (city.halfD - 4);
    if (!isBlocked(city, x, z, pad)) return { x, z };
  }
  return { x: 0, z: city.halfD - STREET };
}

/** How much protection cover gives. Never total — cover is not immunity. */
export const COVER = Object.freeze({
  HARD: 0.55,   // flank pressed against a standing facade
  RUBBLE: 0.4,  // crouched behind a collapsed structure
  NONE: 0,
});

/**
 * How far from a target we look for something to shelter behind.
 *
 * Collision holds an actor ~1.15m off a facade, so this is really a band:
 * at 2.0 it was 0.85m wide and you had to nudge into it, at 2.8 it is
 * 1.65m and "press against that wall" is something you can do on purpose.
 * Still directional — a wide band along a street does nothing about fire
 * crossing it.
 */
const COVER_REACH = 2.8;

const inside = (s, x, z) =>
  x >= s.x - s.w / 2 && x <= s.x + s.w / 2 && z >= s.z - s.d / 2 && z <= s.z + s.d / 2;

/**
 * Cover the target has *against a shot from this direction*.
 *
 * Two distinct cases, because a standing building and its rubble protect
 * you in completely different ways:
 *
 * 1. **Rubble between you and the shooter.** Collapsed structures no longer
 *    block line of sight, so the round arrives — but it arrives over a pile
 *    of masonry you are crouched behind. This is what completes
 *    collapse-to-cover: bringing a building down opens the firing lane AND
 *    leaves cover sitting in it, exactly like the PS1 game.
 *
 * 2. **A standing wall along your flank.** Sampled *perpendicular* to the
 *    incoming shot, not between — because anything between you and the
 *    shooter has already blocked the round outright, so testing there
 *    could never affect a shot that connects.
 *
 *    This is what makes position matter. Pressed against a north wall, you
 *    are sheltered from the east and west, squarely exposed from the south,
 *    and simply cannot be hit from the north. Flanking is the answer, and
 *    standing in the open is a mistake.
 */
export function coverAgainst(city, targetX, targetZ, fromX, fromZ) {
  const toShooter = Math.atan2(fromX - targetX, fromZ - targetZ);

  // 1. Low cover directly in the line of fire.
  const bx = targetX + Math.sin(toShooter) * COVER_REACH;
  const bz = targetZ + Math.cos(toShooter) * COVER_REACH;

  // 2. Flank cover, perpendicular to the line of fire.
  const side = toShooter + Math.PI / 2;
  const lx = Math.sin(side) * COVER_REACH;
  const lz = Math.cos(side) * COVER_REACH;

  let best = COVER.NONE;
  for (const s of city.structures) {
    if (s.collapsed) {
      if (inside(s, bx, bz) && COVER.RUBBLE > best) best = COVER.RUBBLE;
      continue;
    }
    if (COVER.HARD <= best) continue;
    if (inside(s, targetX + lx, targetZ + lz) || inside(s, targetX - lx, targetZ - lz)) {
      best = COVER.HARD;
    }
  }
  return best;
}

/**
 * Damage a destructible. Returns true on the frame it collapses.
 *
 * Pass the owning `city` so the collapse can bump its revision — the
 * navigation graph is cached against it, and a route computed before a
 * collapse would otherwise walk through the rubble field afterwards.
 */
export function damageStructure(structure, amount, city = null) {
  if (!structure.destructible || structure.collapsed) return false;
  structure.hp -= amount;
  if (structure.hp > 0) return false;
  structure.hp = 0;
  structure.collapsed = true;
  // Rubble keeps roughly the footprint but slumps outward and low. A
  // tower spreads further than a kiosk — it has more to put down.
  const spread = structure.spread ?? 1.14;
  structure.w *= spread;
  structure.d *= spread;
  structure.h = structure.rubbleHeight;
  if (city) city.collapses = (city.collapses ?? 0) + 1;
  return true;
}
