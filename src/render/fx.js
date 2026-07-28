// One-shot effects and persistent world markers.
// Everything here is pooled — allocating meshes mid-firefight is how you
// lose 60fps on a laptop.

import * as THREE from '../../vendor/three.module.min.js';
import { glow, solid } from './ps1.js';
import { ALIGNER_RADIUS } from '../core/squad.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(0.92, 1, 28);

class Pool {
  constructor(scene, size, build) {
    this.items = [];
    for (let i = 0; i < size; i++) {
      const item = build();
      item.mesh.visible = false;
      scene.add(item.mesh);
      this.items.push(item);
    }
    this.cursor = 0;
  }

  take() {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    return item;
  }
}

export class Fx {
  constructor(scene) {
    this.scene = scene;

    this.tracerMat = glow(0xb8fff2, { transparent: true, opacity: 0.95 });
    this.tracerEnemyMat = glow(0xffb37a, { transparent: true, opacity: 0.95 });
    this.sparkMat = glow(0xfff0c0, { transparent: true, opacity: 1 });
    this.bloodMat = glow(0xff4d6a, { transparent: true, opacity: 1 });
    this.debrisMat = solid(0x6b5a48);

    this.tracers = new Pool(scene, 64, () => ({
      mesh: new THREE.Mesh(BOX, this.tracerMat), life: 0, max: 0.09, grow: 0,
    }));
    this.sparks = new Pool(scene, 48, () => ({
      mesh: new THREE.Mesh(BOX, this.sparkMat), life: 0, max: 0.22, grow: 3.2,
    }));
    this.debris = new Pool(scene, 96, () => ({
      mesh: new THREE.Mesh(BOX, this.debrisMat),
      life: 0, max: 1.6,
      vx: 0, vy: 0, vz: 0,
    }));

    // Aligner field: one ring per agent, shown only while engaged.
    this.alignerMat = glow(0x6fe3d0, {
      transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this.alignerRings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(RING, this.alignerMat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(ALIGNER_RADIUS);
      ring.position.y = 0.12;
      ring.visible = false;
      scene.add(ring);
      this.alignerRings.push(ring);
    }

    // Move-order markers, one per agent.
    this.orderMat = glow(0xffffff, {
      transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    this.orderMarks = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(RING, this.orderMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(1.1);
      m.position.y = 0.1;
      m.visible = false;
      scene.add(m);
      this.orderMarks.push(m);
    }

    // Extraction zone: a wide ring on the ground the squad has to stand in.
    this.zoneMat = glow(0x9be7ff, {
      transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    this.zoneMesh = new THREE.Mesh(RING, this.zoneMat);
    this.zoneMesh.rotation.x = -Math.PI / 2;
    this.zoneMesh.position.y = 0.11;
    this.zoneMesh.visible = false;
    scene.add(this.zoneMesh);

    // Ground cursor.
    this.cursorMat = glow(0x9be7ff, {
      transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    });
    this.cursorMesh = new THREE.Mesh(RING, this.cursorMat);
    this.cursorMesh.rotation.x = -Math.PI / 2;
    this.cursorMesh.scale.setScalar(1.4);
    this.cursorMesh.position.y = 0.09;
    scene.add(this.cursorMesh);

    this.live = [];
  }

  tracer(x, z, angle, friendly) {
    const t = this.tracers.take();
    t.mesh.visible = true;
    t.mesh.material = friendly ? this.tracerMat : this.tracerEnemyMat;
    t.mesh.position.set(x + Math.sin(angle) * 2.2, 1.62, z + Math.cos(angle) * 2.2);
    t.mesh.rotation.set(0, angle, 0);
    t.mesh.scale.set(0.12, 0.12, 4.4);
    t.life = t.max;
    this.live.push(t);
  }

  spark(x, z, y = 1.5, color = 0xfff0c0) {
    const s = this.sparks.take();
    s.mesh.visible = true;
    s.mesh.material = color === 0xff4d6a ? this.bloodMat : this.sparkMat;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(0.7);
    s.life = s.max;
    this.live.push(s);
  }

  /** Rubble burst when a structure comes down. */
  collapse(structure) {
    const count = Math.min(24, Math.round(structure.w * structure.d * 0.35) + 8);
    for (let i = 0; i < count; i++) {
      const d = this.debris.take();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * structure.w * 0.6;
      d.mesh.visible = true;
      d.mesh.position.set(
        structure.x + Math.cos(a) * r,
        1 + Math.random() * 6,
        structure.z + Math.sin(a) * r,
      );
      d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const s = 0.5 + Math.random() * 1.4;
      d.mesh.scale.set(s, s * 0.7, s);
      d.vx = Math.cos(a) * (3 + Math.random() * 9);
      d.vz = Math.sin(a) * (3 + Math.random() * 9);
      d.vy = 6 + Math.random() * 10;
      d.life = d.max;
      this.live.push(d);
    }
  }

  setExtractionZone(zone, ready) {
    this.zoneMesh.visible = !!zone;
    if (!zone) return;
    this.zoneMesh.position.set(zone.x, 0.11, zone.z);
    const pulse = 0.97 + Math.sin(performance.now() / 300) * 0.03;
    this.zoneMesh.scale.setScalar(zone.radius * pulse);
    // Dim until the objective is actually live, so it reads as a marker
    // rather than as somewhere you should already be standing.
    this.zoneMat.color.setHex(ready ? 0x6fe3d0 : 0x54627a);
    this.zoneMat.opacity = ready ? 0.55 : 0.25;
  }

  setCursor(x, z, visible = true) {
    this.cursorMesh.visible = visible;
    this.cursorMesh.position.x = x;
    this.cursorMesh.position.z = z;
  }

  syncSquad(squad) {
    const engaged = squad.alignerEngaged;
    const jail = squad.alignerMode === 'jailbreak';
    this.alignerMat.color.setHex(jail ? 0xffc857 : 0x6fe3d0);

    squad.agents.forEach((a, i) => {
      const ring = this.alignerRings[i];
      ring.visible = engaged && !a.dead;
      if (ring.visible) {
        ring.position.x = a.x;
        ring.position.z = a.z;
        const pulse = 0.94 + Math.sin(performance.now() / 220 + i) * 0.05;
        ring.scale.setScalar(ALIGNER_RADIUS * pulse);
      }

      // Mark where the order actually ends, not the next waypoint on the
      // route there — the player asked for the destination.
      const goal = a.finalGoal ?? a.moveTarget;
      const mark = this.orderMarks[i];
      mark.visible = !!goal && !a.dead;
      if (mark.visible) {
        mark.position.x = goal.x;
        mark.position.z = goal.z;
      }
    });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const item = this.live[i];
      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.visible = false;
        this.live.splice(i, 1);
        continue;
      }
      const t = item.life / item.max;
      if (item.vy !== undefined) {
        item.vy -= 34 * dt;
        item.mesh.position.x += item.vx * dt;
        item.mesh.position.y += item.vy * dt;
        item.mesh.position.z += item.vz * dt;
        if (item.mesh.position.y < 0.3) {
          item.mesh.position.y = 0.3;
          item.vy *= -0.28;
          item.vx *= 0.6;
          item.vz *= 0.6;
        }
        item.mesh.rotation.x += dt * 4;
      } else {
        if (item.grow) item.mesh.scale.multiplyScalar(1 + dt * item.grow);
        item.mesh.material.opacity = t;
      }
    }
  }

  /** Drain a frame's worth of sim events into effects. */
  consume(events) {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.tracer(e.x, e.z, e.angle, e.friendly);
          break;
        case 'hit':
          this.spark(e.x, e.z, 1.6, 0xff4d6a);
          break;
        case 'impact':
          this.spark(e.x, e.z, 1.6);
          break;
        case 'collapse':
          this.collapse(e.structure);
          break;
        case 'align':
          this.spark(e.x, e.z, 2.4, 0xfff0c0);
          break;
        default:
          break;
      }
    }
    events.length = 0;
  }
}
