// Constrained orbit camera, deliberately not a free-fly.
//
// Syndicate Wars let you spin the city and tilt it, but never fly through it.
// That constraint is what keeps the block readable — you always look down at
// the streets from above, so the squad never disappears behind a facade.

import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from '../core/math.js';

export const PITCH_MIN = 0.42;
export const PITCH_MAX = 1.28;
export const DIST_MIN = 26;
export const DIST_MAX = 96;

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.6, 420);
    this.yaw = 0;
    this.pitch = 0.78;
    this.distance = 70;
    this.target = new THREE.Vector3(0, 0, 0);
    this.smoothTarget = new THREE.Vector3(0, 0, 0);
    this.shake = 0;
  }

  rotate(delta) { this.yaw += delta; }
  tilt(delta) { this.pitch = clamp(this.pitch + delta, PITCH_MIN, PITCH_MAX); }
  zoom(delta) { this.distance = clamp(this.distance + delta, DIST_MIN, DIST_MAX); }

  kick(amount = 0.35) { this.shake = Math.min(1.2, this.shake + amount); }

  /** Camera-relative movement basis, for WASD in a rotatable world. */
  basis() {
    const forward = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const right = { x: -forward.z, z: forward.x };
    return { forward, right };
  }

  follow(point) {
    if (point) this.target.set(point.x, 0, point.z);
  }

  update(dt) {
    this.smoothTarget.lerp(this.target, 1 - Math.pow(0.0012, dt));
    this.shake = Math.max(0, this.shake - dt * 2.6);

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const shakeX = this.shake * (Math.random() - 0.5) * 1.4;
    const shakeY = this.shake * (Math.random() - 0.5) * 1.4;

    this.camera.position.set(
      this.smoothTarget.x + Math.sin(this.yaw) * cosP * this.distance + shakeX,
      sinP * this.distance + shakeY,
      this.smoothTarget.z + Math.cos(this.yaw) * cosP * this.distance,
    );
    this.camera.lookAt(this.smoothTarget.x, 1.6, this.smoothTarget.z);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
