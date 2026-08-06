// Builds meshes for a city and keeps them in sync with the simulation.
// The sim owns structure state; this module only reads it.

import * as THREE from '../../vendor/three.module.min.js';
import { solid, glow, facade, roadTexture, WINDOW_PATTERN_COUNT } from './ps1.js';
import { STRUCT, CELL, STREET } from '../core/city.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * A stable 0..1 from an integer.
 *
 * Everything decorative in this file is placed by hashing a structure id
 * rather than by rolling dice, for the same reason the collapse debris is:
 * a block that reshuffles its own rooftops every time you load it is a
 * different bug from a block that looks boring.
 */
function hash01(n, salt = 0) {
  const h = Math.imul((n ^ salt) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  return h / 4294967296;
}

export class CityView {
  constructor(city) {
    this.city = city;
    this.root = new THREE.Group();
    this.byId = new Map();
    this.materials = [];

    // Where the street lights stand. Computed first: the road texture
    // paints their pools, and the posts are placed on the same points.
    this.lamps = this.lampSpots();

    this.root.add(this.buildGround());
    this.root.add(this.buildSidewalks());

    for (const s of city.structures) this.root.add(this.buildStructure(s));

    // Decoration, after the buildings, because both read off them.
    this.root.add(this.buildRooftops());
    this.root.add(this.buildStreetLights());
  }

  /**
   * Lamps, on alternate intersections, kicked off the centreline onto a kerb.
   *
   * Every junction is both too many and too regular: it costs a couple of
   * frames per second under software rasterisation for a grid so even it
   * reads as graph paper. A checkerboard is half the geometry and looks
   * more like a city that was wired up over forty years.
   */
  lampSpots() {
    const out = [];
    const off = STREET * 0.36;
    this.city.streetsX.forEach((x, cx) => {
      this.city.streetsZ.forEach((z, cz) => {
        if ((cx + cz) % 2) return;
        const i = cx * 31 + cz;
        out.push({
          x: x + (hash01(i, 11) < 0.5 ? -off : off),
          z: z + (hash01(i, 29) < 0.5 ? -off : off),
        });
      });
    });
    return out;
  }

  buildGround() {
    const group = new THREE.Group();

    // Roadway under the block itself. Everything painted on it — lane
    // dashes, crossings, the pools under the lamps — is in this one
    // texture rather than in geometry: see `roadTexture` in `ps1.js` for
    // why that is a frame-rate decision as much as a look.
    const roadMat = solid(0xffffff, { map: roadTexture(this.city, this.lamps) });
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

  /**
   * Rooftop clutter: plant, tanks, stair heads.
   *
   * A skyline is silhouette, and a skyline made of plain boxes reads as a
   * bar chart. Three or four small blocks on top of each tower is the
   * cheapest possible fix and it is most of the difference between "a
   * rendering of a city" and "a city".
   *
   * One `InstancedMesh` for the whole block, so a hundred towers of clutter
   * cost one draw call. They are decoration only — nothing in the sim knows
   * they exist, so they are never in the way of anything.
   */
  buildRooftops() {
    // Towers only — `STRUCT.TOWER` is already the h > 16 band, and clutter
    // on a four-metre kiosk is invisible from any camera angle the rig
    // allows.
    const towers = this.city.structures.filter(
      s => s.kind === STRUCT.TOWER && !s.collapsed,
    );
    const per = 3;
    const mat = solid(0x2f3541);
    this.materials.push(mat);
    const mesh = new THREE.InstancedMesh(BOX, mat, Math.max(1, towers.length * per));
    const m = new THREE.Matrix4();
    let n = 0;

    for (const s of towers) {
      for (let i = 0; i < per; i++) {
        const a = hash01(s.id, i * 977);
        const b = hash01(s.id, i * 313 + 7);
        const c = hash01(s.id, i * 61 + 91);
        // A third of the slots stay empty, so the density varies building
        // to building rather than every roof carrying exactly three boxes.
        if (c < 0.34) continue;
        const w = s.w * (0.12 + a * 0.22);
        const d = s.d * (0.12 + b * 0.22);
        const h = 0.9 + c * 3.4;
        m.makeScale(w, h, d);
        m.setPosition(
          s.x + (a - 0.5) * (s.w - w) * 0.85,
          s.h + h / 2,
          s.z + (b - 0.5) * (s.d - d) * 0.85,
        );
        mesh.setMatrixAt(n++, m);
      }
    }
    // Unused slots would otherwise render as unit cubes at the origin.
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.rooftops = mesh;
    return mesh;
  }

  /**
   * Street lighting.
   *
   * Not real lights — a hundred point lights would end the frame rate and
   * flat shading would barely show them. What actually reads at this
   * resolution is the *pool*: a warm quad on the asphalt under a small
   * bright head. Blue street, orange pools, and suddenly the grid is lit
   * rather than merely visible.
   */
  buildStreetLights() {
    const group = new THREE.Group();
    const spots = this.lamps;

    const postMat = solid(0x232833);
    const headMat = glow(0xffb46a);
    this.materials.push(postMat, headMat);

    const posts = new THREE.InstancedMesh(BOX, postMat, spots.length);
    const heads = new THREE.InstancedMesh(BOX, headMat, spots.length);
    const m = new THREE.Matrix4();

    spots.forEach((p, i) => {
      m.makeScale(0.42, 7, 0.42);
      m.setPosition(p.x, 3.5, p.z);
      posts.setMatrixAt(i, m);

      m.makeScale(1.5, 0.4, 0.9);
      m.setPosition(p.x, 7.1, p.z);
      heads.setMatrixAt(i, m);
    });
    for (const mesh of [posts, heads]) {
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    return group;
  }

  buildStructure(s) {
    const group = new THREE.Group();
    group.position.set(s.x, 0, s.z);

    // Only real buildings get windows; street cover and pylons are solid.
    const bodyMat = (s.kind === STRUCT.TOWER || s.kind === STRUCT.SLAB)
      // Which window pattern this building runs. Hashed off the id, so a
      // block looks the same every time it loads and neighbours rarely
      // match — see WINDOW_PATTERNS in `ps1.js`.
      ? facade(s.color, s.w, s.h, Math.floor(hash01(s.id, 4177) * WINDOW_PATTERN_COUNT))
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
