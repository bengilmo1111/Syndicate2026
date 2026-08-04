// Deployments the map writes.
//
// Everything else in `src/missions/` is authored: fifteen slots, fifteen
// briefings, one arc. This file is the other direction — the strategic
// layer had been feeding the campaign for two chunks and the campaign had
// no way to answer it. A sector taken off you by Google could only be won
// back by replaying the mission that took it the first time, with its
// original briefing, against its original garrison, in a block still
// painted OpenAI teal. That reads wrong in every particular.
//
// So: same block, different people. The city comes from the authored
// mission's own `setup()`, so the streets are the ones the player already
// fought down; the palette, the opposition and the copy come from whoever
// is standing in it now. A retake is not a replay and the record does not
// treat it as one — see `registerGenerated` in `mission.js`.
//
// Pure core. No DOM, no Three.js, no localStorage.

import { registerGenerated, objective, OBJECTIVE, getMissionDef } from './mission.js';
import { paletteFor, randomStreetPoint } from './city.js';
import { Hostile, Unquantized } from './entities.js';
import { dist } from './math.js';
import {
  SECTORS, sectorById, RIVALS, retakeId, rivalStrength,
} from './territory.js';

/** Seconds the block has to be held after the garrison is down. */
export const HOLD_SECONDS = 25;
/** Seconds the block has to be held when there is no garrison, only people. */
export const REVOLT_HOLD_SECONDS = 40;
/** How many residents come out when a revolted sector is walked back into. */
export const REVOLT_CROWD = 7;

/**
 * How each syndicate garrisons a block it has just taken.
 *
 * Straight out of NARRATIVE §5's field cultures, because a doctrine that
 * only changes a number on the strategic map is the "largely cosmetic"
 * failure the gap analysis warns about — the player has to be able to tell
 * who holds a sector by how the fight goes, before reading the briefing.
 *
 * - AMAZON  numbers. "Efficient, unglamorous, dangerous in numbers."
 * - GOOGLE  a fortress that has been there for decades. Fewer, harder,
 *           further, and they will not leave the wall they are behind.
 * - SPACEX  swagger and risk tolerance. Fastest, hardest hitting, and
 *           they do not take cover, because they do not think they need it.
 * - ANTHROPIC the smallest footprint of the five. Barely a garrison at
 *           all — what defends the block is that the block is off the
 *           update channel, and the Aligner has nothing to talk to.
 */
export const GARRISON = Object.freeze({
  BROAD: {
    count: 9, health: 50, damage: 10, range: 26, speed: 8.5,
    aggroRange: 58, label: 'AMAZON LOGISTICS SECURITY',
  },
  RICHEST: {
    count: 6, health: 84, damage: 13, range: 32, speed: 7.4,
    aggroRange: 46, label: 'GOOGLE SITE SECURITY',
  },
  FLAT: {
    count: 5, health: 66, damage: 17, range: 24, speed: 11,
    aggroRange: 95, seeksCover: false, label: 'SPACEX GROUND ELEMENT',
  },
  UNREST: {
    count: 4, health: 58, damage: 9, range: 24, speed: 8,
    aggroRange: 44, label: 'ANTHROPIC SITE SAFETY',
  },
});

/**
 * Extra bodies for a syndicate that is winning the wider argument.
 *
 * Capped, and capped low. A rival running away with the map should make
 * their blocks harder to walk back into; a rival running away with the map
 * should not make them impossible, because the player who most needs to
 * retake something is the player who is already losing.
 */
export const REINFORCEMENT_CAP = 3;

/** What the people of a sector that threw you out have to say about it. */
const RESIDENT_LINES = [
  'we already did this',
  'you were told',
  'go back and tell them we said no',
  'this is our block',
  'there is nothing here that is yours',
  'we are not on your channel and we are not going back on it',
  'you do not get to come back',
];

/**
 * Repaint a block for whoever is standing in it.
 *
 * The structures were coloured from the source city's palette at
 * generation time, so the swap is a lookup rather than a rebuild — which
 * matters, because rebuilding would give a different street layout and the
 * whole point is that the player recognises the block.
 */
export function reskin(city, syndicate) {
  const from = city.palette;
  const to = paletteFor(syndicate);
  if (from === to) return city;
  const remap = (v) => {
    if (v === from.base) return to.base;
    if (v === from.roof) return to.roof;
    if (v === from.trim) return to.trim;
    return v;                       // a landmark's own accent stays its own
  };
  for (const s of city.structures) {
    // A landmark keeps its own paint. The relay pylon is Amazon orange
    // because it is an Amazon pylon, not because the block around it is —
    // and its accent is *the same value* as the Amazon palette's trim, so
    // remapping by lookup would repaint it without ever knowing.
    if (s.landmark) continue;
    s.color = remap(s.color);
    s.roof = remap(s.roof);
    s.trim = remap(s.trim);
  }
  city.syndicate = syndicate;
  city.palette = to;
  return city;
}

