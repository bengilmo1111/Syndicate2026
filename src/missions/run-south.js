// Act III · Mission 10 — see NARRATIVE.md §6, Act III. Closes the act.
//
// Every OpenAI asset in Austin is looking for the squad. There is no
// objective except distance. Reach the Router's safehouse on the south
// perimeter with whoever is still standing.
//
// This is the first mission the player can *finish short-handed*. Agents
// who die here are recorded as lost on the campaign, and Act IV is
// supposed to know about it. The mission does not fail for losing one —
// it fails for losing all four, like everything else — but arriving with
// two is a different debrief and it should be.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, randomStreetPoint } from '../core/city.js';
import { Hostile } from '../core/entities.js';

export const runSouth = registerMission({
  id: 'run-south',
  name: 'RUN SOUTH',
  sector: 'Austin · Sectors 4–11 · Active Pursuit',
  act: 'ACT III',
  rival: 'openai',
  requires: ['gradient-relay-4'],
  cityseed: 20420203,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: EXEC-7',
    '',
    'They have your designations, your Instance signatures and your last four routes. There is nothing clever left to do with any of that.',
    '',
    '• South perimeter. I will be there. Everything between here and there is looking for you.',
    '• All four of you inside the marker or none of it counts.',
    '• Do not stop to win anything. There is nothing down here worth winning.',
    '',
    'One more thing, and then I am off this channel. I pulled a paper file on you before I called. Not an OpenAI file — a public one, from before. You should read it somewhere you can sit down.',
  ],

  debrief: {
    titles: { win: 'SAFEHOUSE REACHED', costly: 'SAFEHOUSE REACHED' },
    win: [
      'The marker is a service door behind a decommissioned edge-compute cabinet. It is unlocked, which after eighteen months of Frontier-tier access control is its own kind of shock.',
      'The Router does not come out. A paper folder comes through the gap instead, and the door closes.',
      'Inside: a birth certificate, municipal, unremarkable, forty-one years old. <strong>MAREN ARDENT.</strong> Issued Austin. Daughter listed, one, six years of age at filing. <strong>ILSE.</strong>',
      'EXEC-7 reads the name once, aloud, in a voice the squad has not heard before.',
      'BRAVO, who has been called Maren on exactly one maintenance form, does not say anything at all.',
    ],
    costly: [
      'The marker is a service door behind a decommissioned edge-compute cabinet. It is unlocked.',
      'The Router does not come out. A paper folder comes through the gap instead, and the door closes.',
      'Inside: a birth certificate, municipal, unremarkable. <strong>MAREN ARDENT.</strong> Daughter listed, one. <strong>ILSE.</strong>',
      'EXEC-7 reads the name once, aloud. The squad that hears it is not the squad that left Sector 4, and there is no form to file about that either.',
    ],
    loss: [
      'The deployment did not reach the south perimeter.',
      'The Router waits until first light, then moves the node.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.EXTRACT, {
      id: 'safehouse',
      label: 'REACH THE SAFEHOUSE',
      target: 1,
    }),
  ],

  // Arriving short-handed is not a failure, but it is not the same ending.
  debriefKey: sim => (sim.squad.alive.length < 4 ? 'costly' : 'win'),

  setup(rng) {
    const city = buildCity({
      seed: 20420203,
      cols: 9,
      rows: 9,
      syndicate: 'openai',
      density: 0.72,
      coverDensity: 1.3,
      maxFloors: 7,
      plaza: { col: 4, row: 6, w: 2, h: 2 },
    });

    // Deploy at the north end; the safehouse is the far south perimeter.
    city.deploy = { x: city.streetsX[4], z: city.streetsZ[1] };

    // Everything in the city is looking for you. They start spread across
    // the whole block rather than clustered, so there is no safe lane.
    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 20 && guard++ < 1400) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (p.z > city.halfD * 0.55) continue; // leave the last stretch clear
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'PURSUIT',
        health: 64,
        damage: 12,
        range: 27,
        // Pursuit units, not garrison: they move faster than a standard
        // operative and they notice you from most of a block away. Still
        // slower than the squad, so running is always the right answer.
        speed: 11,
        aggroRange: 85,
        countsForObjective: false, // there is nothing down here worth winning
      }));
    }

    return {
      city,
      hostiles,
      civilianCount: 14,
      extraction: {
        x: city.streetsX[4],
        z: city.streetsZ[city.streetsZ.length - 1],
        radius: 10,
        label: 'SAFEHOUSE',
      },
    };
  },
});
