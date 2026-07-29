// Act I · Mission 4 — see NARRATIVE.md §6, Act I. Closes Act I.
//
// Premise as briefed: a terror cell under a derelict overpass. Eliminate it.
// Truth: they are unquantized civilians. Crude weapons, no armour, no comms.
// This is the first time the briefing has lied.
//
// The lie is meant to be legible from how they fight, not only from the
// debrief. So: they break and run once two of them are down, they speak
// while they die, and the Aligner returns no handshake — which is how the
// player finds out what an unquantized Instance is, and what they've just
// been sent to do about it.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, randomStreetPoint } from '../core/city.js';
import { Unquantized } from '../core/entities.js';

export const theBracket = registerMission({
  id: 'the-bracket',
  name: 'THE BRACKET — TERROR CELL',
  sector: 'Austin · Sub-Sector 19 · Decommissioned Overpass',
  act: 'ACT I',
  rival: 'none',
  cityseed: 20410729,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0341',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: COUNTER-THREAT',
    '',
    'A cell calling itself the Bracket has been operating out of the decommissioned overpass in Sub-Sector 19. Six confirmed. They are believed responsible for interference with metering infrastructure across three districts.',
    '',
    '• Eliminate the cell. Six on last count.',
    '• Sub-Sector 19 was cleared for redevelopment in \'39, so civilian presence is negligible. You will not need the Aligner.',
    '• There is no rival syndicate here. This is a public-safety action.',
    '',
    'I know counter-threat work is not what you were promoted for. Someone competent has to do it, and the alternative is a district that stops paying for its own electricity. OpenAI rewards focus.',
  ],

  debrief: {
    titles: { win: 'SUB-SECTOR CLEARED' },
    win: [
      'Sub-Sector 19 is clear. Yelin signs it off inside the hour as a textbook counter-threat action and forwards it to the Board as a case study.',
      'The after-action asks for a count and a duration. There is no field on the form for anything else.',
      '<em>They didn\'t fight like terrorists.</em>',
    ],
    loss: [
      'The deployment was lost to six people with improvised weapons and no comms.',
      'Yelin does not send a note. The incident is filed under equipment.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, { label: 'ELIMINATE THE BRACKET', target: 6 }),
  ],

  setup(rng) {
    // Cleared for redevelopment in '39 and never redeveloped. Low, sparse,
    // and most of the street furniture is already rubble.
    const city = buildCity({
      seed: 20410729,
      cols: 7,
      rows: 7,
      syndicate: 'none',
      density: 0.46,
      coverDensity: 1.9,
      derelict: 0.55,
      maxFloors: 4,
      plaza: { col: 2, row: 2, w: 3, h: 3 },
    });

    // They hold together as a group — losing two of them breaks the rest.
    const group = { members: [] };
    let guard = 0;
    while (group.members.length < 6 && guard++ < 500) {
      const p = randomStreetPoint(city, rng, 2.2);
      if (p.z > -city.halfD * 0.05) continue;
      group.members.push(new Unquantized(p.x, p.z, rng, group));
    }

    return { city, hostiles: group.members, civilianCount: 3 };
  },
});
