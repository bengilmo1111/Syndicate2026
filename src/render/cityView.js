// Builds meshes for a city and keeps them in sync with the simulation.
// The sim owns structure state; this module only reads it.

import * as THREE from '../../vendor/three.module.min.js';
import { solid, glow, facade } from './ps1.js';
import { STRUCT, CELL, STREET } from '../core/city.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

export class CityView {
  constructor(city) {
    this.city = city;
    this.root = new THREE.Group();
    this.byId = new Map();
    this.materials = [];

    this.root.add(this.buildGround());
    this.root.add(this.buildStreetGrid());
    this.root.add(this.buildSidewalks());

    for (const s of city.structures) this.root.add(this.buildStructure(s));
  }

  buildGround() {
    const group = new THREE.Group();

    // Roadway under the block itself — lighter, so streets read as streets.
    const roadMat = solid(0x191c26);
    this.materials.push(roadMat);
    const road = new THREE.Mesh(BOX, roadMat);
    road.scale.set(this.city.width, 0.1, this.city.depth);
    road.position.y = -0.05;
    group.add(road);

    // Everything past the block edge falls away into fog.
    const outerMat = solid(0x0e1017);
    this.materials.push(outerMat);
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(this.city.width + 420, this.city.depth + 420, 1, 1),
      outerMat,
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.12;
    group.add(outer);

    return group;
  }

  /**
   * Centre lines down every avenue. Cheap, and they give the vertex jitter
   * something to shimmer against — the wobble is invisible on blank asphalt.
   */
  buildStreetGrid() {
    const group = new THREE.Group();
    const mat = glow(0x2f3a55);
    this.materials.push(mat);

    for (const x of this.city.streetsX) {
      const strip = new THREE.Mesh(BOX, mat);
      strip.scale.set(0.5, 0.06, this.city.depth);
      strip.position.set(x, 0.04, 0);
      group.add(strip);
    }
    for (const z of this.city.streetsZ) {
      const strip = new THREE.Mesh(BOX, mat);
      strip.scale.set(this.city.width, 0.06, 0.5);
      strip.position.set(0, 0.04, z);
      group.add(strip);
    }
    return group;
  }

  /** A raised kerb around every cell. Gives the streets edges to read against. */
  buildSidewalks() {
    const group = new THREE.Group();
    const mat = solid(0x363c4d);
    this.materials.push(mat);

    for (let c = 0; c < this.city.cols; c++) {
      for (let r = 0; r < this.city.rows; r++) {
        const x = -this.city.halfW + STREET + c * this.city.pitch + CELL / 2;
        const z = -this.city.halfD + STREET + r * this.city.pitch + CELL / 2;
        const kerb = new THREE.Mesh(BOX, mat);
        kerb.scale.set(CELL + 2, 0.7, CELL + 2);
        kerb.position.set(x, 0.3, z);
        group.add(kerb);
      }
    }
    return group;
  }

  buildStructure(s) {
    const group = new THREE.Group();
    group.position.set(s.x, 0, s.z);

    // Only real buildings get windows; street cover and pylons are solid.
    const bodyMat = (s.kind === STRUCT.TOWER || s.kind === STRUCT.SLAB)
      ? facade(s.color, s.w, s.h)
      : solid(s.color);
    this.materials.push(bodyMat);
    const body = new THREE.Mesh(BOX, bodyMat);
    body.scale.set(s.w, s.h, s.d);
    body.position.y = s.h / 2;
    group.add(body);

    // Roof cap, slightly inset — reads as a parapet at low resolution.
    const roofMat = solid(s.roof);
    this.materials.push(roofMat);
    const roof = new THREE.Mesh(BOX, roofMat);
    roof.scale.set(s.w * 1.02, 0.5, s.d * 1.02);
    roof.position.y = s.h;
    group.add(roof);

    // Trim band: the syndicate accent. On landmarks it runs the full height.
    const trimMat = glow(s.trim);
    this.materials.push(trimMat);
    const trim = new THREE.Mesh(BOX, trimMat);
    if (s.kind === STRUCT.PYLON) {
      trim.scale.set(s.w * 0.22, s.h * 0.94, s.d * 0.22);
      trim.position.y = s.h / 2;
    } else {
      trim.scale.set(s.w * 1.005, 0.32, s.d * 1.005);
      trim.position.y = Math.min(s.h - 0.6, s.h * 0.82);
    }
    group.add(trim);

    const view = {
      group, body, roof, trim, bodyMat, roofMat, trimMat,
      collapsedApplied: false, struct: s,
      /** 1 = solid. Driven by `syncOcclusion` below. */
      opacity: 1,
    };
    this.byId.set(s.id, view);
    return group;
  }

