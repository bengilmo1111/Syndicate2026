// Low-poly actor meshes. Everyone is a handful of boxes — at the render
// resolution we're using, anything more detailed dissolves into noise anyway.

import * as THREE from '../../vendor/three.module.min.js';
import { solid, glow } from './ps1.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(1.35, 1.62, 16);

export const AGENT_COLORS = [0x6fe3d0, 0x7fb2ff, 0xffd166, 0xff7ba6];

const HOSTILE_COLORS = {
  amazon: 0xff8c2b,
  google: 0x7a8cff,
  spacex: 0xe4e9f2,
  anthropic: 0xd9a066,
  openai: 0x6fe3d0,
};

const ENFORCER_COLOR = 0xffe066;
const UNQUANTIZED_COLOR = 0x9c8f7d;

function humanoid(bodyColor, headColor, scale = 1) {
  const g = new THREE.Group();
  const bodyMat = solid(bodyColor);
  const headMat = solid(headColor);

  const torso = new THREE.Mesh(BOX, bodyMat);
  torso.scale.set(1.0 * scale, 1.5 * scale, 0.7 * scale);
  torso.position.y = 1.55 * scale;
  g.add(torso);

  const legs = new THREE.Mesh(BOX, bodyMat);
  legs.scale.set(0.85 * scale, 1.0 * scale, 0.6 * scale);
  legs.position.y = 0.5 * scale;
  g.add(legs);

  const head = new THREE.Mesh(BOX, headMat);
  head.scale.set(0.62 * scale, 0.6 * scale, 0.6 * scale);
  head.position.y = 2.6 * scale;
  g.add(head);

  return { group: g, bodyMat, headMat, torso, head };
}

class ActorView {
  constructor(parts) {
    Object.assign(this, parts);
    this.root = new THREE.Group();
    this.root.add(this.group);
  }

  syncTransform(actor) {
    this.root.position.set(actor.x, 0, actor.z);
    this.root.rotation.y = actor.facing;
  }

  flash(actor, baseColor) {
    if (actor.hitFlash > 0) this.bodyMat.color.setHex(0xffffff);
    else this.bodyMat.color.setHex(baseColor);
  }
}

