// Weapon definitions.
//
// Four identical sidearms is not a squad, it's one agent drawn four times.
// Differentiating the loadout is what turns "who is nearest" into "who
// should be where" — the rail rifle wants a lane, the minigun wants a
// corner, and neither wants the other's job.
//
// `spread` is radians of random deflection per shot. It is the number cover
// and the PRECISION channel both push against, so it is the number that
// makes positioning matter.

export const WEAPONS = Object.freeze({
  SIDEARM: {
    id: 'SIDEARM', name: 'SIDEARM',
    damage: 20, fireRate: 0.19, range: 34,
    spread: 0.018, speed: 78, pierce: 0, spinUp: 0,
    note: 'Standard issue. No opinion about anything.',
  },
  SMG: {
    id: 'SMG', name: 'SMG',
    damage: 10, fireRate: 0.075, range: 25,
    spread: 0.085, speed: 74, pierce: 0, spinUp: 0,
    note: 'Close, loud, and forgiving of a bad approach.',
  },
  RAIL: {
    id: 'RAIL', name: 'RAIL RIFLE',
    damage: 46, fireRate: 1.0, range: 66,
    spread: 0.003, speed: 165, pierce: 2,
    note: 'One lane, one line, two people.',
  },
  MINIGUN: {
    id: 'MINIGUN', name: 'MINIGUN',
    damage: 8, fireRate: 0.045, range: 30,
    spread: 0.13, speed: 80, pierce: 0, spinUp: 0.75,
    note: 'Spins up before it fires. Commit or don\'t.',
  },
});

/** The Act I default deployment: one of each role, no loadout screen yet. */
export const DEFAULT_LOADOUT = ['SIDEARM', 'SMG', 'RAIL', 'MINIGUN'];

export function weapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
