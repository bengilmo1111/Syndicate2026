// Act II · Mission 5 — see NARRATIVE.md §6, Act II. Opens the act.
//
// Premise as briefed: a journalist is compromising sensitive operations
// data. Truth: Priya Okafor is reporting on ghost inference — compute
// silently billed to civilian Instances for jobs that aren't theirs. The
// story is true. Killing her does not stop it; her co-author files anyway.
//
// Mechanically this is a positioning mission, not a damage one. She runs
// when approached, so the Aligner is useless and a bigger gun solves
// nothing. You have to cut her off.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, randomStreetPoint } from '../core/city.js';
import { Hostile, Quarry, TIER } from '../core/entities.js';

export const okaforContract = registerMission({
  id: 'okafor-contract',
  name: 'THE OKAFOR CONTRACT',
  sector: 'Austin · Riverside · Press Row',
  act: 'ACT II',
  rival: 'none',
  requires: ['the-bracket'],
  cityseed: 20410903,
  // NARRATIVE.md §6 Act II — BRAVO starts to glitch here.
  bravoHesitation: 0.4,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0402',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: SEALED',
    '',
    'Priya Okafor files for an independent syndication desk on Press Row. Her next filing window opens in forty minutes and contains material drawn from our reconciliation logs.',
    '',
    '• Close the contract before the window. You have about two and a half minutes.',
    '• She retains private security. Two, possibly three.',
    '• She will run. Cut the block off rather than chasing her down it.',
    '• The squad will not engage her on its own. This one is yours to order.',
    '',
    'I am aware of how this reads. The material is a misreading of a billing artefact, and a misreading published at volume is indistinguishable from a fact. We are not silencing a journalist, EXEC-7. We are preventing a correction that would take four years.',
  ],

  debrief: {
    titles: { win: 'CONTRACT CLOSED', escaped: 'FILING WINDOW MISSED' },
    win: [
      'The contract is closed inside the window. Yelin\'s note is one line: <em>"Thank you. I know."</em>',
      'The filing goes out on schedule anyway. Okafor had a co-author, listed second, working from the same logs.',
      'The correction it would have taken four years to make is now going to take four years.',
    ],
    escaped: [
      'Okafor cleared Press Row and the window opened on time.',
      'Legal has the filing. Communications has a statement. Neither department asks EXEC-7 anything.',
    ],
    loss: [
      'The deployment was lost on a sealed contract in a civilian district.',
      'There is no version of this incident that Communications can describe.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, {
      id: 'okafor',
      label: 'CLOSE THE CONTRACT',
      target: 1,
      // Let her off the block and the mission is over — the point is that
      // you cannot solve this by out-shooting anyone.
      failed: s => s.quarry.some(q => q.escaped),
      failReason: 'escaped',
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20410903,
      cols: 8,
      rows: 8,
      syndicate: 'openai',
      density: 0.78,
      coverDensity: 1.4,
      maxFloors: 7,
      plaza: { col: 3, row: 3, w: 2, h: 2 },
    });

    const okafor = new Quarry(city.streetsX[4], city.streetsZ[2], rng, {
      name: 'PRIYA OKAFOR',
      job: 'syndication desk',
      tier: TIER.PRO,
      health: 60,
      fleeFrom: 26,
      window: 150,
      line: 'Tell Ilse I\'ll be late again.',
    });

    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 3 && guard++ < 300) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (Math.hypot(p.x - okafor.x, p.z - okafor.z) > 45) continue;
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'PRIVATE SECURITY',
        health: 66,
        damage: 12,
        range: 27,
        countsForObjective: false, // only the contract counts
      }));
    }

    return { city, hostiles, civilianCount: 26, quarry: [okafor] };
  },
});