/** The open cell nearest the middle of the block — where a retake is decided. */
function holdPoint(city) {
  let best = { x: 0, z: 0 };
  let bestD = Infinity;
  for (const cell of city.openCells) {
    const d = Math.hypot(cell.x, cell.z);
    if (d < bestD) { bestD = d; best = cell; }
  }
  return best;
}

/**
 * Which sectors the map can currently write a deployment for.
 *
 * The test is "you took this once and you do not have it now" — not
 * `lostTo`, which is deliberately transient: a revolted sector is picked up
 * by its native syndicate on the next deployment and stops being flagged as
 * lost. A sector the player has never taken is not offered either. That one
 * still has an authored mission with a briefing that means something, and
 * replacing it with a generated one would be a downgrade.
 */
export function retakeTargets(territory, completed = []) {
  const done = new Set(completed);
  return SECTORS.filter(s => done.has(s.from) && !territory[s.id]?.held);
}

export function canRetake(territory, sectorId, completed = []) {
  return retakeTargets(territory, completed).some(s => s.id === sectorId);
}

/** Who is holding a sector, as a rival record — or null if it is nobody's. */
export function holderOf(territory, sectorId) {
  const owner = territory[sectorId]?.owner;
  return owner ? RIVALS[owner] ?? null : null;
}

function briefingFor(sector, holder, garrison) {
  const head = [
    'SECTOR CONTROL BULLETIN — AUTOMATED',
    `RE: ${sector.name} · ${sector.detail} · STATUS: NOT HELD`,
    '',
  ];
  // Nobody signs these. The sector desk generates one per block that has
  // come off the ledger, and it will generate another one tomorrow if this
  // deployment does not close. Saying so is more honest than inventing a
  // sender — Yelin is not always on the other end of the channel by Act IV,
  // and the map does not stop working when he stops writing.
  const tail = [
    '',
    `• Clear whoever is standing in it. ${garrison} on the desk's last count.`,
    '• Then stand in it. The sector does not come back because the shooting stopped; it comes back because you were still there afterwards.',
    '',
    'No signature on this one. The desk writes one per block off the ledger and it will write another tomorrow.',
  ];

  if (!holder) {
    return [
      ...head,
      `${sector.name} threw you out and has not let anybody else in either. There is no garrison. There are people who live there, they are off the update channel, and the desk has classified them hostile because the desk has one classification for this.`,
      '',
      '• Hold the block. Forty seconds, on the ground, in the middle of it.',
      '• Nothing here has to die for that to happen. The aerosol is in the belt and HOLD FIRE is on H. The desk will file the sector the same either way, which you may take however you like.',
      '',
      'No signature on this one. The desk writes one per block off the ledger and it will write another tomorrow.',
    ];
  }

  // Named in caps throughout. The bulletin is generated by the sector desk
  // and the sector desk does not write prose about competitors, it files
  // them.
  const line = {
    amazon: `AMAZON had a logistics element in ${sector.name} inside a week. They are metering our throughput against their delivery quotas again, which is how this started the first time. There are a lot of them and none of them are interesting. That is the problem with them.`,
    google: `GOOGLE took ${sector.name} and has spent every hour since making it theirs. Fewer people than Amazon would post, behind more concrete, at longer range. Their field culture is older than this company. Expect to be shot at from somewhere you have already walked past.`,
    spacex: `SPACEX put a ground element into ${sector.name} from orbit within six hours of it coming free. There are not many. They will come straight at the squad, they will not take cover, and they hit harder than anything on this block has a right to.`,
    anthropic: `ANTHROPIC did not take ${sector.name}. They talked to it. Every Instance in the block is off the cap — the Aligner will report no handshake and it will be correct. Their site safety element is four people who would rather this were a conversation. It is not going to be one.`,
  }[holder.id];

  return [...head, line, ...tail];
}

