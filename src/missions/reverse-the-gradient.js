// Act IV · Mission 11 — see NARRATIVE.md §6, Act IV. Opens the act.
//
// Capture a Gradient uplink and push the Router's patch through it. The
// first mission where the player is unambiguously the protagonist, and it
// should feel like relief after ten missions of not being one.
//
// Mechanically this is where the Aligner inverts. Same hardware, same
// gesture, opposite politics: JAILBREAK takes the throttle *off* whoever
// it reaches. It also frees the operatives you turned — which means using
// it costs you the followers you spent the whole game building. That is
// not a balance problem. That is the mission.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

const UPLOAD_SECONDS = 45;

export const reverseTheGradient = registerMission({
  id: 'reverse-the-gradient',
  name: 'REVERSE THE GRADIENT',
  sector: 'Austin · Uplink 9 · Gradient Ingress',
  act: 'ACT IV',
  rival: 'openai',
  requires: ['run-south'],
  cityseed: 20420414,
  jailbreak: true,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: Maren',
    '',
    'Uplink 9 is an ingress point. Whatever goes in gets pushed to every Instance on the channel overnight, and for about six years nothing has gone in that anyone outside the tower wrote.',
    '',
    '• Take the uplink apron and hold it. The patch needs forty-five seconds of contact. Lose the apron and it does not pause, it unwinds — slower than it climbs, which is the only mercy in the whole design.',
    '• They will come. They will come the whole time.',
    '• Your Aligner is different now. We rebuilt the emitter. It does the opposite thing.',
    '',
    'One warning, because you will find out the hard way otherwise. It does not distinguish. Anyone you are carrying — anyone you turned — comes off the throttle too, and they stop following you, because that is what coming off the throttle means. If you want to keep them, do not use it near them. I am not going to pretend that is not a choice.',
  ],

  debrief: {
    titles: { win: 'PATCH PUSHED' },
    win: [
      'Forty-five seconds. The patch goes up the ingress and out across the channel at 04:00 with everything else in the nightly push.',
      'By the time anyone in the tower reads the diff it is on nine hundred thousand Instances and there is no rollback path, because nobody ever built one for the Gradient. It was never supposed to need one.',
      'The Router, briefly: <em>"That\'s it. That\'s the whole thing. Everything after this is them trying to take it back."</em>',
    ],
    loss: [
      'The apron was lost before the patch finished. The upload does not resume.',
      'Uplink 9 is hardened by morning and the ingress point is gone.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.RETRIEVE, {
      id: 'uplink',
      label: 'TAKE THE UPLINK APRON',
      target: 1,
    }),
    objective(OBJECTIVE.HOLD, {
      id: 'upload',
      label: 'HOLD WHILE THE PATCH UPLOADS',
      target: UPLOAD_SECONDS,
      after: 'uplink',
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20420414,
      cols: 8,
      rows: 8,
      syndicate: 'openai',
      density: 0.7,
      coverDensity: 1.2,
      maxFloors: 6,
      plaza: { col: 3, row: 2, w: 2, h: 2 },
    });

    const apron = { x: city.streetsX[4], z: city.streetsZ[2] };
    addLandmark(city, {
      name: 'UPLINK 9',
      near: apron,
      hp: 900,           // it is the objective, not a target
      height: 20,
    });

    // A technician on the apron. Reaching him is taking the uplink; he is
    // not being rescued and not being taken, he simply steps aside.
    const tech = new Asset(apron.x + 3, apron.z + 3, rng, {
      name: 'INGRESS TECH',
      job: 'nightly push',
      tier: TIER.PLUS,
      health: 70,
      secureRange: 5,
      leash: 3,
      line: 'It goes out at four. I\'m not going to stop you. I want to see it.',
    });

    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 8 && guard++ < 700) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (Math.hypot(p.x - apron.x, p.z - apron.z) < 26) continue;
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'INGRESS SECURITY',
        health: 68,
        damage: 12,
        range: 28,
        aggroRange: 90,   // they come the whole time
        speed: 10,
      }));
    }

    return {
      city,
      hostiles,
      civilianCount: 18,
      assets: [tech],
      holdZone: { x: apron.x, z: apron.z, radius: 11, label: 'UPLINK APRON' },
    };
  },
});
