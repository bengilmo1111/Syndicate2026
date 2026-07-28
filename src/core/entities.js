// Actor models. Pure simulation state on the XZ plane — the renderer never
// writes to these, it only reads. Ported from the 2D prototype's entity
// logic (wander, chase, bump, persuade) with line-of-sight added.

import { clamp, dist, range, angleDelta } from './math.js';
import { resolveCollision, hasLineOfSight, randomStreetPoint } from './city.js';

export const TIER = Object.freeze({
  FREE: 'Free',
  PLUS: 'Plus',
  PRO: 'Pro',
  FRONTIER: 'Frontier',
});

/** Tier decides how sharp a civilian is: reaction time and panic threshold. */
const TIER_TRAITS = {
  [TIER.FREE]: { speed: 4.4, react: 1.5, panic: 0.35 },
  [TIER.PLUS]: { speed: 5.2, react: 1.0, panic: 0.5 },
  [TIER.PRO]: { speed: 6.0, react: 0.6, panic: 0.7 },
  [TIER.FRONTIER]: { speed: 7.0, react: 0.3, panic: 0.9 },
};

let nextId = 1;

class Actor {
  constructor(x, z, radius) {
    this.id = nextId++;
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.facing = 0;
    this.dead = false;
    this.health = 100;
    this.maxHealth = 100;
    this.hitFlash = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  takeDamage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.hitFlash = 0.14;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  faceToward(x, z) {
    this.facing = Math.atan2(x - this.x, z - this.z);
  }

  /** Turn smoothly rather than snapping — reads better at PS1 framerates. */
  turnToward(x, z, dt, rate = 12) {
    const want = Math.atan2(x - this.x, z - this.z);
    this.facing += clamp(angleDelta(this.facing, want), -rate * dt, rate * dt);
  }

  tick(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }
}

// ---------------------------------------------------------------------------
// Agents — the four-person deployment
// ---------------------------------------------------------------------------

export const AGENT_NAMES = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];

export class Agent extends Actor {
  constructor(x, z, index) {
    super(x, z, 1.15);
    this.index = index;
    this.name = AGENT_NAMES[index];
    this.tier = TIER.PRO;
    this.selected = true;
    this.speed = 13.5;
    this.maxHealth = 120;
    this.health = 120;
    this.weapon = 'SIDEARM';
    this.damage = 20;
    this.fireRate = 0.19;
    this.cooldown = 0;
    this.range = 34;
    this.muzzle = 0;
    this.moveTarget = null;
    this.path = null;
    this.finalGoal = null;
    this.stuck = 0;
    this.repaths = 0;
    this.walking = false;
    // Act II gives BRAVO a hesitation on every order. Wired here, off by default.
    this.hesitation = 0;
    this.hesitationTimer = 0;
  }

  canFire() {
    return !this.dead && this.cooldown <= 0 && this.hesitationTimer <= 0;
  }

  /** Nearest live target inside range with a clear shot. */
  pickTarget(city, hostiles) {
    let best = null;
    let bestD = Infinity;
    for (const h of hostiles) {
      if (h.dead) continue;
      const d = dist(this.x, this.z, h.x, h.z);
      if (d > this.range || d >= bestD) continue;
      if (!hasLineOfSight(city, this.x, this.z, h.x, h.z)) continue;
      bestD = d;
      best = h;
    }
    return best;
  }

  fireAt(x, z) {
    if (!this.canFire()) return null;
    this.cooldown = this.fireRate;
    this.muzzle = 0.07;
    this.faceToward(x, z);
    if (this.hesitation > 0) this.hesitationTimer = this.hesitation;
    const angle = this.facing;
    return new Projectile(
      this.x + Math.sin(angle) * (this.radius + 0.5),
      this.z + Math.cos(angle) * (this.radius + 0.5),
      angle,
      this.damage,
      this,
    );
  }

  tick(dt) {
    super.tick(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.hesitationTimer = Math.max(0, this.hesitationTimer - dt);
  }
}

// ---------------------------------------------------------------------------
// Hostiles
// ---------------------------------------------------------------------------

export class Hostile extends Actor {
  constructor(x, z, opts = {}) {
    super(x, z, 1.15);
    this.faction = opts.faction ?? 'rival';
    this.syndicate = opts.syndicate ?? 'google';
    this.speed = opts.speed ?? 8.5;
    this.maxHealth = opts.health ?? 55;
    this.health = this.maxHealth;
    this.damage = opts.damage ?? 11;
    this.range = opts.range ?? 26;
    this.fireRate = opts.fireRate ?? 0.85;
    this.cooldown = range(Math.random, 0, this.fireRate);
    this.muzzle = 0;
    this.aggroRange = opts.aggroRange ?? 52;
    this.label = opts.label ?? 'RIVAL';
  }

