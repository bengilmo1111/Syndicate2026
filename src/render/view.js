// Scene assembly and the low-resolution pipeline.
//
// The whole frame is rendered into a fraction of the canvas's real pixel
// count and then scaled up by CSS with nearest-neighbour filtering. That one
// decision does more for the PS1 look than any shader, and it also means the
// game runs at 60fps on integrated graphics.

import * as THREE from '../../vendor/three.module.min.js';
import { makeFog, makeLights, FOG_COLOR } from './ps1.js';
import { CityView } from './cityView.js';
import { occludersBetween } from '../core/city.js';
import { AgentView, HostileView, CivilianView, ActorLayer } from './actorView.js';
import { Fx } from './fx.js';
import { TrafficView } from './trafficView.js';
import { CameraRig } from './cameraRig.js';

/** Internal render scale. 3 ≈ 640×360 on a 1080p canvas. */
export const PIXEL_SCALE = 3;

/** Where an agent's silhouette actually is, for the occlusion test. */
const HEAD_HEIGHT = 1.7;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(FOG_COLOR, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = makeFog();
    this.scene.add(makeLights());

    this.rig = new CameraRig(1);
    this.fx = new Fx(this.scene);

    this.cityView = null;
    this.agentLayer = new ActorLayer(this.scene, a => new AgentView(a));
    this.hostileLayer = new ActorLayer(this.scene, h => new HostileView(h));
    this.civilianLayer = new ActorLayer(this.scene, c => new CivilianView(c));
    this.trafficView = new TrafficView(this.scene);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.hitPoint = new THREE.Vector3();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(
      Math.max(160, Math.floor(w / PIXEL_SCALE)),
      Math.max(120, Math.floor(h / PIXEL_SCALE)),
      false,
    );
    this.rig.resize(w / h);
  }

  /** Tear down the previous mission's city and build the new one. */
  loadCity(city) {
    if (this.cityView) {
      this.scene.remove(this.cityView.root);
      this.cityView.dispose();
    }
    this.cityView = new CityView(city);
    this.scene.add(this.cityView.root);

    for (const layer of [this.agentLayer, this.hostileLayer, this.civilianLayer]) {
      for (const v of layer.views.values()) this.scene.remove(v.root);
      layer.views.clear();
    }
    this.trafficView.clear();
  }

  /**
   * Screen coordinates (0..1 of the canvas) to a point on the ground plane.
   * Returns null when the ray runs parallel to the ground or lands behind us.
   */
  screenToGround(nx, ny) {
    this.ndc.set(nx * 2 - 1, -(ny * 2 - 1));
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /**
   * Fade whatever is between the camera and the people you are steering.
   *
   * Every living agent, not just the selection and not just the centre: a
   * squad spread across an intersection has four separate sightlines, and
   * losing one agent behind a facade is exactly as bad as losing all four.
   * `occludersBetween` is pure core geometry — see `src/core/city.js`.
   *
   * Aimed at head height rather than the ground, because the ground under
   * an agent standing tight against a wall is inside that wall's footprint
   * and the whole block would ghost every time somebody took cover.
   */
  syncOcclusion(sim, dt) {
    const cam = this.rig.camera.position;
    const eye = { x: cam.x, y: cam.y, z: cam.z };
    const hidden = new Set();
    for (const a of sim.squad.alive) {
      for (const s of occludersBetween(sim.city, eye, { x: a.x, y: HEAD_HEIGHT, z: a.z })) {
        hidden.add(s.id);
      }
    }
    this.cityView.syncOcclusion(hidden, dt);
  }

  render(sim, dt) {
    this.fx.consume(sim.events);
    this.cityView.syncStructures();

    this.agentLayer.sync(sim.squad.agents, dt);
    this.hostileLayer.sync(sim.hostiles, dt);
    this.civilianLayer.sync(sim.civilians, dt);
    this.trafficView.sync(sim.traffic ?? [], dt);

    this.fx.syncSquad(sim.squad);
    this.fx.syncDevices(sim.devices ?? []);
    // A mission has an extraction zone or a hold zone, never both.
    if (sim.holdZone) {
      this.fx.setObjectiveZone(sim.holdZone, true, sim.inHoldZone);
    } else {
      this.fx.setObjectiveZone(sim.extraction, sim.assetsSecured >= sim.assets.length);
    }
    this.fx.update(dt);

    this.rig.follow(sim.squad.selectedCenter() ?? sim.squad.center());
    this.rig.update(dt);
    this.syncOcclusion(sim, dt);
    this.renderer.render(this.scene, this.rig.camera);
  }
}
