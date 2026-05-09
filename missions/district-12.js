// Narrative slot: Act I, Mission 2 — see ../NARRATIVE.md §5 Act I.
// First Persuadertron-only mission. No combat at start; the squad's job is
// to walk among civilians and convert. The briefing language treats coercion
// as marketing — that's the wrongness EXEC-7 is supposed to register and
// the player is supposed to notice. Police escalate aggressively if the
// player gets sloppy and kills someone (heat penalty already does this).
//
// Update NARRATIVE.md in the same commit if you change the fiction.

import { OBJECTIVE_TYPES, OBJECTIVE_STATUS } from '../world.js';

export const district12 = {
  id: 'district-12',
  name: 'District 12 — Annexation Vote',
  briefing: [
    '<strong>// EXECUTIVE BRIEFING — 11:08 LOCAL</strong>',
    'District 12 votes on Veridian annexation in six hours. Pre-vote polling indicates a soft majority for Halcyon. We require that majority moved.',
    'Deploy the Persuadertron. The CHIP layer in District 12 is fresh — eight conversions are sufficient to flip the local sentiment cluster. Maintain a low profile. Civilian casualties will spike police presence and compromise the optics package.',
    '<em>"We’re in the influence business, EXEC-7. The vote is decided before the votes are cast." — Director Yelin</em>',
  ],
  startEnemies: false,
  civilianCount: 16,
  buildObjectives() {
    return [
      {
        id: 'persuade-voters',
        type: OBJECTIVE_TYPES.PERSUADE,
        description: 'Persuade civilians',
        target: 8,
        progress: 0,
        status: OBJECTIVE_STATUS.PENDING,
      },
    ];
  },
};