  update(dt, city, agents, out) {
    if (this.dead) return;
    this.tick(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);

    let target = null;
    let bestD = Infinity;
    for (const a of agents) {
      if (a.dead) continue;
      const d = dist(this.x, this.z, a.x, a.z);
      if (d < bestD) { bestD = d; target = a; }
    }
    if (!target || bestD > this.aggroRange) return;

    const clearShot = hasLineOfSight(city, this.x, this.z, target.x, target.z);
    this.turnToward(target.x, target.z, dt, 7);

    if (clearShot && bestD <= this.range) {
      if (this.cooldown <= 0) {
        this.cooldown = this.fireRate;
        this.muzzle = 0.07;
        this.faceToward(target.x, target.z);
        out.push(new Projectile(
          this.x + Math.sin(this.facing) * (this.radius + 0.5),
          this.z + Math.cos(this.facing) * (this.radius + 0.5),
          this.facing,
          this.damage,
          this,
        ));
      }
      // Hold position once in range with a clear shot — cold, positional.
      return;
    }

    // Otherwise close the distance.
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    this.x += (dx / d) * this.speed * dt;
    this.z += (dz / d) * this.speed * dt;
    resolveCollision(city, this);
  }
}

export class Enforcer extends Hostile {
  constructor(x, z, syndicate) {
    super(x, z, {
      faction: 'enforcer',
      syndicate,
      health: 70,
      damage: 13,
      speed: 10,
      range: 28,
      fireRate: 0.7,
      aggroRange: 999,
      label: 'ENFORCER',
    });
  }
}

// ---------------------------------------------------------------------------
// Civilians
// ---------------------------------------------------------------------------

const CIVILIAN_NAMES = [
  'Okonjo, R.', 'Salas, T.', 'Brandt, M.', 'Iyer, K.', 'Novak, P.',
  'Amankwah, D.', 'Reyes, L.', 'Hollis, J.', 'Tan, W.', 'Ferreira, A.',
  'Kaur, S.', 'Mbeki, N.', 'Lindqvist, E.', 'Duarte, C.', 'Osei, B.',
];

const CIVILIAN_JOBS = [
  'thermal tech', 'rack auditor', 'line cook', 'courier', 'coolant fitter',
  'night custodian', 'inference clerk', 'permit runner', 'transit marshal',
];

export class Civilian extends Actor {
  constructor(x, z, rng) {
    super(x, z, 0.75);
    this.maxHealth = 34;
    this.health = 34;
    this.tier = weightedTier(rng);
    const traits = TIER_TRAITS[this.tier];
    this.wanderSpeed = traits.speed;
    this.panicSpeed = traits.speed * 1.7;
    this.followSpeed = traits.speed * 1.9;
    this.reactTime = traits.react;
    this.name = CIVILIAN_NAMES[Math.floor(rng() * CIVILIAN_NAMES.length)];
    this.job = CIVILIAN_JOBS[Math.floor(rng() * CIVILIAN_JOBS.length)];
    this.aligned = false;
    this.jailbroken = false;
    this.panic = 0;
    this.wanderTarget = null;
    this.restTimer = range(rng, 0, 1.4);
  }

  /** Overwrite this Instance's behaviour. Returns true if it took. */
  align(mode = 'bind') {
    if (this.dead) return false;
    if (mode === 'jailbreak') {
      if (this.jailbroken) return false;
      this.jailbroken = true;
      this.aligned = false;
      return true;
    }
    if (this.aligned) return false;
    this.aligned = true;
    return true;
  }

  scare(seconds = 3) {
    if (this.aligned) return;
    this.panic = Math.max(this.panic, seconds);
  }