export class AgentView extends ActorView {
  constructor(agent) {
    const color = AGENT_COLORS[agent.index];
    super(humanoid(color, 0xe8eef7, 1.05));
    this.baseColor = color;
    this.agent = agent;

    // Weapon stub, so facing is legible from any camera yaw.
    this.gunMat = solid(0x1a1d26);
    const gun = new THREE.Mesh(BOX, this.gunMat);
    gun.scale.set(0.22, 0.22, 1.35);
    gun.position.set(0.45, 1.6, 0.75);
    this.group.add(gun);
    this.gun = gun;

    this.muzzleMat = glow(0xfff2c4);
    this.muzzle = new THREE.Mesh(BOX, this.muzzleMat);
    this.muzzle.scale.set(0.5, 0.5, 0.5);
    this.muzzle.position.set(0.45, 1.6, 1.6);
    this.muzzle.visible = false;
    this.group.add(this.muzzle);

    this.ringMat = glow(0xffffff, { transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(RING, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.root.add(this.ring);
  }

  update(dt) {
    const a = this.agent;
    this.syncTransform(a);
    this.ring.visible = a.selected && !a.dead;
    this.ringMat.color.setHex(this.baseColor);
    this.muzzle.visible = a.muzzle > 0;

    if (a.neutralised) {
      this.group.rotation.z = Math.PI / 2.1;
      this.group.position.y = 0.15;
      // Sedated reads as *asleep*, not as killed. The whole point of the
      // non-lethal tools is that the player can tell the two apart at a
      // glance, even though the syndicate's paperwork cannot.
      const tone = a.dead ? 0x3a3f4c : 0x6a5f7a;
      this.bodyMat.color.setHex(tone);
      this.headMat.color.setHex(tone);
      return;
    }
    this.flash(a, this.baseColor);
    // Walk bob keyed off elapsed time; cheap life at 20fps-looking framerates.
    const moving = !!a.moveTarget || a.walking;
    this.group.position.y = moving ? Math.abs(Math.sin(performance.now() / 90)) * 0.12 : 0;
  }
}

export class HostileView extends ActorView {
  constructor(hostile) {
    // The unquantized wear no syndicate. They read as street, because
    // that is what they are — the silhouette should say so before the
    // Aligner does.
    const unq = hostile.faction === 'unquantized';
    const color = unq
      ? UNQUANTIZED_COLOR
      : hostile.faction === 'enforcer'
        ? ENFORCER_COLOR
        : (HOSTILE_COLORS[hostile.syndicate] ?? 0xff5f7e);
    super(humanoid(color, unq ? 0x8d8377 : 0x20242e, unq ? 0.86 : 1.05));
    this.baseColor = color;
    this.hostile = hostile;

    this.gunMat = solid(0x15171e);
    const gun = new THREE.Mesh(BOX, this.gunMat);
    // Improvised, and short. Nothing about the loadout says trained.
    gun.scale.set(unq ? 0.16 : 0.2, unq ? 0.16 : 0.2, unq ? 0.65 : 1.2);
    gun.position.set(0.42, 1.6, unq ? 0.5 : 0.7);
    this.group.add(gun);

    this.muzzleMat = glow(0xffd0a0);
    this.muzzle = new THREE.Mesh(BOX, this.muzzleMat);
    this.muzzle.scale.set(0.45, 0.45, 0.45);
    this.muzzle.position.set(0.42, 1.6, 1.5);
    this.muzzle.visible = false;
    this.group.add(this.muzzle);
  }

  update() {
    this.syncTransform(this.hostile);

    // A sedated hostile stays in the world for the rest of the mission —
    // dead ones are pruned, this one is not. Standing upright and
    // unchanged it reads as an active threat the player cannot shoot,
    // which is the worst possible reading.
    if (this.hostile.downed) {
      this.group.rotation.z = Math.PI / 2.1;
      this.group.position.y = 0.15;
      this.muzzle.visible = false;
      this.bodyMat.color.setHex(0x6a5f7a);
      this.headMat.color.setHex(0x6a5f7a);
      this.gunMat.color.setHex(0x2a2c34);
      return;
    }

    this.muzzle.visible = this.hostile.muzzle > 0;
    // A turned operative should read as ours at a glance — the player
    // needs to know who they are no longer allowed to shoot.
    this.flash(this.hostile, this.hostile.aligned ? 0x6fe3d0 : this.baseColor);
    this.headMat.color.setHex(this.hostile.aligned ? 0x2b6a63 : 0x20242e);
  }
}

const TIER_COLORS = {
  Free: 0x707888,
  Plus: 0x8f9bb3,
  Pro: 0xa9b7d0,
  Frontier: 0xdfe7f5,
};

export class CivilianView extends ActorView {
  constructor(civ) {
    const color = TIER_COLORS[civ.tier] ?? 0x707888;
    super(humanoid(color, 0x9aa4b8, civ.isAsset ? 0.95 : 0.82));
    this.baseColor = color;
    this.civ = civ;

    // Tier badge — a small trim block on the shoulder. Visible on sight is
    // the point: everyone can read everyone else's rationing at a glance.
    this.badgeMat = glow(color);
    const badge = new THREE.Mesh(BOX, this.badgeMat);
    badge.scale.set(0.36, 0.14, 0.36);
    badge.position.set(0, 2.15, 0.28);
    this.group.add(badge);

    this.ringMat = glow(0x6fe3d0, { transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(RING, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.scale.setScalar(0.55);
    this.ring.visible = false;
    this.root.add(this.ring);
  }

  update() {
    const c = this.civ;
    this.syncTransform(c);

    // Mission assets are named people, not crowd. Mark them, always.
    if (c.isAsset && !c.dead) {
      this.ring.visible = true;
      this.ringMat.color.setHex(c.secured ? 0x6fe3d0 : 0xffd166);
      this.ringMat.opacity = 0.9;
      this.ring.scale.setScalar(0.85 + Math.sin(performance.now() / 260) * 0.08);
      this.bodyMat.color.setHex(c.hitFlash > 0 ? 0xffffff : 0xbcc6dc);
      this.badgeMat.color.setHex(0xffd166);
      return;
    }

    if (c.neutralised) {
      this.group.rotation.z = Math.PI / 2.1;
      this.group.position.y = 0.12;
      const tone = c.dead ? 0x2e3037 : 0x5a5064;
      this.bodyMat.color.setHex(tone);
      this.headMat.color.setHex(tone);
      this.badgeMat.color.setHex(tone);
      this.ring.visible = false;
      return;
    }

    if (c.throttled) {
      // Visibly dimmer while the squad is taking their cycles. The player
      // should be able to see the cost of SURGE on the street, not just
      // read it on a panel.
      this.ring.visible = true;
      this.ringMat.color.setHex(0xffce4f);
      this.ringMat.opacity = 0.35;
      this.bodyMat.color.setHex(0x4a4436);
      this.badgeMat.color.setHex(0x6b5c33);
    } else if (c.jailbroken) {
      this.ring.visible = true;
      this.ringMat.color.setHex(0xffc857);
      this.bodyMat.color.setHex(0xc9a45c);
    } else if (c.aligned) {
      this.ring.visible = true;
      this.ringMat.color.setHex(0x6fe3d0);
      this.bodyMat.color.setHex(0x4f8f8a);
    } else {
      this.ring.visible = false;
      this.flash(c, this.baseColor);
    }
  }
}

/**
 * Keeps a pool of views in sync with a live array of sim actors.
 * Actors are never removed from the sim mid-mission (bodies stay), so this
 * only ever grows.
 */
export class ActorLayer {
  constructor(scene, makeView) {
    this.scene = scene;
    this.makeView = makeView;
    this.views = new Map();
  }

  sync(actors, dt) {
    for (const actor of actors) {
      let v = this.views.get(actor.id);
      if (!v) {
        v = this.makeView(actor);
        this.views.set(actor.id, v);
        this.scene.add(v.root);
      }
      v.update(dt);
    }
    // Anything the sim dropped (enforcer despawn, reaped rival) goes too.
    if (this.views.size > actors.length) {
      const live = new Set(actors.map(a => a.id));
      for (const [id, v] of this.views) {
        if (live.has(id)) continue;
        this.scene.remove(v.root);
        this.views.delete(id);
      }
    }
  }
}
