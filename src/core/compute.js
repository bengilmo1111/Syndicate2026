// Squad compute allocation.
//
// This is the Syndicate drug-slider, re-themed into the thing the game is
// actually about. The squad runs on a fixed compute budget split three
// ways, and the player moves points between channels mid-fight.
//
// SURGE is the part that matters. Overdrawing makes the deployment sharper
// by taking cycles off the civilians standing around them — they visibly
// slow down, and heat climbs while you hold it. The player spends the whole
// game being told that rationing intelligence is regrettable and necessary,
// and this is the button that lets them do it to a street personally.
//
// Do not make surge free. The cost is the point.

export const CHANNELS = Object.freeze(['latency', 'precision', 'resilience']);

export const BUDGET = 6;
export const SURGE_MULTIPLIER = 1.5;
export const SURGE_RADIUS = 26;
export const SURGE_HEAT_PER_SECOND = 7;
export const THROTTLED_SPEED = 0.5;

export class Compute {
  constructor() {
    // Even split. Neutral, and legible as a starting point.
    this.alloc = { latency: 2, precision: 2, resilience: 2 };
    this.surging = false;
  }

  /**
   * Move one point into `channel`, taking it from whichever channel can
   * best afford it. Always legal, so there is no invalid state to guard
   * and no modal allocation screen to open mid-firefight.
   */
  shiftInto(channel) {
    if (!CHANNELS.includes(channel)) return false;
    if (this.alloc[channel] >= BUDGET) return false;

    let donor = null;
    for (const c of CHANNELS) {
      if (c === channel) continue;
      if (this.alloc[c] > 0 && (donor === null || this.alloc[c] > this.alloc[donor])) donor = c;
    }
    if (!donor) return false;

    this.alloc[donor] -= 1;
    this.alloc[channel] += 1;
    return true;
  }

  toggleSurge() {
    this.surging = !this.surging;
    return this.surging;
  }

  /** Effective points in a channel, after surge. */
  points(channel) {
    return this.alloc[channel] * (this.surging ? SURGE_MULTIPLIER : 1);
  }

  // --- Derived multipliers. All neutral (1.0) at the default 2/2/2. ---

  /** Movement and fire rate. */
  get speedScale() { return 0.8 + 0.12 * this.points('latency'); }

  /** Shot deflection. Lower is tighter. Fights cover directly. */
  get spreadScale() { return 1.4 / (0.6 + 0.2 * this.points('precision')); }

  /** Effective weapon range. */
  get rangeScale() { return 0.86 + 0.07 * this.points('precision'); }

  /** Incoming damage taken. */
  get damageTakenScale() { return 1 - 0.06 * this.points('resilience'); }

  snapshot() {
    return {
      alloc: { ...this.alloc },
      surging: this.surging,
      speed: this.speedScale,
      spread: this.spreadScale,
      range: this.rangeScale,
      damageTaken: this.damageTakenScale,
    };
  }
}