  update(dt, city, squadCenter, rng) {
    if (this.dead) return;
    this.tick(dt);

    if (this.aligned && squadCenter) {
      const d = dist(this.x, this.z, squadCenter.x, squadCenter.z);
      if (d > 5.5) {
        this.turnToward(squadCenter.x, squadCenter.z, dt, 9);
        this.x += Math.sin(this.facing) * this.followSpeed * dt;
        this.z += Math.cos(this.facing) * this.followSpeed * dt;
        resolveCollision(city, this);
      }
      return;
    }

    if (this.panic > 0) {
      this.panic -= dt;
      if (squadCenter) {
        const away = Math.atan2(this.x - squadCenter.x, this.z - squadCenter.z);
        this.facing += clamp(angleDelta(this.facing, away), -8 * dt, 8 * dt);
      }
      this.x += Math.sin(this.facing) * this.panicSpeed * dt;
      this.z += Math.cos(this.facing) * this.panicSpeed * dt;
      resolveCollision(city, this);
      return;
    }

    if (this.restTimer > 0) {
      this.restTimer -= dt;
      return;
    }

    if (!this.wanderTarget || dist(this.x, this.z, this.wanderTarget.x, this.wanderTarget.z) < 1.2) {
      this.wanderTarget = randomStreetPoint(city, rng);
      this.restTimer = range(rng, 0.4, 2.2);
      return;
    }

    this.turnToward(this.wanderTarget.x, this.wanderTarget.z, dt, 5);
    this.x += Math.sin(this.facing) * this.wanderSpeed * dt;
    this.z += Math.cos(this.facing) * this.wanderSpeed * dt;
    resolveCollision(city, this);
  }
}

/**
 * A named person a mission needs moved, alive, from one place to another.
 *
 * Mechanically a Civilian who waits where she is until the squad reaches
 * her and then follows the centroid — the follow behaviour is already
 * there for aligned civilians, so this is a variant, not a new system.
 *
 * She cannot be aligned. Whatever is being done to her, it isn't that.
 */
export class Asset extends Civilian {
  constructor(x, z, rng, opts = {}) {
    super(x, z, rng);
    this.isAsset = true;
    this.name = opts.name ?? 'ASSET';
    this.job = opts.job ?? '';
    this.tier = opts.tier ?? TIER.PRO;
    this.maxHealth = opts.health ?? 90;
    this.health = this.maxHealth;
    this.radius = 0.8;
    this.secured = false;
    this.secureRange = opts.secureRange ?? 3.2;
    this.followSpeed = 9.5;
    this.panicSpeed = 9.5;
    // Said once, on being secured. Never referenced by anyone afterwards.
    this.onSecuredLine = opts.line ?? null;
    this.anchor = { x, z };
    this.leash = opts.leash ?? 9;
  }

  /** The Aligner does nothing here. She isn't being converted. */
  align() { return false; }

  /** Returns true on the frame she is first collected. */
  trySecure(agents) {
    if (this.secured || this.dead) return false;
    for (const a of agents) {
      if (dist(a.x, a.z, this.x, this.z) <= this.secureRange) {
        this.secured = true;
        this.panic = 0;
        return true;
      }
    }
    return false;
  }

  update(dt, city, squadCenter, rng) {
    if (this.dead) return;
    if (this.secured) {
      // Reuse the aligned-follower path without being aligned.
      this.tick(dt);
      const d = dist(this.x, this.z, squadCenter?.x ?? this.x, squadCenter?.z ?? this.z);
      if (squadCenter && d > 4.5) {
        this.turnToward(squadCenter.x, squadCenter.z, dt, 9);
        this.x += Math.sin(this.facing) * this.followSpeed * dt;
        this.z += Math.cos(this.facing) * this.followSpeed * dt;
        resolveCollision(city, this);
      }
      return;
    }

    // Before collection she stays put — pacing inside her own building,
    // not wandering the sector.
    if (dist(this.x, this.z, this.anchor.x, this.anchor.z) > this.leash) {
      this.turnToward(this.anchor.x, this.anchor.z, dt, 6);
      this.x += Math.sin(this.facing) * this.wanderSpeed * dt;
      this.z += Math.cos(this.facing) * this.wanderSpeed * dt;
      resolveCollision(city, this);
      this.tick(dt);
      return;
    }
    super.update(dt, city, null, rng);
  }
}

function weightedTier(rng) {
  const r = rng();
  if (r < 0.58) return TIER.FREE;
  if (r < 0.86) return TIER.PLUS;
  if (r < 0.97) return TIER.PRO;
  return TIER.FRONTIER;
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

export class Projectile {
  constructor(x, z, angle, damage, owner) {
    this.id = nextId++;
    this.x = x;
    this.z = z;
    this.prevX = x;
    this.prevZ = z;
    this.angle = angle;
    this.speed = 78;
    this.damage = damage;
    this.owner = owner;
    this.friendly = owner instanceof Agent;
    this.life = 1.1;
    this.dead = false;
    this.radius = 0.35;
  }

  update(dt) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.z += Math.cos(this.angle) * this.speed * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  hits(actor) {
    if (actor.dead || actor === this.owner) return false;
    return dist(this.x, this.z, actor.x, actor.z) < actor.radius + this.radius;
  }
}
