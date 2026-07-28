// Act I · Mission 1 — see NARRATIVE.md §6, Act I.
//
// Premise as briefed: an Amazon field cell squats on Sector 7's edge-compute.
// Truth: identical. This is honest work by syndicate standards. What matters
// is the framing — the briefing calls them a "squatting cell". They are people
// doing the player's job for a different employer.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile } from '../core/entities.js';

export const sector7 = registerMission({
  id: 'sector-7',
  name: 'SECTOR 7 — RECLAMATION',
  sector: 'Austin · Sector 7 · Edge-Compute Row',
  act: 'ACT I',
  rival: 'amazon',
  cityseed: 20410401,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0117',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: ROUTINE',
    '',
    'Sector 7 carries eleven megawatts of edge-compute we provisioned in \'39. An Amazon field cell has been sitting on it for six weeks, metering our racks against their delivery quotas.',
    '',
    '• Clear the cell. Five operatives on last count.',
    '• Bring down their relay pylon. It is what lets them bill our throughput.',
    '• Civilian throughput in the sector is Free-tier. Keep it that way — a spike draws local enforcement and enforcement draws paperwork.',
    '',
    'Straightforward reclamation. You have run this deployment before. OpenAI rewards focus.',
  ],

  debrief: {
    win: [
      'Sector 7 is provisioned. Eleven megawatts back on our side of the ledger.',
      'Yelin\'s note comes through before the squad has cleared the block: <em>"Clean numbers. The Board will see them Thursday."</em>',
      'Nobody asks what the Amazon operatives were told about you.',
    ],
    loss: [
      'The deployment is a total loss. Recovery will collect what the sector leaves.',
      'Four designations open in the pipeline. They will be filled by Friday.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, { label: 'CLEAR AMAZON CELL', target: 5 }),
    objective(OBJECTIVE.DEMOLISH, {
      label: 'COLLAPSE RELAY PYLON',
      target: 1,
      meta: { name: 'AMAZON RELAY PYLON' },
    }),
  ],

  /** Build the world for this mission. Returns { city, hostiles, civilianCount }. */
  setup(rng) {
    const city = buildCity({
      seed: 20410401,
      cols: 9,
      rows: 9,
      syndicate: 'amazon',
      density: 0.68,
      maxFloors: 8,
      plaza: { col: 3, row: 3, w: 3, h: 3 },
    });

    addLandmark(city, {
      name: 'AMAZON RELAY PYLON',
      near: { x: -city.halfW * 0.35, z: -city.halfD * 0.3 },
      hp: 520,
      height: 24,
      syndicateTrim: 0xffab4a,
    });

    // The cell holds the far half of the block; the squad deploys south, so
    // the first contact is a decision rather than an ambush.
    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 5 && guard++ < 400) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (p.z > -city.halfD * 0.1) continue;
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'amazon',
        label: 'AMAZON FIELD',
        health: 58,
        damage: 11,
      }));
    }

    return { city, hostiles, civilianCount: 22 };
  },
});