  /** Reconcile visuals after the sim collapses something. */
  syncStructures() {
    for (const s of this.city.structures) {
      const v = this.byId.get(s.id);
      if (!v || !s.collapsed || v.collapsedApplied) continue;
      v.collapsedApplied = true;

      // The building becomes a rubble field: low, wide, slumped, and it no
      // longer blocks line of sight. Cover you can shoot over.
      v.body.scale.set(s.w, s.h, s.d);
      v.body.position.y = s.h / 2;
      v.body.rotation.set(0.06, 0.4, -0.05);
      v.bodyMat.color.setHex(0x2a2622);
      // Windows go out when the building does.
      if (v.bodyMat.emissiveMap) {
        v.bodyMat.emissiveMap = null;
        v.bodyMat.needsUpdate = true;
      }
      v.bodyMat.emissive?.setHex(0x000000);

      v.roof.visible = false;

      // A bent slab lying in the heap, not a coat of paint over it.
      //
      // The trim used to be 62% of the footprint, which reads as debris on
      // a kiosk and as a large orange floor tile on a twenty-metre tower.
      // Cap it, and push it off-centre by an amount derived from the
      // structure id so the field is deterministic and no two collapses in
      // a row look stamped from the same template.
      const cap = Math.min(7, s.w * 0.62);
      const capD = Math.min(7, s.d * 0.62);
      const jitter = ((s.id * 2654435761) >>> 0) / 4294967296;
      v.trim.scale.set(cap, 0.22, capD);
      // Local to the group, which is already positioned at the structure.
      v.trim.position.set(
        (jitter - 0.5) * (s.w - cap) * 0.7,
        s.h + 0.15,
        (((jitter * 7) % 1) - 0.5) * (s.d - capD) * 0.7,
      );
      v.trim.rotation.set(0.12, 0.6 + jitter * 2.4, -0.09);
      v.trimMat.color.setHex(0x8a4a1c);
    }
  }

  /**
   * Ghost whatever is standing between the camera and the squad.
   *
   * The camera rig is constrained precisely so this would not be needed —
   * you look down at the streets, you never fly through them — and for a
   * long time that was true enough. It stopped being true when towers
   * became destructible and started reaching thirty metres: at the lowest
   * pitch the camera sits below the roofline, and a block on the near side
   * of the squad takes the whole squad off screen.
   *
   * Faded rather than hidden, because the building is still cover, still
   * shootable and still a thing you might drop on somebody. Removing it
   * would lie about the world in the opposite direction.
   *
   * Eased rather than switched: a hard toggle pops a nine-floor block in
   * and out of existence every time the camera drifts a degree, which is
   * more distracting than the occlusion was. Out fast, back in gently —
   * losing sight of the squad is urgent, getting a wall back is not.
   */
  syncOcclusion(occluded, dt) {
    for (const v of this.byId.values()) {
      const want = occluded.has(v.struct.id) ? OCCLUDED_OPACITY : 1;
      if (v.opacity === want) continue;
      const rate = (want < v.opacity ? FADE_OUT : FADE_IN) * dt;
      const gap = want - v.opacity;
      v.opacity += Math.sign(gap) * Math.min(rate, Math.abs(gap));
      applyOpacity(v);
    }
  }

  /** Structures the sim can still damage, for aim-assist highlighting. */
  viewFor(structure) {
    return this.byId.get(structure.id) ?? null;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.root.clear();
    this.byId.clear();
  }
}

/** How much of an occluding building is left. Enough to read as a shape. */
const OCCLUDED_OPACITY = 0.16;
/** Per second. Losing the squad is urgent; getting a wall back is not. */
const FADE_OUT = 7;
const FADE_IN = 2.4;

function applyOpacity(v) {
  const solidNow = v.opacity >= 1;
  for (const m of [v.bodyMat, v.roofMat, v.trimMat]) {
    m.opacity = v.opacity;
    m.transparent = !solidNow;
    // Without this the ghost still writes depth and the agents behind it
    // are culled — a transparent building that hides the squad anyway.
    m.depthWrite = solidNow;
    m.needsUpdate = true;
  }
}

export { STREET };
