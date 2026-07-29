// Act III · Mission 9 — see NARRATIVE.md §6, Act III.
//
// Take down a Gradient relay. For the duration, every civilian in the
// sector is off the update channel — not throttled, not aligned, not
// receiving. This is what people look like without a rate limit.
//
// Some of them sing. Some weep. Some embrace strangers. Some loot. The
// script does not pick a side on that and neither should any future
// tuning pass: the mix is the argument. If it ever reads as uniformly
// joyful it becomes propaganda, and if it reads as uniformly ugly it
// becomes Yelin's slide deck.
//
// The Aligner does nothing here. There is no channel left to speak on,
// which is the first time the player's signature tool has simply had
// nothing to say.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile } from '../core/entities.js';

const NODES = 4;

export const gradientRelay4 = registerMission({
  id: 'gradient-relay-4',
  name: 'GRADIENT RELAY 4 — SABOTAGE',
  sector: 'Austin · Relay 4 · Gradient Distribution',
  act: 'ACT III',
  rival: 'openai',
  requires: ['the-refusal'],
  cityseed: 20420118,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: whoever is listening on this',
    '',
    'Relay 4 pushes the Gradient to everything inside nine kilometres. Four generator nodes hold it up. Take all four and the sector comes off the channel until somebody drives out here with a truck.',
    '',
    '• Four nodes. They are not hidden and they are not guarded well.',
    '• OpenAI will send people. They will not be expecting you specifically.',
    '• Your Aligner will not work down there. Nothing will be listening.',
    '',
    'I am not going to tell you what you will see. You have been managing this city for eighteen months and you have never once seen it off the channel. Look at it properly. That is the whole reason I asked.',
  ],

  debrief: {
    titles: { win: 'RELAY DOWN' },
    win: [
      'Four nodes down. Relay 4 stops pushing at 03:11 and the sector comes off the channel for six hours.',
      'What the squad walks back through is not one thing. Somebody is singing badly on a corner. Somebody is sitting on a kerb and cannot stop crying. Two people who have plainly never met are holding onto each other. A man is methodically emptying a provisioning kiosk and does not look up.',
      'The Router, on the way out: <em>"This is the city you were employed to manage. Look at it. This is the part they don\'t bill for."</em>',
      'He does not say whether it is better. EXEC-7 does not ask.',
    ],
    loss: [
      'The deployment was lost under Relay 4. The channel never dropped.',
      'The sector wakes up on schedule and does not know anything happened.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.DEMOLISH, {
      id: 'nodes',
      label: 'DROP THE GENERATOR NODES',
      target: NODES,
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20420118,
      cols: 8,
      rows: 8,
      syndicate: 'openai',
      density: 0.66,
      coverDensity: 1.2,
      maxFloors: 6,
      plaza: { col: 3, row: 3, w: 2, h: 2 },
    });

    // Four nodes, spread so the mission is a circuit rather than a corner.
    const spread = [
      { x: -city.halfW * 0.45, z: -city.halfD * 0.45 },
      { x: city.halfW * 0.45, z: -city.halfD * 0.45 },
      { x: -city.halfW * 0.45, z: city.halfD * 0.2 },
      { x: city.halfW * 0.45, z: city.halfD * 0.2 },
    ];
    spread.forEach((near, i) => addLandmark(city, {
      name: `GENERATOR NODE ${i + 1}`,
      near,
      hp: 300,
      height: 15,
    }));

    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 5 && guard++ < 400) {
      const p = randomStreetPoint(city, rng, 2.4);
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'RELAY SECURITY',
        health: 70,
        damage: 12,
        range: 28,
      }));
    }

    return {
      city,
      hostiles,
      civilianCount: 30,
      // The sector is already off the channel when you arrive — the relay
      // has been failing for hours, which is why the Router picked tonight.
      unthrottled: true,
    };
  },
});
