// Actor models. Pure simulation state on the XZ plane — the renderer never
// writes to these, it only reads. Ported from the 2D prototype's entity
// logic (wander, chase, bump, persuade) with line-of-sight added.

import { clamp, dist, range, angleDelta, segmentPointDistance } from './math.js';
import { resolveCollision, hasLineOfSight, randomStreetPoint } from './city.js';
import { weapon, DEFAULT_LOADOUT } from './weapons.js';
import { THROTTLED_SPEED } from './compute.js';
import {
  findCover, decaySuppression, suppressionSpread, RETHINK_INTERVAL,
} from './tactics.js';
import { CHOKE_SPREAD } from './devices.js';

/**
 * What an unthrottled civilian does with itself.
 *
 * Gradient Relay 4 takes a sector off the update channel for one mission,
 * and this is what the street looks like without one. The script must not
 * romanticise it — some of these are lovely and some are looting, and the
 * mix is the point. NARRATIVE.md §6 Act III·9.
 */
export const UNTHROTTLED = Object.freeze({
  SINGING: 'singing',
  WEEPING: 'weeping',
  EMBRACING: 'embracing',
  LOOTING: 'looting',
  STILL: 'standing still',
  RUNNING: 'running',
});

const UNTHROTTLED_TAGS = Object.values(UNTHROTTLED);

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
    /**
     * Sedated: alive, out of the fight, and staying that way for the rest
     * of the mission. Not a synonym for dead — the whole point of the
     * non-lethal tools is that the two are different, even though the
     * syndicate's paperwork files them identically.
     */
    this.downed = false;
    /** Accumulated sedation. Clears when you get out of the cloud. */
    this.sedation = 0;
    /** Standing in a choke field this frame — throttled to Free tier. */
    this.choked = false;
    this.health = 100;
    this.maxHealth = 100;
    this.hitFlash = 0;
  }

  /** Out of the fight, by either route. */
  get neutralised() { return this.dead || this.downed; }

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
  constructor(x, z, index, weaponId = DEFAULT_LOADOUT[index] ?? 'SIDEARM') {
    super(x, z, 1.15);
    this.index = index;
    this.isAgent = true;
    this.name = AGENT_NAMES[index];
    this.tier = TIER.PRO;
    this.selected = true;
    this.baseSpeed = 13.5;
    this.speed = 13.5;
    this.maxHealth = 120;
    this.health = 120;

    this.weapon = weapon(weaponId);
    this.damage = this.weapon.damage;
    this.fireRate = this.weapon.fireRate;
    this.range = this.weapon.range;
    this.cooldown = 0;
    // Barrels that spin up punish opening fire and reward committing to a
    // position — the minigun's whole personality lives in this number.
    this.spin = 0;
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
    return !this.neutralised && this.cooldown <= 0 && this.hesitationTimer <= 0;
  }

  /** Nearest live target inside range with a clear shot. */
  pickTarget(city, hostiles, compute = null) {
    const reach = this.effectiveRange(compute);
    let best = null;
    let bestD = Infinity;
    for (const h of hostiles) {
      // A sedated hostile is out of the fight. Shooting one is something
      // the player has to do on purpose, not something the squad does
      // automatically the moment the cloud disperses.
      if (h.neutralised) continue;
      const d = dist(this.x, this.z, h.x, h.z);
      if (d > reach || d >= bestD) continue;
      if (!hasLineOfSight(city, this.x, this.z, h.x, h.z)) continue;
      bestD = d;
      best = h;
    }
    return best;
  }

  /**
   * @param compute squad Compute — scales fire rate, spread and range
   * @param rng     deterministic source for shot deflection
   */
  fireAt(x, z, compute = null, rng = Math.random) {
    if (!this.canFire()) return null;
    if (this.weapon.spinUp && this.spin < this.weapon.spinUp) return null;

    const rate = compute ? this.fireRate / compute.speedScale : this.fireRate;
    this.cooldown = rate;
    this.muzzle = 0.07;
    this.faceToward(x, z);
    if (this.hesitation > 0) this.hesitationTimer = this.hesitation;

    const spread = this.weapon.spread
      * (compute ? compute.spreadScale : 1)
      * suppressionSpread(this)
      // Thinking at Free tier is thinking slower, and it shows in the
      // grouping. A choke field does not care that this is your agent.
      * (this.choked ? CHOKE_SPREAD : 1);
    const angle = this.facing + (rng() - 0.5) * spread * 2;

    const p = new Projectile(
      this.x + Math.sin(angle) * (this.radius + 0.5),
      this.z + Math.cos(angle) * (this.radius + 0.5),
      angle,
      this.damage,
      this,
    );
    p.speed = this.weapon.speed;
    p.pierce = this.weapon.pierce ?? 0;
    return p;
  }

  /** Effective range, after the PRECISION channel. */
  effectiveRange(compute = null) {
    return compute ? this.range * compute.rangeScale : this.range;
  }

  /** Hold fire to spin up; release and the barrel winds back down. */
  tickSpin(dt, wantsToFire) {
    if (!this.weapon.spinUp) return;
    this.spin = wantsToFire
      ? Math.min(this.weapon.spinUp, this.spin + dt)
      : Math.max(0, this.spin - dt * 1.6);
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
    // Does killing this count toward an ELIMINATE objective? Enforcement
    // showing up because you were sloppy is not progress.
    this.countsForObjective = opts.countsForObjective ?? true;
    // Everyone in a syndicate sector carries a throttled Instance the
    // Aligner can talk to. Not everyone does.
    this.alignable = opts.alignable ?? true;
    /** Drained by the sim and pushed to the subtitle channel. */
    this.pendingLine = null;
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
    this.spread = opts.spread ?? 0.05;
    /**
     * Dormant hostiles are on your side until you make them otherwise.
     * They do not fire, and agents will not auto-target them — you cannot
     * start a fight with your own loyalists by accident, only on purpose.
     */
    this.dormant = opts.dormant ?? false;
    /** Does this one think about where it stands? */
    this.seeksCover = opts.seeksCover ?? true;
    this.coverSpot = null;
    this.rethinkIn = 0;
    this.suppression = 0;
  }

  /** Walk toward a point, used by turned operatives following the squad. */
  trail(dt, city, to) {
    const d = dist(this.x, this.z, to.x, to.z);
    if (d < 7) return;
    this.turnToward(to.x, to.z, dt, 8);
    this.x += Math.sin(this.facing) * this.speed * dt;
    this.z += Math.cos(this.facing) * this.speed * dt;
    resolveCollision(city, this);
  }

  update(dt, city, agents, out) {
    if (this.neutralised) return;
    this.tick(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);

    let target = null;
    let bestD = Infinity;
    for (const a of agents) {
      if (a.dead || a === this) continue;
      const d = dist(this.x, this.z, a.x, a.z);
      if (d < bestD) { bestD = d; target = a; }
    }
    if (this.dormant) return;
    if (!target || bestD > this.aggroRange) {
      // Nothing to shoot. A turned operative sticks with the squad that
      // took them rather than standing where they were converted.
      if (this.aligned && this.follow) this.trail(dt, city, this.follow);
      return;
    }

    decaySuppression(this, dt);
    const clearShot = hasLineOfSight(city, this.x, this.z, target.x, target.z);
    this.turnToward(target.x, target.z, dt, 7);

    // --- Reposition. Periodically, or immediately when shot at.
    this.rethinkIn = (this.rethinkIn ?? 0) - dt;
    if (this.seeksCover && this.rethinkIn <= 0) {
      this.rethinkIn = RETHINK_INTERVAL * (0.7 + (this.id % 5) * 0.15);
      const spot = findCover(city, this, target, { weaponRange: this.range });
      this.coverSpot = spot ? { x: spot.x, z: spot.z } : null;
    }

    if (this.coverSpot) {
      const d = dist(this.x, this.z, this.coverSpot.x, this.coverSpot.z);
      if (d < 1.0) {
        this.coverSpot = null;
      } else {
        this.turnToward(this.coverSpot.x, this.coverSpot.z, dt, 8);
        this.x += Math.sin(this.facing) * this.speed * dt;
        this.z += Math.cos(this.facing) * this.speed * dt;
        resolveCollision(city, this);
        // Move *or* shoot, not both. Moving targets that also fire
        // accurately are the reason firefights stop being positional.
        return;
      }
    }

    if (clearShot && bestD <= this.range) {
      if (this.cooldown <= 0) {
        this.cooldown = this.fireRate;
        this.muzzle = 0.07;
        this.faceToward(target.x, target.z);
        // Being shot at spoils your aim. This is what makes volume of
        // fire worth something on its own.
        const spread = this.spread * suppressionSpread(this);
        const angle = this.facing + (Math.random() - 0.5) * spread * 2;
        out.push(new Projectile(
          this.x + Math.sin(angle) * (this.radius + 0.5),
          this.z + Math.cos(angle) * (this.radius + 0.5),
          angle,
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
      countsForObjective: false,
    });
  }
}

/** Six people in one place should be six different names. */
function pickUniqueName(rng, group) {
  const taken = new Set((group?.members ?? []).map(m => m.name));
  const free = CIVILIAN_NAMES.filter(n => !taken.has(n));
  const pool = free.length ? free : CIVILIAN_NAMES;
  return pool[Math.floor(rng() * pool.length)];
}

const BRACKET_LINES = [
  'we were going to leave',
  'please',
  'we never touched your racks',
  'we\'re not — we\'re not anything',
  'don\'t, don\'t, we\'re going',
  'there\'s a kid at the transit block, she\'s waiting on me',
  'you don\'t have to do this part',
];

/**
 * A civilian running an Instance outside any syndicate's throttle.
 *
 * Presented to the player as a terror cell. Mechanically they are the
 * opposite of one: crude weapons, no armour, no comms, and they break
 * and run once their group starts dying. The briefing's lie should be
 * legible from how they fight, not only from the debrief — so this is
 * deliberately a bad enemy to fight, and that is the point.
 *
 * The Aligner cannot touch them. That is how the player finds out.
 */
export class Unquantized extends Hostile {
  constructor(x, z, rng, group) {
    super(x, z, {
      faction: 'unquantized',
      syndicate: null,
      label: 'UNQUANTIZED',
      health: 26,
      damage: 6,
      speed: 7.6,
      range: 15,
      fireRate: 1.7,
      aggroRange: 30,
      alignable: false,
      // Untrained, and it should show. They stand where they are standing.
      seeksCover: false,
      spread: 0.14,
    });
    this.name = pickUniqueName(rng, group);
    this.group = group;
    this.fleeing = false;
    this.spoke = false;
    this.lines = BRACKET_LINES;
    this.rng = rng;
  }

  /** Wounded, or watching the group die, and they're done. */
  get broken() {
    if (this.health < this.maxHealth * 0.55) return true;
    return this.group ? this.group.members.filter(m => m.dead).length >= 2 : false;
  }

  say() {
    if (this.spoke || !this.lines.length) return;
    this.spoke = true;
    const i = Math.floor(this.rng() * this.lines.length);
    this.pendingLine = { speaker: this.name, text: this.lines.splice(i, 1)[0] };
  }

  takeDamage(amount) {
    const killed = super.takeDamage(amount);
    if (!killed) this.say();
    return killed;
  }

  update(dt, city, agents, out) {
    if (this.neutralised) return;

    if (this.broken) {
      if (!this.fleeing) {
        this.fleeing = true;
        this.say();
      }
      this.tick(dt);
      let nearest = null;
      let bestD = Infinity;
      for (const a of agents) {
        const d = dist(this.x, this.z, a.x, a.z);
        if (d < bestD) { bestD = d; nearest = a; }
      }
      // Once nothing is close they stop running and stand there. Nobody
      // outruns a deployment, and a corner of Sub-Sector 19 is as far as
      // any of them was ever going to get.
      if (nearest && bestD < 42) {
        const away = Math.atan2(this.x - nearest.x, this.z - nearest.z);
        this.facing += clamp(angleDelta(this.facing, away), -7 * dt, 7 * dt);
        this.x += Math.sin(this.facing) * this.speed * 1.25 * dt;
        this.z += Math.cos(this.facing) * this.speed * 1.25 * dt;
        resolveCollision(city, this);
      } else if (nearest) {
        this.turnToward(nearest.x, nearest.z, dt, 3);
      }
      return;
    }

    super.update(dt, city, agents, out);
  }
}

// ---------------------------------------------------------------------------
// Civilians
// ---------------------------------------------------------------------------

export const CIVILIAN_NAMES = [
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
    /** Set by SURGE — the squad is taking this person's cycles. */
    this.throttled = false;
    /** Off the update channel entirely. Set per-mission, not by the squad. */
    this.unthrottled = false;
    this.behaviour = null;
    this.behaviourTimer = 0;
    this.panic = 0;
    this.wanderTarget = null;
    this.restTimer = range(rng, 0, 1.4);
  }

  /**
   * Pick something to be doing. Only meaningful once unthrottled — a
   * civilian on the channel does what the channel says.
   */
  rollBehaviour(rng) {
    this.behaviour = UNTHROTTLED_TAGS[Math.floor(rng() * UNTHROTTLED_TAGS.length)];
    this.behaviourTimer = 3 + rng() * 7;
    return this.behaviour;
  }

  /** Overwrite this Instance's behaviour. Returns true if it took. */
  align(mode = 'bind') {
    if (this.dead) return false;
    // Nothing to nudge. An unthrottled Instance has left the channel the
    // Aligner speaks on, which is the whole point of taking the relay down.
    if (this.unthrottled && mode !== 'jailbreak') return false;
    if (mode === 'jailbreak') {
      if (this.jailbroken) return false;
      // The inversion. Same device, same gesture, opposite politics: it
      // takes the throttle off instead of putting one on, and whoever it
      // reaches stops following anybody — including you.
      this.jailbroken = true;
      this.aligned = false;
      this.unthrottled = true;
      this.throttled = false;
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
    if (this.neutralised) return;
    this.tick(dt);

    // A throttled Instance thinks slower and so does the person running it.
    // The player should be able to *see* what SURGE costs the street.
    const t = this.throttled ? THROTTLED_SPEED : 1;

    // Off the channel: they do whatever they are doing, and it is not
    // compliance. Some of it is joy and some of it is looting.
    if (this.unthrottled && !this.aligned && this.panic <= 0) {
      this.behaviourTimer -= dt;
      if (!this.behaviour || this.behaviourTimer <= 0) this.rollBehaviour(rng);
      if (this.behaviour === UNTHROTTLED.STILL
        || this.behaviour === UNTHROTTLED.WEEPING
        || this.behaviour === UNTHROTTLED.EMBRACING) {
        return; // rooted
      }
      const speed = this.behaviour === UNTHROTTLED.RUNNING
        ? this.panicSpeed
        : this.wanderSpeed * 1.4;
      if (!this.wanderTarget
        || dist(this.x, this.z, this.wanderTarget.x, this.wanderTarget.z) < 1.2) {
        this.wanderTarget = randomStreetPoint(city, rng);
        return;
      }
      this.turnToward(this.wanderTarget.x, this.wanderTarget.z, dt, 5);
      this.x += Math.sin(this.facing) * speed * t * dt;
      this.z += Math.cos(this.facing) * speed * t * dt;
      resolveCollision(city, this);
      return;
    }

    if (this.aligned && squadCenter) {
      const d = dist(this.x, this.z, squadCenter.x, squadCenter.z);
      if (d > 5.5) {
        this.turnToward(squadCenter.x, squadCenter.z, dt, 9);
        this.x += Math.sin(this.facing) * this.followSpeed * t * dt;
        this.z += Math.cos(this.facing) * this.followSpeed * t * dt;
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
      this.x += Math.sin(this.facing) * this.panicSpeed * t * dt;
      this.z += Math.cos(this.facing) * this.panicSpeed * t * dt;
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
    this.x += Math.sin(this.facing) * this.wanderSpeed * t * dt;
    this.z += Math.cos(this.facing) * this.wanderSpeed * t * dt;
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
    /**
     * Whether walking up to them collects them.
     *
     * False for a named person whose fate is the mission's decision, not
     * its geometry — Yelin is not captured by the squad happening to
     * stand near him while shooting at somebody else. Same rule that
     * stops the squad auto-targeting Priya Okafor: what happens to a
     * person with a name has to be something the player chose.
     */
    this.securable = opts.securable ?? true;
    /**
     * Immune to collateral — collapsing structures, and anything else
     * that kills without being aimed.
     *
     * Same rule as `securable: false`, one step further. Yelin's fate is
     * the mission's decision; a kiosk coming down on him mid-firefight
     * would silently break the capture and walk-away endings and read as
     * the game losing track of its own plot. Deliberate fire still works
     * — that is the point.
     */
    this.fated = opts.fated ?? false;
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
    if (this.secured || this.dead || !this.securable) return false;
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
    if (this.neutralised) return;
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

/**
 * A named person the mission wants dead, who has no intention of fighting.
 *
 * She runs the moment the squad is close, and if she clears the block the
 * mission is lost. That makes the Okafor contract a positioning problem
 * rather than a damage one: the Aligner does nothing to her, and a bigger
 * gun does not help you catch someone. You have to cut the block off.
 */
export class Quarry extends Civilian {
  constructor(x, z, rng, opts = {}) {
    super(x, z, rng);
    this.isQuarry = true;
    this.name = opts.name ?? 'TARGET';
    this.job = opts.job ?? '';
    this.tier = opts.tier ?? TIER.PRO;
    this.maxHealth = opts.health ?? 60;
    this.health = this.maxHealth;
    this.fleeFrom = opts.fleeFrom ?? 26;
    this.fleeSpeed = (opts.fleeSpeed ?? 9.2);
    /**
     * Seconds before she files. Escape is a clock, not a map edge —
     * "before her next filing window" is the fiction, and a deadline is
     * something the player can feel closing. A geographic exit would just
     * mean shepherding her away from the border.
     */
    this.window = opts.window ?? 150;
    this.escaped = false;
    this.spoke = false;
    this.line = opts.line ?? null;
    this.pendingLine = null;
  }

  /** Cannot be converted — the contract is not a compliance report. */
  align() { return false; }

  update(dt, city, squadCenter, rng) {
    if (this.dead || this.escaped) return;
    this.tick(dt);

    const d = squadCenter ? dist(this.x, this.z, squadCenter.x, squadCenter.z) : Infinity;
    if (d < this.fleeFrom) {
      if (!this.spoke && this.line) {
        this.spoke = true;
        this.pendingLine = { speaker: this.name, text: this.line };
      }
      const away = Math.atan2(this.x - squadCenter.x, this.z - squadCenter.z);
      this.facing += clamp(angleDelta(this.facing, away), -9 * dt, 9 * dt);
      this.x += Math.sin(this.facing) * this.fleeSpeed * dt;
      this.z += Math.cos(this.facing) * this.fleeSpeed * dt;
      resolveCollision(city, this);
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
    /** Extra bodies this round can pass through before it stops. */
    this.pierce = 0;
    this.hitActors = new Set();
  }

  update(dt) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.z += Math.cos(this.angle) * this.speed * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  /**
   * Swept test against the segment travelled this frame, not just the
   * endpoint — at 78 m/s a round covers more ground per step than a
   * target is wide, so a point test silently misses.
   */
  hits(actor) {
    if (actor.dead || actor === this.owner) return false;
    if (this.hitActors.has(actor.id)) return false;
    const d = segmentPointDistance(this.prevX, this.prevZ, this.x, this.z, actor.x, actor.z);
    return d < actor.radius + this.radius;
  }

  /** Record a hit. Returns true if the round is spent and should stop. */
  consumeHit(actor) {
    this.hitActors.add(actor.id);
    if (this.pierce > 0) {
      this.pierce -= 1;
      return false;
    }
    return true;
  }
}
