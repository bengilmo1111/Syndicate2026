// The Instance buffer — `GAP_ANALYSIS.md` gap 8.
//
// The gap is that a firefight has no economy. Nothing runs out, nothing
// recovers, and so there is never a reason to stop shooting and go
// somewhere else. The original's answer was recharging shields, and the
// gap document is explicit that this is the half worth stealing: a pool
// that comes back *only while nobody is shooting at you* is what turns
// "keep firing" into a decision rather than the answer.
//
// It is not extra health, and that distinction is the whole design.
// An agent's pool is **split**, not extended: most of it is permanent and
// the rest is buffer. A squad that can break contact has exactly what it
// had before. A squad pinned in the open has noticeably less. Handing the
// player thirty more hit points would have made every fight easier, which
// is the opposite of adding pressure.
//
// In fiction it is the same thing the HUD has been calling RESILIENCE
// since the compute panel shipped: headroom on the Instance, which the
// suit reclaims when it is not busy keeping somebody alive.
//
// Pure core: no Three.js, no DOM.

/** Fraction of an agent's pool that is buffer rather than health. */
export const BUFFER_SHARE = 0.3;

/**
 * Seconds after the last hit before it starts coming back.
 *
 * Long enough that it cannot recover *during* an exchange — the enemy
 * fire rate is under a second — so the only way to get it back is to
 * stop being shot at. That is the mechanic; everything else here is
 * bookkeeping.
 */
export const BUFFER_DELAY = 4.5;

/** Points per second once it starts, before RESILIENCE. */
export const BUFFER_RATE = 9;

/**
 * How much RESILIENCE moves the recovery rate.
 *
 * The channel already scales damage taken. Giving it the buffer as well
 * is the point: RESILIENCE stops being "a slightly smaller number on
 * incoming" and becomes how quickly a squad can be ready to go again,
 * which is a thing the player can feel between fights rather than only
 * inside them.
 */
export const BUFFER_PER_POINT = 0.22;

/** Set up an actor's split pool. Safe to call twice. */
export function initBuffer(actor) {
  const total = actor.maxHealth;
  actor.maxBuffer = Math.round(total * BUFFER_SHARE);
  actor.buffer = actor.maxBuffer;
  actor.maxHealth = total - actor.maxBuffer;
  actor.health = actor.maxHealth;
  actor.bufferCold = 0;
  return actor;
}

/**
 * Spend the buffer first, and report what is left for flesh.
 *
 * Returns the damage that got through. The caller applies it — this
 * function deliberately does not touch health, so there is exactly one
 * place in the codebase that can kill somebody.
 */
export function absorb(actor, amount) {
  if (!actor.maxBuffer) return amount;
  actor.bufferCold = BUFFER_DELAY;
  if (actor.buffer <= 0) return amount;
  const taken = Math.min(actor.buffer, amount);
  actor.buffer -= taken;
  return amount - taken;
}

/** Tick recovery. `resilience` is the channel's point count, 0..6. */
export function recoverBuffer(actor, dt, resilience = 0) {
  if (!actor.maxBuffer || actor.dead) return;
  if (actor.bufferCold > 0) {
    actor.bufferCold = Math.max(0, actor.bufferCold - dt);
    return;
  }
  if (actor.buffer >= actor.maxBuffer) return;
  const rate = BUFFER_RATE * (1 + BUFFER_PER_POINT * resilience);
  actor.buffer = Math.min(actor.maxBuffer, actor.buffer + rate * dt);
}

/** Everything an agent has left, for the HUD and for the debrief. */
export function poolOf(actor) {
  return (actor.health ?? 0) + (actor.buffer ?? 0);
}

export function poolMax(actor) {
  return (actor.maxHealth ?? 0) + (actor.maxBuffer ?? 0);
}
