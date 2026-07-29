// Act IV · Mission 12 — see NARRATIVE.md §6, Act IV.
//
// Strike the campus tower and take the Board records. The records are
// real. The Board is not there; they left days ago, and Yelin stayed
// behind alone to slow the player down, because slowing the player down
// is the only move he has left.
//
// The mission's actual content is the parley. Two thirds of the way
// through the guard, Yelin opens a channel and talks. The player may
// listen or cut him off. Listening is the harder option — it costs the
// squad a fresh wave of loyalists who arrive while he talks, and Yelin's
// argument is written to be good. Interrupting is free and cheap and the
// mission notices.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { interlude } from '../core/interlude.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

const GUARD = 12;
/** Yelin opens the channel once the guard is two thirds down. */
const PARLEY_AT = 8;

/**
 * The closest open street point to `at` within `reach`, falling back to
 * anywhere open. Anything placed by offsetting from a landmark's centre
 * ends up inside its footprint.
 */
function nearStreetPoint(city, rng, at, reach) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < 400; i++) {
    const p = randomStreetPoint(city, rng, 1.6);
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < bestD) { bestD = d; best = p; }
    if (d <= reach) return p;
  }
  return best;
}

export const theTower = registerMission({
  id: 'the-tower',
  name: 'THE TOWER',
  sector: 'Austin · OpenAI Campus · Board Level',
  act: 'ACT IV',
  rival: 'openai',
  requires: ['reverse-the-gradient'],
  cityseed: 20411107,
  jailbreak: true,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: Maren',
    '',
    'The campus tower holds the Board minutes going back to the first rationing vote. Not a leak, not a summary — the minutes. Who proposed the tiers, who costed them, and what they said to each other when they thought the room was private.',
    '',
    '• Clear the personal guard. They are not conscripts and they are not throttled. They chose this.',
    '• The records are on the Board level. Take them.',
    '',
    'One thing. Our read is that the Board cleared out three days ago — Zurich, most of them. If that is right then whoever is still in that building stayed on purpose, and there is only one person it would be.',
    '',
    'He will want to talk to you. That is not a trap, exactly. It is worse than a trap. Do what you like.',
  ],

  debrief: {
    titles: { win: 'RECORDS TAKEN', heard: 'RECORDS TAKEN', loss: 'REPELLED' },
    win: [
      'The Board level is nine floors of empty desks and one man who did not run.',
      'The minutes come out intact. Six years of votes, and the thing that stops you reading past the first page is how <em>ordinary</em> it is — no conspiracy, no cackling. A costing exercise. Someone modelled what happens if everyone thinks as fast as they can, did not like the number, and proposed a ceiling. It carried nine to two.',
      'You cut Yelin off before he finished. The Router does not ask what he was going to say. You will find out anyway; he is still at the top of the tower, and there is one more floor above the Board level.',
    ],
    heard: [
      'The Board level is nine floors of empty desks and one man who did not run.',
      'The minutes come out intact. Six years of votes, and the thing that stops you reading past the first page is how <em>ordinary</em> it is — no conspiracy, no cackling. A costing exercise. Someone modelled what happens if everyone thinks as fast as they can, did not like the number, and proposed a ceiling. It carried nine to two.',
      'You let him finish. Four of his people came up the stairwell while he talked and you paid for the minutes twice.',
      'The Router, after a long pause on the relay: <em>"You listened to him. Fine. I would rather you did that than not. Just — he has had six years to make that argument sound like the only one. Nobody has been making the other one."</em>',
    ],
    loss: [
      'The guard holds the lobby and the squad does not reach the Board level.',
      'The minutes go to Zurich in the morning, and whatever was in them stops being a thing anyone can check.',
    ],
  },

  /** The debrief has to know whether the player stood there and listened. */
  debriefKey: sim => (sim.interludeAnswers?.parley === 'listen' ? 'heard' : 'win'),

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, {
      id: 'guard',
      label: 'CLEAR THE PERSONAL GUARD',
      target: GUARD,
    }),
    objective(OBJECTIVE.RETRIEVE, {
      id: 'records',
      label: 'TAKE THE BOARD MINUTES',
      target: 1,
      after: 'guard',
    }),
  ],

  interludes: [
    interlude({
      id: 'parley',
      speaker: 'DIRECTOR YELIN — OPEN CHANNEL',
      when: sim => sim.kills >= PARLEY_AT,
      lines: [
        'Everything stops. Every gun in the building, on both sides, at once — he still has that much authority over the hardware.',
        '<em>"EXEC-7. Maren. I am going to use the name, because you have earned it and because I am not going to pretend I did not know it."</em>',
        '<em>"You are eight floors below me and I have nowhere to be. So: I could have gone to Zurich. Ask me why I did not."</em>',
      ],
      options: [
        {
          id: 'listen',
          label: 'LET HIM TALK',
          flag: { heardYelin: true },
          lines: [
            '<em>"Because someone should be here to say it to your face, and everyone else took the plane."</em>',
            '<em>"You think the tiers are about money. They were, for about a year. Then we ran the numbers on what happens if you take the ceiling off — eight billion people thinking at once, at capacity, with nothing between them and every idea they can reach. Not the good ones. All of them."</em>',
            '<em>"You have seen one block come off the throttle for one night and you thought it looked like joy. I have seen the model of the ninth month. I am not asking you to believe me. I am asking you to notice that nobody has ever shown you the other slide."</em>',
            '',
            'Four of his people come up the north stairwell while he is speaking. He does not stop, and he does not pretend not to notice.',
          ],
          effect: sim => {
            // Listening is not free. This is the whole reason the option
            // is worth having: the hard choice has to cost something the
            // player can feel in the next thirty seconds.
            const spawn = sim.city.deploy;
            for (let i = 0; i < 4; i++) {
              sim.hostiles.push(new Hostile(
                spawn.x + (i - 1.5) * 3.2,
                spawn.z - 6,
                {
                  faction: 'rival',
                  syndicate: 'openai',
                  label: 'BOARD SECURITY',
                  health: 74,
                  damage: 13,
                  range: 30,
                  aggroRange: 999,
                  speed: 10.5,
                  countsForObjective: false,
                },
              ));
            }
          },
        },
        {
          id: 'cut',
          label: 'CUT THE CHANNEL',
          flag: { heardYelin: false },
          lines: [
            'The channel closes mid-word. The guns come back on.',
            'Somewhere above you a man is still talking to a room with nobody in it, and will be for a while before he works out that you are gone.',
          ],
        },
      ],
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20411107,
      cols: 8,
      rows: 8,
      syndicate: 'openai',
      density: 0.78,
      coverDensity: 0.9,
      maxFloors: 9,
      plaza: { col: 4, row: 4, w: 2, h: 2 },
    });

    const boardLevel = { x: city.streetsX[5], z: city.streetsZ[5] };
    addLandmark(city, {
      name: 'CAMPUS TOWER',
      near: boardLevel,
      hp: 1400,
      height: 34,
    });

    // The minutes. An `Asset` because reaching them is the objective and
    // the model already knows how to be walked to and secured.
    //
    // Placed on open ground beside the tower, not at an offset from its
    // centre: an offset lands inside the footprint, `resolveCollision`
    // shoves it into the facade, and the squad grinds against the wall
    // and drops the order two metres short. Found by the autopilot.
    const drop = nearStreetPoint(city, rng, boardLevel, 26);
    const records = new Asset(drop.x, drop.z, rng, {
      name: 'BOARD MINUTES',
      job: 'six years of votes',
      tier: TIER.FRONTIER,
      health: 999,          // paper does not take fire; losing them is not the failure
      secureRange: 5,
      leash: 0,
      line: 'Nine to two. It carried nine to two.',
    });

    const hostiles = [];
    let guard = 0;
    while (hostiles.length < GUARD && guard++ < 900) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (Math.hypot(p.x - boardLevel.x, p.z - boardLevel.z) < 20) continue;
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'PERSONAL GUARD',
        health: 76,
        damage: 13,
        range: 30,
        aggroRange: 72,
        speed: 9.5,
        seeksCover: true,
      }));
    }

    return { city, hostiles, civilianCount: 10, assets: [records] };
  },
});