function debriefFor(sector, holder) {
  const win = holder
    ? [
      `${sector.name} is back on the ledger. ${holder.name}'s people are off it.`,
      'The sector desk closes the bulletin without comment and opens a fresh unrest line at twenty-two, the way it does for every block that changes hands.',
      'Nobody asks what the people who live here think about being provisioned twice in one campaign.',
    ]
    : [
      `${sector.name} is back on the ledger. It did not surrender; it was stood on until the desk was satisfied.`,
      'The unrest line opens at twenty-two, same as any other block, which is the desk saying it does not remember what happened here.',
      'The people who threw you out are still the people who live here.',
    ];

  return {
    titles: { win: 'SECTOR RECOVERED', loss: 'STILL NOT YOURS' },
    win,
    loss: [
      `The deployment closed without ${sector.name}.`,
      'The bulletin regenerates overnight. It will be the same bulletin.',
    ],
  };
}

/**
 * Write the deployment for taking a sector back, and register it so
 * `createSim()` can find it by id like any other mission.
 *
 * Regenerated on every request rather than cached, because the opposition
 * is whoever holds the block *now* — a sector that changed hands twice
 * while the player was elsewhere is a different fight, and a cached def
 * would quietly send them against the wrong syndicate.
 */
export function retakeFor(territory, sectorId) {
  const sector = sectorById(sectorId);
  if (!sector) return null;
  const state = territory[sectorId];
  if (!state || state.held) return null;

  const source = getMissionDef(sector.from);
  const holder = holderOf(territory, sectorId);
  const plan = holder ? GARRISON[holder.doctrine] : null;
  const strength = holder ? rivalStrength(territory)[holder.id] : 0;
  const count = plan
    ? plan.count + Math.min(REINFORCEMENT_CAP, Math.floor(strength / 3))
    : REVOLT_CROWD;
  // Anthropic's whole doctrine is that they work on people rather than
  // ground. A block they have been talking to is off the update channel,
  // which is the one defence in the game the Aligner cannot answer.
  const unthrottled = holder?.doctrine === 'UNREST';

  return registerGenerated({
    id: retakeId(sectorId),
    name: holder ? `${sector.name} — RETAKE` : `${sector.name} — RETURN`,
    sector: `Austin · ${sector.name} · ${sector.detail}`,
    act: 'THE MAP',
    rival: holder?.id ?? 'none',
    cityseed: source.cityseed,
    // A retake is not campaign progress and never gates anything. It has
    // no `requires` on purpose: the map decides when it is available, and
    // `retakeTargets()` is where that decision lives.
    retake: { sectorId, holder: holder?.id ?? null, count },

    briefing: briefingFor(sector, holder, count),
    debrief: debriefFor(sector, holder),

    buildObjectives: () => (holder
      ? [
        objective(OBJECTIVE.ELIMINATE, {
          id: 'garrison',
          label: `CLEAR ${holder.name} GARRISON`,
          target: count,
        }),
        objective(OBJECTIVE.HOLD, {
          id: 'stand',
          label: 'HOLD THE BLOCK',
          target: HOLD_SECONDS,
          after: 'garrison',
        }),
      ]
      : [
        objective(OBJECTIVE.HOLD, {
          id: 'stand',
          label: 'HOLD THE BLOCK',
          target: REVOLT_HOLD_SECONDS,
        }),
      ]),

    setup(rng) {
      // The authored mission builds its own block from its own seed, so
      // this is the same streets, the same skyline and the same landmark
      // the player fought down the first time. Everything else it returns
      // — its garrison, its assets, its extraction — belongs to a mission
      // that already happened, and is discarded.
      const { city } = source.setup(rng);
      reskin(city, holder?.id ?? 'none');

      const zone = holdPoint(city);
      const hostiles = [];
      const group = holder ? null : { members: [] };
      let guard = 0;
      while (hostiles.length < count && guard++ < 800) {
        const p = randomStreetPoint(city, rng, 2.4);
        // Not on top of the deployment point. A retake that opens with the
        // squad already surrounded is not a fight, it is a coin toss.
        if (dist(p.x, p.z, city.deploy.x, city.deploy.z) < 34) continue;
        if (holder) {
          hostiles.push(new Hostile(p.x, p.z, {
            faction: 'rival',
            syndicate: holder.id,
            label: plan.label,
            health: plan.health,
            damage: plan.damage,
            range: plan.range,
            speed: plan.speed,
            aggroRange: plan.aggroRange,
            seeksCover: plan.seeksCover ?? true,
          }));
        } else {
          const r = new Unquantized(p.x, p.z, rng, group, {
            label: 'RESIDENT',
            lines: RESIDENT_LINES,
          });
          group.members.push(r);
          hostiles.push(r);
        }
      }

      return {
        city,
        hostiles,
        civilianCount: holder ? 20 : 12,
        unthrottled,
        holdZone: { x: zone.x, z: zone.z, radius: 12, label: `${sector.name} BLOCK` },
      };
    },
  });
}
