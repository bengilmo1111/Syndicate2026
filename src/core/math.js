// Pure math helpers. No engine, no DOM.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
export const dist2 = (ax, az, bx, bz) => (bx - ax) ** 2 + (bz - az) ** 2;

/** Shortest signed angular difference, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Mulberry32 — small deterministic PRNG. City layouts and crowd placement
 * must be reproducible so a mission plays the same way twice.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const range = (rng, lo, hi) => lo + rng() * (hi - lo);

/**
 * Segment (ax,az)->(bx,bz) against an axis-aligned box footprint.
 * Slab method on the XZ plane. Used for line-of-sight and projectile blocking.
 */
export function segmentHitsBox(ax, az, bx, bz, box) {
  const dx = bx - ax;
  const dz = bz - az;
  const minX = box.x - box.w / 2;
  const maxX = box.x + box.w / 2;
  const minZ = box.z - box.d / 2;
  const maxZ = box.z + box.d / 2;

  let t0 = 0;
  let t1 = 1;

  for (const [origin, delta, lo, hi] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    let tNear = (lo - origin) / delta;
    let tFar = (hi - origin) / delta;
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear];
    t0 = Math.max(t0, tNear);
    t1 = Math.min(t1, tFar);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The same slab method, in three dimensions.
 *
 * Everything else in this game reasons on the XZ plane, because everything
 * else is a person or a bullet and both of those live on the street. The
 * camera does not: it sits twenty-odd metres up and looks down, so whether
 * a building is between it and your squad is a question about height as
 * much as about footprint. A flat test would fade every building the
 * squad happened to be standing behind on the map, including the ones the
 * camera is comfortably looking over.
 *
 * `from` and `to` are `{ x, y, z }`. The box is a structure: centred on
 * `x, z`, `w × d` on the ground, standing from y=0 to y=h.
 */
export function segmentHitsVolume(from, to, box) {
  const lo = [box.x - box.w / 2, 0, box.z - box.d / 2];
  const hi = [box.x + box.w / 2, box.h, box.z + box.d / 2];
  const a = [from.x, from.y, from.z];
  const b = [to.x, to.y, to.z];

  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const delta = b[i] - a[i];
    if (Math.abs(delta) < 1e-8) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false;
      continue;
    }
    let tNear = (lo[i] - a[i]) / delta;
    let tFar = (hi[i] - a[i]) / delta;
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear];
    t0 = Math.max(t0, tNear);
    t1 = Math.min(t1, tFar);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Closest distance from point P to segment AB.
 *
 * Needed because a projectile moving 78 m/s covers 1.3m in a frame while
 * an agent's hit disc is 1.5m across — testing only the endpoint lets
 * fast rounds tunnel straight through the person they hit.
 */
export function segmentPointDistance(ax, az, bx, bz, px, pz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Push a circle out of an axis-aligned box. Returns {x, z} corrected position. */
export function pushOutOfBox(x, z, radius, box) {
  const minX = box.x - box.w / 2 - radius;
  const maxX = box.x + box.w / 2 + radius;
  const minZ = box.z - box.d / 2 - radius;
  const maxZ = box.z + box.d / 2 + radius;
  if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return null;

  const penLeft = x - minX;
  const penRight = maxX - x;
  const penUp = z - minZ;
  const penDown = maxZ - z;
  const min = Math.min(penLeft, penRight, penUp, penDown);
  if (min === penLeft) return { x: minX, z };
  if (min === penRight) return { x: maxX, z };
  if (min === penUp) return { x, z: minZ };
  return { x, z: maxZ };
}
