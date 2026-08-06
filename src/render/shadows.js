// Blob shadows.
//
// Nothing in this game casts one, and without them everybody floats: at a
// 45° camera over a flat street, a box standing on the ground and a box
// hovering a metre above it are the same picture. A dark disc under each
// actor is the cheapest possible fix and it is what every game of the era
// this one is imitating actually did — real shadow maps were a decade
// away and would cost more than the entire rest of the frame here.
//
// One `InstancedMesh` for everything on the map, rewritten each frame.
// Eighty actors cost one draw call.

import * as THREE from '../../vendor/three.module.min.js';
import { glow } from './ps1.js';

/**
 * A quad carrying a soft round blot, rather than a ten-sided disc.
 *
 * The disc came first and it was wrong twice over: a hard rim reads as a
 * painted marking rather than as shade, and at this camera the ten sides
 * are visible as a stop sign. The texture costs one 64×64 canvas for the
 * whole game.
 */
const QUAD = new THREE.PlaneGeometry(2, 2);

function blotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Flat through the middle and then a fast falloff: a shadow with a long
  // gradient looks like fog on the road, and one with none looks like a
  // hole in it.
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.92)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Just above the roadway.
 *
 * Actors stand at y=0 everywhere, including on top of the decorative kerbs,
 * so their shadows belong at street level too. Matching the kerb height
 * would put a shadow above feet that are still down here.
 */
const HEIGHT = 0.06;

/** Hard cap. A block never has this many bodies on it at once. */
const MAX = 260;

/** A body on its feet, a body on the floor, a car. */
const R_AGENT = 1.25;
const R_HOSTILE = 1.15;
const R_CIVILIAN = 1.0;
const R_FALLEN = 1.7;
const R_VEHICLE = 2.6;

export class ShadowLayer {
  constructor(scene) {
    // `glow`, not `solid`: a shadow that takes the scene lighting brightens
    // when a strike goes off overhead, which is backwards. Fog still
    // applies, so distant shadows fade with the block they are on.
    //
    // Near-black and nearly opaque, which sounds far too heavy and is not:
    // this street is already dark, and the first version of this file —
    // 0x05070c at 0.42, the value a daylit game would use — was measurably
    // invisible. Two screenshots of the same frame with the layer on and
    // off were the same picture. There is only so much room below asphalt
    // this colour, and a contact shadow has to use all of it.
    this.mat = glow(0x000000, {
      map: blotTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(QUAD, this.mat, MAX);
    // The pool is rewritten every frame from scratch, so three has no way
    // to know the bounds it computed are still true.
    this.mesh.frustumCulled = false;
    // Draw after the road so the blend lands on painted asphalt, and
    // before the actors so nothing shades a shin.
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.m = new THREE.Matrix4();
    this.scale = new THREE.Vector3();
  }

  /**
   * @param sim  the simulation, for everything standing on the block
   */
  sync(sim) {
    let n = 0;
    const put = (x, z, r) => {
      if (n >= MAX) return;
      // T · Rx(-90°) · S. The disc is authored in the XY plane, so it has
      // to be laid down before it is placed.
      this.m.makeRotationX(-Math.PI / 2);
      this.m.scale(this.scale.set(r, r, 1));
      this.m.setPosition(x, HEIGHT, z);
      this.mesh.setMatrixAt(n++, this.m);
    };

    for (const a of sim.squad.agents) {
      if (a.dead) continue;
      put(a.x, a.z, R_AGENT);
    }
    for (const h of sim.hostiles) {
      if (h.dead) continue;
      // A sedated hostile is lying across the pavement, not standing on a
      // patch of it, and the shadow is how you tell from up here.
      put(h.x, h.z, h.downed ? R_FALLEN : R_HOSTILE);
    }
    for (const c of sim.civilians) {
      if (c.dead) continue;
      put(c.x, c.z, R_CIVILIAN);
    }
    // A car's shadow is the one that really sells it — a vehicle with no
    // shadow reads as a sprite sliding over the road rather than a thing
    // on it. A wreck keeps its own: it is still sitting there.
    for (const v of sim.traffic ?? []) put(v.x, v.z, R_VEHICLE);

    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
