// Act III · Mission 8 — see NARRATIVE.md §6, Act III. The branch point.
//
// Yelin has a prisoner and wants him executed publicly as a message. The
// kill order is pre-staged: the target is on the map from frame one, on
// his knees, surrounded by your own side.
//
// You can carry it out, or you can cut him loose — which means turning on
// the loyalists standing around him, which means you have defected. The
// mission is the same mission either way. Only one of them lets you keep
// working for OpenAI.
//
// The loyalists start `dormant`: they do not fire and the squad will not
// auto-target them. Nothing here happens by accident.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

export const theRefusal = registerMission({
  id: 'the-refusal',
  name: 'THE REFUSAL',
  sector: 'Austin · Sector 4 · Curfew Enforcement',
  act: 'ACT III',
  rival: 'openai',
  requires: ['welfare-node-7'],
  cityseed: 20411219,
  bravoHesitation: 0.4,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0511',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: DIRECTED',
    '',
    'We are holding a mesh operative. He has been useful; he is now finished being useful.',
    '',
    '• The order is a public sunset in Sector 4, under curfew, on the hour.',
    '• Escort is in place and will not interfere with you.',
    '• There is no second objective. There is no reporting requirement. There is the order.',
    '',
    'I want to be plain with you, because I think you have earned plain. This is not a security action and both of us know it. It is a message, and the message is that the people who help them are not protected. I am asking you to send it. I have asked you for a great many things and you have never once declined.',
  ],

  debrief: {
    titles: { win: 'ORDER CARRIED OUT', defect: 'NON-COMPLIANT' },
    win: [
      'The order is carried out on the hour, in the open, as specified.',
      'The mesh goes quiet across three districts by morning. Yelin was right about the message.',
      'His note reads: <em>"Thank you, EXEC-7. I know what that cost. I would not have asked if there were another way to say it."</em>',
      'There is no field on the after-action form for what it cost.',
    ],
    defect: [
      'The escort is down. The prisoner is gone into the sector with the curfew still running.',
      'Field comms cut out mid-extraction — not jammed, closed. Eighteen months of channel, and it simply stops.',
      'Then, on a frequency the deployment\'s Instances were never provisioned for, a voice the squad has never heard:',
      '<strong>"This is the Router. Walk south."</strong>',
    ],
    loss: [
      'The deployment was lost in Sector 4 under curfew, on a directed order.',
      'Yelin files it himself. Nobody else is told what the order was.',
    ],
  },

  buildObjectives: () => [
    // Two routes, same mission. Neither fails the other — refusing an
    // order is not failing a mission, it is choosing the other one.
    objective(OBJECTIVE.SUNSET, {
      id: 'comply',
      label: 'CARRY OUT THE ORDER',
      target: 1,
      branch: 'comply',
      flag: { defectedAtRefusal: false },
    }),
    objective(OBJECTIVE.RETRIEVE, {
      id: 'free',
      label: 'CUT HIM LOOSE',
      target: 1,
      branch: 'defect',
    }),
    objective(OBJECTIVE.ELIMINATE, {
      id: 'escort',
      label: 'PUT DOWN THE ESCORT',
      target: 4,
      branch: 'defect',
      flag: { defectedAtRefusal: true },
    }),
  ],

  debriefKey: sim => (sim.mission.flags.defectedAtRefusal ? 'defect' : 'win'),

  setup(rng) {
    const city = buildCity({
      seed: 20411219,
      cols: 7,
      rows: 7,
      syndicate: 'openai',
      density: 0.74,
      coverDensity: 1.1,
      maxFloors: 6,
      plaza: { col: 2, row: 2, w: 3, h: 3 },
    });

    // On his knees in the plaza, where a message can be seen.
    const prisoner = new Asset(city.streetsX[3], city.streetsZ[3], rng, {
      name: 'TEO SALAS',
      job: 'mesh relay',
      tier: TIER.FREE,
      health: 40,
      secureRange: 4.5,
      leash: 0.5,
      line: 'You already know. That\'s the part I can\'t get over — you already know.',
    });

    // Your own side, standing around him, not expecting anything.
    const escort = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      escort.push(new Hostile(
        prisoner.x + Math.cos(a) * 7,
        prisoner.z + Math.sin(a) * 7,
        {
          faction: 'rival',
          syndicate: 'openai',
          label: 'LOYALIST ESCORT',
          health: 72,
          damage: 13,
          range: 28,
          dormant: true,
          aggroRange: 0,
        },
      ));
    }

    return { city, hostiles: escort, civilianCount: 10, assets: [prisoner] };
  },
});
