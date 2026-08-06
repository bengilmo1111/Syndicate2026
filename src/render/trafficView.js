// Ambient traffic, drawn.
//
// Not an `ActorView`: those are people, with a head, a torso and a tier
// badge, and none of that applies. A car in this game is four boxes — body,
// roof, headlight bar, tail bar — because at 640×360 with a 22° camera
// that is already more detail than survives the framebuffer.
//
// The sim owns everything about where they are and whether they are on
// fire. This module reads.

import * as THREE from '../../vendor/three.module.min.js';
import { solid, glow } from './ps1.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * A city's worth of cars, in three colours.
 *
 * Deliberately dull. Traffic is the thing you are *not* meant to look at —
 * it exists so the street reads as a street, and a fleet of bright vehicles
 * would pull the eye off the four people the player is steering.
 */
const BODY = [0x46505f, 0x394251, 0x4a4740, 0x3f4a55];

export class TrafficView {
  constructor(scene) {
    this.scene = scene;
    this.views = new Map();
  }

  build(vehicle) {
    const group = new THREE.Group();
    const paint = BODY[vehicle.id % BODY.length];

    const bodyMat = solid(paint);
    const body = new THREE.Mesh(BOX, bodyMat);
    body.scale.set(2.4, 1.05, 4.6);
    body.position.y = 0.72;
    group.add(body);

    const roofMat = solid(0x2b323d);
    const roof = new THREE.Mesh(BOX, roofMat);
    roof.scale.set(2.05, 0.72, 2.5);
    roof.position.set(0, 1.5, -0.2);
    group.add(roof);

    // Lights fore and aft, and they are doing most of the work. A car is
    // ten pixels across at the default camera distance — the body is a
    // smudge the same value as the asphalt, and what actually reads as
    // traffic from up here is the same thing that reads as traffic from a
    // window at night: two rows of moving lights. So they are deliberately
    // oversized for the vehicle, which is wrong and looks right.
    const headMat = glow(0xdfe9ff);
    const head = new THREE.Mesh(BOX, headMat);
    head.scale.set(2.2, 0.5, 0.45);
    head.position.set(0, 0.85, 2.35);
    group.add(head);

    const tailMat = glow(0xff3a2a);
    const tail = new THREE.Mesh(BOX, tailMat);
    tail.scale.set(2.0, 0.45, 0.4);
    tail.position.set(0, 0.95, -2.35);
    group.add(tail);

    this.scene.add(group);
    return { group, bodyMat, roofMat, headMat, tailMat, paint, wrecked: false };
  }

  sync(vehicles, dt) {
    for (const v of vehicles) {
      let view = this.views.get(v.id);
      if (!view) {
        view = this.build(v);
        this.views.set(v.id, view);
      }
      view.group.position.set(v.x, 0, v.z);
      view.group.rotation.y = v.facing;

      // Burning, then burnt. A wreck is scenery once it stops smoking, but
      // it is the loudest thing on the street while it does.
      if (v.dead && !view.wrecked) {
        view.wrecked = true;
        view.bodyMat.color.setHex(0x241f1c);
        view.roofMat.color.setHex(0x1d1a18);
        view.headMat.color.setHex(0x000000);
        view.group.position.y = -0.25;
        view.group.rotation.z = 0.09;
      }
      if (view.wrecked) {
        const burn = Math.max(0, v.burning);
        view.tailMat.color.setHex(burn > 0 ? 0xff7a3a : 0x2a2320);
        // Flicker while it burns, at a rate nothing else on screen uses.
        const flare = burn > 0 ? 1 + Math.sin(performance.now() / 55) * 0.4 : 1;
        view.tailMat.color.multiplyScalar(flare);
      } else {
        // Brake lights. Free, and it is the thing that makes a car stopping
        // for your squad legible from across the block.
        const braking = v.speed < v.cruise * 0.7;
        view.tailMat.color.setHex(braking ? 0xff2d1e : 0x8a2f28);
        view.bodyMat.color.setHex(v.hitFlash > 0 ? 0xffb0a0 : view.paint);
      }
    }

    if (this.views.size > vehicles.length) {
      const live = new Set(vehicles.map(v => v.id));
      for (const [id, view] of this.views) {
        if (live.has(id)) continue;
        this.scene.remove(view.group);
        this.views.delete(id);
      }
    }
  }

  clear() {
    for (const view of this.views.values()) this.scene.remove(view.group);
    this.views.clear();
  }
}
